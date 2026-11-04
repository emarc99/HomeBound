"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import type { ClientEvidence, ClientStage } from "@/lib/client-view";
import { uploadStagePhotoAction } from "@/app/actions/evidence";

const VERDICT: Record<string, { label: string; cls: string }> = {
  pass: { label: "AI: passed", cls: "bg-emerald-100 text-emerald-900" },
  fail: { label: "AI: failed", cls: "bg-red-100 text-red-900" },
  needs_review: { label: "Needs your review", cls: "bg-amber-100 text-amber-900" },
};

const CHECK_ICON: Record<string, { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-emerald-700" },
  fail: { icon: "✕", cls: "text-red-700" },
  unavailable: { icon: "?", cls: "text-amber-700" },
};

function EvidenceItem({ e }: { e: ClientEvidence }) {
  const v = e.verdict;
  const tag = VERDICT[v?.verdict ?? "needs_review"];
  return (
    <li className="overflow-hidden rounded-lg border border-sand">
      {e.blobKey ? (
        <a href={`/api/blobs/${e.blobKey}`} target="_blank" rel="noreferrer">
          <Image
            src={`/api/blobs/${e.blobKey}`}
            alt={`Site photo for this stage${e.takenAt ? ` taken ${new Date(e.takenAt).toLocaleDateString("en-GB")}` : ""}`}
            width={348}
            height={196}
            unoptimized
            className="h-40 w-full object-cover"
          />
        </a>
      ) : null}
      <div className="flex flex-col gap-2 p-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {e.uploadedByName ?? "Site upload"} · {new Date(e.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tag.cls}`}>{tag.label}</span>
        </div>
        {v?.observations?.[0] ? <p>{v.observations[0]}</p> : null}
        {v?.checks?.length ? (
          <ul className="flex flex-col gap-1">
            {v.checks.map((c) => {
              const ic = CHECK_ICON[c.status];
              return (
                <li key={c.name} className="flex gap-2 text-xs">
                  <span className={`w-3 shrink-0 font-bold ${ic.cls}`} aria-label={c.status}>
                    {ic.icon}
                  </span>
                  <span>
                    <span className="font-medium">{c.name}.</span> <span className="text-muted">{c.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function UploadPhoto({ stage }: { stage: ClientStage }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "good" | "warn" | "bad"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-sand p-2"
      action={(fd) =>
        start(async () => {
          setMessage(null);
          const res = await uploadStagePhotoAction(fd);
          if (!res.ok) return setMessage({ tone: "bad", text: res.error });
          formRef.current?.reset();
          const v = res.data?.verdict;
          setMessage(
            v === "pass"
              ? { tone: "good", text: "Photo verified. You can release the contractor's payment." }
              : v === "fail"
                ? { tone: "bad", text: "The photo doesn't show this stage as done. Ask the foreman for another." }
                : { tone: "warn", text: "Some checks couldn't confirm this photo. Review the details below." },
          );
        })
      }
    >
      <input type="hidden" name="stageId" value={stage.id} />
      <label className="text-xs text-muted" htmlFor={`photo-${stage.id}`}>
        Site photo from the foreman (original from the camera keeps its time and location)
      </label>
      <input
        id={`photo-${stage.id}`}
        name="photo"
        type="file"
        accept="image/*"
        required
        disabled={pending}
        className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-sand file:px-2 file:py-1 file:text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-laterite px-3 py-1.5 text-sm font-medium text-laterite hover:bg-laterite hover:text-white disabled:opacity-60"
      >
        {pending ? "Checking photo…" : "Upload and verify photo"}
      </button>
      {message ? (
        <p
          className={`rounded-md p-2 text-xs ${
            message.tone === "good" ? "bg-emerald-50 text-emerald-900" : message.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

export default function EvidencePanel({ stage, evidence }: { stage: ClientStage; evidence: ClientEvidence[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Evidence</h3>
      {stage.status !== "paid" ? <UploadPhoto key={stage.id} stage={stage} /> : null}
      {evidence.length === 0 ? (
        <p className="text-sm text-muted">No photos or reports yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {evidence.map((e) => (
            <EvidenceItem key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
