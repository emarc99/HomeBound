"use client";

import type { ClientStage, ClientView } from "@/lib/client-view";
import { formatNgn, formatUsd } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  funded: "Funded",
  in_progress: "In progress",
  evidence_submitted: "Evidence submitted",
  verified: "Verified",
  paid: "Paid",
  blocked: "Blocked",
};

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = {
    neutral: "bg-sand text-foreground",
    good: "bg-emerald-100 text-emerald-900",
    warn: "bg-amber-100 text-amber-900",
    bad: "bg-red-100 text-red-900",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export default function StagePanel({ view, stage }: { view: ClientView; stage: ClientStage | null }) {
  if (!stage) {
    return (
      <aside className="rounded-xl border border-sand bg-white p-4 text-sm text-muted">
        Select a stage on the timeline to see its payment gate, evidence and actions.
      </aside>
    );
  }

  const payments = view.payments.filter((p) => p.stageId === stage.id);
  const evidence = view.evidence.filter((e) => e.stageId === stage.id);
  const funded = stage.fundedUsdCents >= stage.laborTrancheUsdCents;
  const tone = stage.status === "paid" || stage.status === "verified" ? "good" : stage.status === "blocked" ? "bad" : funded ? "warn" : "neutral";

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-sand bg-white p-4">
      <header>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {stage.seq}. {stage.name}
          </h2>
          <Pill tone={tone}>{STATUS_LABEL[stage.status] ?? stage.status}</Pill>
        </div>
        <p className="mt-1 text-sm text-muted">{stage.description}</p>
      </header>

      <section className="rounded-lg bg-background p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Labor tranche</span>
          <span className="font-medium">
            {formatUsd(stage.laborTrancheUsdCents)} · {formatNgn(stage.laborTrancheNgn)}
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Funded by owner</span>
          <span>{formatUsd(stage.fundedUsdCents)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Paid to contractor</span>
          <span>{formatUsd(stage.laborPaidUsdCents)}</span>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold">What counts as done</h3>
        <p className="mt-1 text-sm">{stage.acceptanceCriteria}</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold">Evidence</h3>
        {evidence.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No photos or reports yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {evidence.map((e) => (
              <li key={e.id} className="rounded-lg border border-sand p-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium capitalize">{e.kind.replace("_", " ")}</span>
                  {e.verdict ? (
                    <Pill tone={e.verdict.verdict === "pass" ? "good" : e.verdict.verdict === "fail" ? "bad" : "warn"}>
                      AI: {e.verdict.verdict.replace("_", " ")}
                    </Pill>
                  ) : null}
                </div>
                {e.verdict?.observations?.[0] ? <p className="mt-1 text-muted">{e.verdict.observations[0]}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Payments</h3>
        {payments.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No payments yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {p.direction === "in" ? "Funded" : `Paid ${p.payeeName ?? ""}`} <span className="text-muted">({p.kind})</span>
                </span>
                <span className="whitespace-nowrap">
                  {formatUsd(p.amountUsdCents)} <Pill tone={p.status === "completed" ? "good" : p.status === "failed" ? "bad" : "warn"}>{p.status}</Pill>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
