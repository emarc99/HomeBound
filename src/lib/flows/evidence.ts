import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { evidence, parties, payments, projects, stages, type EvidenceVerdict, type StageStatus } from "@/db/schema";
import { appendLedger } from "@/lib/ledger";
import { putBlob } from "@/lib/blobs";
import { distanceMeters, hammingDistance, processPhoto } from "@/lib/evidence/image";
import { assessStagePhoto, isGeminiConfigured, type PhotoAssessment } from "@/lib/ai/verify-photo";
import { FlowError } from "./payments";

type Check = EvidenceVerdict["checks"][number];

export const CHECK = {
  time: "Taken during this stage",
  place: "Taken at the site",
  reuse: "Not a reused photo",
  ai: "Shows what counts as done",
  genuine: "Looks like a real site photo",
} as const;

const NEAR_DUPLICATE_BITS = 6;
const EARLY_GRACE_DAYS = 3;
const MIN_PASS_CONFIDENCE = 0.6;

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export async function findForeman(projectId: string) {
  const db = await getDb();
  const [foreman] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.projectId, projectId), eq(parties.role, "foreman")));
  return foreman ?? null;
}

export async function submitStagePhoto(input: { stageId: string; file: Buffer; uploadedById: string | null; actor: string }) {
  const db = await getDb();
  const [stage] = await db.select().from(stages).where(eq(stages.id, input.stageId));
  if (!stage) throw new FlowError("Stage not found");
  if (stage.status === "paid") throw new FlowError("This stage is already paid; no more evidence is needed.");
  const [project] = await db.select().from(projects).where(eq(projects.id, stage.projectId));

  const { meta, jpeg } = await processPhoto(input.file);

  const reuseCheck = (async (): Promise<Check> => {
    const prior = await db
      .select({ id: evidence.id, sha256: evidence.sha256, dhash: evidence.dhash, createdAt: evidence.createdAt, stageId: evidence.stageId, projectId: evidence.projectId })
      .from(evidence)
      .where(and(eq(evidence.kind, "photo"), isNotNull(evidence.dhash)));
    const exact = prior.find((p) => p.sha256 === meta.sha256);
    const near = exact ?? prior.find((p) => p.dhash && hammingDistance(p.dhash, meta.dhash) <= NEAR_DUPLICATE_BITS);
    if (!near) return { name: CHECK.reuse, status: "pass", detail: "No earlier photo on Homebound looks like this one." };
    const where = near.projectId === project.id ? "this project" : "another Homebound project";
    return {
      name: CHECK.reuse,
      status: "fail",
      detail: `${exact ? "The same file" : "A near-identical photo"} was already submitted on ${where} on ${fmtDate(near.createdAt)}.`,
    };
  })();

  const aiCheck = (async (): Promise<{ check: Check; assessment: PhotoAssessment | null; model: string | null }> => {
    if (!isGeminiConfigured()) {
      return { check: { name: CHECK.ai, status: "unavailable", detail: "AI review is not configured." }, assessment: null, model: null };
    }
    try {
      const { assessment, model } = await assessStagePhoto({
        image: jpeg,
        stageName: stage.name,
        stageDescription: stage.description,
        acceptanceCriteria: stage.acceptanceCriteria,
        siteLabel: `${project.siteCity}, ${project.siteState}, Nigeria`,
      });
      const met = assessment.criteria.filter((c) => c.status === "met").length;
      return {
        check: {
          name: CHECK.ai,
          status: assessment.verdict === "pass" ? "pass" : assessment.verdict === "fail" ? "fail" : "unavailable",
          detail: `${met} of ${assessment.criteria.length} criteria visibly met (confidence ${Math.round(assessment.confidence * 100)}%).`,
        },
        assessment,
        model,
      };
    } catch (err) {
      console.error("photo assessment failed", err);
      return {
        check: { name: CHECK.ai, status: "unavailable", detail: "AI review is unavailable right now; try again or review it yourself." },
        assessment: null,
        model: null,
      };
    }
  })();

  const [previousRelease] = stage.dependsOnStageId
    ? await db
        .select({ at: payments.updatedAt })
        .from(payments)
        .where(and(eq(payments.stageId, stage.dependsOnStageId), eq(payments.kind, "labor"), eq(payments.status, "completed")))
    : [];
  const actualStart = previousRelease && previousRelease.at < stage.startDate ? previousRelease.at : stage.startDate;

  const timeCheck: Check = (() => {
    if (!meta.takenAt) return { name: CHECK.time, status: "unavailable", detail: "The photo has no capture time (often stripped by chat apps)." };
    const earliest = new Date(actualStart.getTime() - EARLY_GRACE_DAYS * 86_400_000);
    const latest = new Date(Date.now() + 86_400_000);
    if (meta.takenAt < earliest) {
      return { name: CHECK.time, status: "fail", detail: `Taken ${fmtDate(meta.takenAt)}, before this stage started on ${fmtDate(actualStart)}.` };
    }
    if (meta.takenAt > latest) return { name: CHECK.time, status: "fail", detail: `Capture time ${fmtDate(meta.takenAt)} is in the future.` };
    return { name: CHECK.time, status: "pass", detail: `Taken ${fmtDate(meta.takenAt)}.` };
  })();

  const placeCheck: Check = (() => {
    if (meta.lat == null || meta.lng == null) {
      return { name: CHECK.place, status: "unavailable", detail: "The photo has no GPS location, so we can't confirm it was taken on site." };
    }
    const d = distanceMeters(meta.lat, meta.lng, project.siteLat, project.siteLng);
    if (d <= project.siteRadiusM) return { name: CHECK.place, status: "pass", detail: `Taken ${Math.round(d)} m from the site pin.` };
    const away = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    return { name: CHECK.place, status: "fail", detail: `Taken ${away} from the site, outside the ${project.siteRadiusM} m boundary.` };
  })();

  const [reuse, ai] = await Promise.all([reuseCheck, aiCheck]);
  const a = ai.assessment;
  const genuineCheck: Check = !a
    ? { name: CHECK.genuine, status: "unavailable", detail: "Needs the AI review to judge." }
    : { name: CHECK.genuine, status: a.authenticity === "genuine_site_photo" ? "pass" : "fail", detail: a.authenticityNote };
  const checks = [ai.check, genuineCheck, placeCheck, timeCheck, reuse];

  const integrityFailed = [placeCheck, timeCheck, reuse].some((c) => c.status === "fail");
  const verdict: EvidenceVerdict["verdict"] = !a
    ? "needs_review"
    : a.verdict === "fail"
      ? "fail"
      : integrityFailed || a.authenticity === "suspect"
        ? "needs_review"
        : a.verdict === "pass" && a.confidence >= MIN_PASS_CONFIDENCE && placeCheck.status === "pass"
          ? "pass"
          : "needs_review";

  const blobKey = await putBlob(db, jpeg, "image/jpeg");
  const [row] = await db
    .insert(evidence)
    .values({
      projectId: project.id,
      stageId: stage.id,
      kind: "photo",
      uploadedById: input.uploadedById,
      blobKey,
      mime: "image/jpeg",
      sha256: meta.sha256,
      dhash: meta.dhash,
      takenAt: meta.takenAt,
      lat: meta.lat,
      lng: meta.lng,
      verdict: {
        verdict,
        confidence: a?.confidence ?? 0,
        observations: a?.observations ?? [],
        checks,
        extracted: {
          criteria: a?.criteria ?? [],
          authenticity: a?.authenticity ?? null,
          authenticityNote: a?.authenticityNote ?? null,
          camera: meta.camera,
        },
        model: ai.model ?? "none",
      },
    })
    .returning();

  const advanceFrom: StageStatus[] = verdict === "pass" ? ["funded", "in_progress", "evidence_submitted"] : ["funded", "in_progress"];
  await db
    .update(stages)
    .set({ status: verdict === "pass" ? "verified" : "evidence_submitted" })
    .where(and(eq(stages.id, stage.id), inArray(stages.status, advanceFrom)));

  await appendLedger(db, {
    projectId: project.id,
    type: "evidence.photo_submitted",
    actor: input.actor,
    payload: {
      evidenceId: row.id,
      stageId: stage.id,
      sha256: meta.sha256,
      verdict,
      checks: Object.fromEntries(checks.map((c) => [c.name, c.status])),
      model: ai.model,
    },
  });
  return row;
}
