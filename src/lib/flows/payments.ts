import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { payments, stages, projects, parties, evidence, materialRequests, inspections } from "@/db/schema";
import type { PaymentStatus } from "@/db/schema";
import { appendLedger } from "@/lib/ledger";
import { centsToUsdString, usdCentsToNgn } from "@/lib/money";
import { createFundingOrder, captureOrder, captureFromOrder, getOrder } from "@/lib/paypal/orders";
import { sendPayout, getPayoutBatch, type PayoutItemStatus } from "@/lib/paypal/payouts";

export class FlowError extends Error {}

async function loadStage(db: Db, stageId: string) {
  const [stage] = await db.select().from(stages).where(eq(stages.id, stageId));
  if (!stage) throw new FlowError("Stage not found");
  const [project] = await db.select().from(projects).where(eq(projects.id, stage.projectId));
  return { stage, project };
}

export async function startStageFunding(stageId: string, actor: string): Promise<{ approveUrl: string }> {
  const db = await getDb();
  const { stage, project } = await loadStage(db, stageId);

  const existing = await db
    .select()
    .from(payments)
    .where(and(eq(payments.stageId, stageId), eq(payments.kind, "funding")));
  if (existing.some((p) => p.status === "completed")) throw new FlowError("This stage is already funded.");
  const open = existing.find((p) => p.status === "created" && p.paypalOrderId);
  if (open) {
    const order = await getOrder(open.paypalOrderId!);
    const href = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (href && order.status !== "COMPLETED") return { approveUrl: href };
  }

  const [payment] = await db
    .insert(payments)
    .values({
      projectId: project.id,
      stageId,
      kind: "funding",
      direction: "in",
      amountUsdCents: stage.laborTrancheUsdCents,
      amountNgn: usdCentsToNgn(stage.laborTrancheUsdCents, project.ngnPerUsd),
      status: "created",
      idempotencyKey: `fund-${stageId}-${crypto.randomUUID()}`,
    })
    .returning();

  const order = await createFundingOrder({
    paymentId: payment.id,
    stageId,
    amountUsd: centsToUsdString(stage.laborTrancheUsdCents),
    description: `${project.name}: stage ${stage.seq} ${stage.name} labor tranche`,
    brandName: "Homebound",
  });

  await db.update(payments).set({ paypalOrderId: order.id, updatedAt: new Date() }).where(eq(payments.id, payment.id));
  await appendLedger(db, {
    projectId: project.id,
    type: "funding.order_created",
    actor,
    payload: { stageId, paymentId: payment.id, paypalOrderId: order.id, amountUsdCents: stage.laborTrancheUsdCents },
  });
  return { approveUrl: order.approveUrl };
}

export async function completeFunding(paymentId: string, actor: string): Promise<{ status: PaymentStatus }> {
  const db = await getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment || payment.kind !== "funding" || !payment.paypalOrderId) throw new FlowError("Funding payment not found");
  if (payment.status === "completed") return { status: "completed" };

  const order = await captureOrder(payment.paypalOrderId, payment.id);
  const { captureId, status } = captureFromOrder(order);
  return applyCaptureStatus(db, payment.id, captureId, status, actor);
}

export async function applyCaptureStatus(
  db: Db,
  paymentId: string,
  captureId: string | null,
  captureStatus: string | null,
  actor: string,
): Promise<{ status: PaymentStatus }> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) throw new FlowError("Payment not found");
  if (payment.status === "completed") return { status: "completed" };

  const next: PaymentStatus =
    captureStatus === "COMPLETED" ? "completed" : captureStatus === "DECLINED" || captureStatus === "FAILED" ? "failed" : "pending";
  await db
    .update(payments)
    .set({ status: next, paypalCaptureId: captureId, updatedAt: new Date() })
    .where(eq(payments.id, paymentId));

  if (next === "completed" && payment.stageId) {
    await db
      .update(stages)
      .set({ status: "funded" })
      .where(and(eq(stages.id, payment.stageId), inArray(stages.status, ["planned", "blocked"])));
  }
  await appendLedger(db, {
    projectId: payment.projectId,
    type: next === "completed" ? "funding.captured" : `funding.${next}`,
    actor,
    payload: { paymentId, stageId: payment.stageId, paypalOrderId: payment.paypalOrderId, captureId, captureStatus },
  });
  return { status: next };
}

async function payout(
  db: Db,
  input: {
    projectId: string;
    stageId?: string | null;
    lineItemId?: string | null;
    materialRequestId?: string | null;
    inspectionId?: string | null;
    kind: "labor" | "material" | "inspection";
    amountUsdCents: number;
    ngnPerUsd: number;
    payeeId: string;
    idempotencyKey: string;
    note: string;
    approvedBy: string;
  },
) {
  const [payee] = await db.select().from(parties).where(eq(parties.id, input.payeeId));
  if (!payee?.paypalEmail) throw new FlowError(`${payee?.name ?? "Payee"} has no PayPal account linked yet.`);

  const [existing] = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey));
  if (existing && existing.status !== "failed") return existing;

  const [payment] = existing
    ? await db.update(payments).set({ status: "created", updatedAt: new Date() }).where(eq(payments.id, existing.id)).returning()
    : await db
        .insert(payments)
        .values({
          projectId: input.projectId,
          stageId: input.stageId ?? null,
          lineItemId: input.lineItemId ?? null,
          materialRequestId: input.materialRequestId ?? null,
          inspectionId: input.inspectionId ?? null,
          kind: input.kind,
          direction: "out",
          amountUsdCents: input.amountUsdCents,
          amountNgn: usdCentsToNgn(input.amountUsdCents, input.ngnPerUsd),
          payeeId: payee.id,
          status: "created",
          idempotencyKey: input.idempotencyKey,
          approvedBy: input.approvedBy,
        })
        .returning();

  const res = await sendPayout({
    paymentId: payment.id,
    attemptId: existing?.payoutBatchId ? `${payment.id}-after-${existing.payoutBatchId}` : payment.id,
    receiverEmail: payee.paypalEmail,
    amountUsd: centsToUsdString(input.amountUsdCents),
    note: input.note,
    subject: "You have a Homebound payment",
  });
  const [updated] = await db
    .update(payments)
    .set({ status: "pending", payoutBatchId: res.batchId, updatedAt: new Date() })
    .where(eq(payments.id, payment.id))
    .returning();
  await appendLedger(db, {
    projectId: input.projectId,
    type: `payout.sent`,
    actor: input.approvedBy,
    payload: {
      paymentId: payment.id,
      kind: input.kind,
      payee: payee.name,
      amountUsdCents: input.amountUsdCents,
      payoutBatchId: res.batchId,
      stageId: input.stageId ?? null,
      materialRequestId: input.materialRequestId ?? null,
      inspectionId: input.inspectionId ?? null,
    },
  });
  return updated;
}

export async function releaseLaborPayout(stageId: string, actor: string, overrideReason?: string) {
  const db = await getDb();
  const { stage, project } = await loadStage(db, stageId);
  if (stage.status === "paid") throw new FlowError("This stage has already been paid.");
  const fundings = await db
    .select()
    .from(payments)
    .where(and(eq(payments.stageId, stageId), eq(payments.kind, "funding"), eq(payments.status, "completed")));
  if (fundings.reduce((a, p) => a + p.amountUsdCents, 0) < stage.laborTrancheUsdCents) {
    throw new FlowError("Fund this stage through PayPal before releasing the labor payment.");
  }
  const photos = await db.select().from(evidence).where(and(eq(evidence.stageId, stageId), eq(evidence.kind, "photo")));
  const passed = photos.some((p) => p.verdict?.verdict === "pass");
  if (!passed && !overrideReason?.trim()) {
    throw new FlowError("No site photo has passed verification yet. Add a reason to release anyway.");
  }
  if (!stage.contractorId) throw new FlowError("No contractor assigned to this stage.");

  const result = await payout(db, {
    projectId: project.id,
    stageId,
    kind: "labor",
    amountUsdCents: stage.laborTrancheUsdCents,
    ngnPerUsd: project.ngnPerUsd,
    payeeId: stage.contractorId,
    idempotencyKey: `labor-${stageId}`,
    note: `Homebound: labor for stage ${stage.seq} (${stage.name}) at ${project.name}.`,
    approvedBy: actor,
  });
  if (overrideReason?.trim()) {
    await appendLedger(db, {
      projectId: project.id,
      type: "payout.override",
      actor,
      payload: { stageId, reason: overrideReason.trim() },
    });
  }
  return result;
}

export async function releaseMaterialPayout(materialRequestId: string, actor: string) {
  const db = await getDb();
  const [req] = await db.select().from(materialRequests).where(eq(materialRequests.id, materialRequestId));
  if (!req) throw new FlowError("Material request not found");
  if (req.status === "rejected") throw new FlowError("This request was rejected.");
  const [project] = await db.select().from(projects).where(eq(projects.id, req.projectId));
  const amountNgn = Math.round(req.qty * req.unitPriceNgn);
  const amountUsdCents = Math.round((amountNgn / project.ngnPerUsd) * 100);
  const result = await payout(db, {
    projectId: project.id,
    lineItemId: req.lineItemId,
    materialRequestId: req.id,
    kind: "material",
    amountUsdCents,
    ngnPerUsd: project.ngnPerUsd,
    payeeId: req.supplierId,
    idempotencyKey: `material-${req.id}`,
    note: `Homebound: ${req.qty} units for ${project.name}.`,
    approvedBy: actor,
  });
  await db.update(materialRequests).set({ status: "approved" }).where(eq(materialRequests.id, req.id));
  return result;
}

export async function releaseInspectionPayout(inspectionId: string, actor: string) {
  const db = await getDb();
  const [insp] = await db.select().from(inspections).where(eq(inspections.id, inspectionId));
  if (!insp) throw new FlowError("Inspection not found");
  if (insp.status !== "reported") throw new FlowError("The inspector has not submitted a report yet.");
  const [project] = await db.select().from(projects).where(eq(projects.id, insp.projectId));
  return payout(db, {
    projectId: project.id,
    stageId: insp.stageId,
    inspectionId: insp.id,
    kind: "inspection",
    amountUsdCents: insp.feeUsdCents,
    ngnPerUsd: project.ngnPerUsd,
    payeeId: insp.inspectorId,
    idempotencyKey: `inspection-${insp.id}`,
    note: `Homebound: site inspection fee for ${project.name}.`,
    approvedBy: actor,
  });
}

const ITEM_STATUS: Record<PayoutItemStatus, PaymentStatus> = {
  SUCCESS: "completed",
  FAILED: "failed",
  PENDING: "pending",
  UNCLAIMED: "unclaimed",
  RETURNED: "returned",
  ONHOLD: "pending",
  BLOCKED: "failed",
  REFUNDED: "refunded",
  REVERSED: "refunded",
  DENIED: "failed",
};

export async function applyPayoutItemStatus(
  db: Db,
  paymentId: string,
  itemStatus: PayoutItemStatus,
  itemId: string | null,
  actor: string,
  error?: string | null,
) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) return;
  const next = ITEM_STATUS[itemStatus] ?? "pending";
  if (payment.status === next && payment.payoutItemId === itemId) return;

  await db
    .update(payments)
    .set({ status: next, payoutItemId: itemId ?? payment.payoutItemId, updatedAt: new Date() })
    .where(eq(payments.id, paymentId));

  if (payment.kind === "labor" && payment.stageId) {
    if (next === "completed") await db.update(stages).set({ status: "paid" }).where(eq(stages.id, payment.stageId));
    if (next === "failed" || next === "returned" || next === "unclaimed") {
      await db.update(stages).set({ status: "blocked" }).where(eq(stages.id, payment.stageId));
    }
  }
  if (payment.kind === "material" && payment.materialRequestId && next === "completed") {
    await db.update(materialRequests).set({ status: "paid" }).where(eq(materialRequests.id, payment.materialRequestId));
  }
  if (payment.kind === "inspection" && payment.inspectionId && next === "completed") {
    await db.update(inspections).set({ status: "paid" }).where(eq(inspections.id, payment.inspectionId));
  }

  await appendLedger(db, {
    projectId: payment.projectId,
    type: `payout.${next}`,
    actor,
    payload: { paymentId, kind: payment.kind, payoutItemId: itemId, itemStatus, error: error ?? null },
  });
}

export async function reconcilePending(actor = "reconciler"): Promise<{ checked: number; updated: number }> {
  const db = await getDb();
  const open = await db
    .select()
    .from(payments)
    .where(inArray(payments.status, ["created", "pending", "unclaimed"]));
  let updated = 0;
  for (const p of open) {
    try {
      if (p.kind === "funding" && p.paypalOrderId) {
        const order = await getOrder(p.paypalOrderId);
        if (order.status === "APPROVED") {
          await completeFunding(p.id, actor);
          updated++;
        } else if (order.status === "COMPLETED") {
          const { captureId, status } = captureFromOrder(order);
          await applyCaptureStatus(db, p.id, captureId, status, actor);
          updated++;
        }
      } else if (p.direction === "out" && p.payoutBatchId) {
        const batch = await getPayoutBatch(p.payoutBatchId);
        const item = batch.items.find((i) => i.senderItemId === p.id) ?? batch.items[0];
        if (item?.status) {
          await applyPayoutItemStatus(db, p.id, item.status, item.itemId, actor, item.error);
          updated++;
        }
      }
    } catch (err) {
      console.error(`reconcile ${p.id} failed`, err);
    }
  }
  return { checked: open.length, updated };
}
