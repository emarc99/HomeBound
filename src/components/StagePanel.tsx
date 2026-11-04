"use client";

import { useState, useTransition } from "react";
import type { ClientStage, ClientView } from "@/lib/client-view";
import { formatNgn, formatUsd } from "@/lib/money";
import { fundStageAction, refreshPaymentsAction, releaseLaborAction } from "@/app/actions/payments";
import EvidencePanel from "./EvidencePanel";

function StageActions({
  stage,
  hasPassingPhoto,
  laborInFlight,
}: {
  stage: ClientStage;
  hasPassingPhoto: boolean;
  laborInFlight: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const funded = stage.fundedUsdCents >= stage.laborTrancheUsdCents;

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      setInfo(null);
      await fn();
    });

  return (
    <section className="flex flex-col gap-2">
      {!funded ? (
        <button
          disabled={pending}
          className="rounded-lg bg-laterite px-3 py-2 text-sm font-medium text-white hover:bg-laterite-dark disabled:opacity-60"
          onClick={() =>
            run(async () => {
              const res = await fundStageAction(stage.id);
              if (res.ok && res.data) window.location.href = res.data.approveUrl;
              else if (!res.ok) setError(res.error);
            })
          }
        >
          {pending ? "Opening PayPal…" : `Fund ${formatUsd(stage.laborTrancheUsdCents)} with PayPal`}
        </button>
      ) : null}

      {funded && stage.status !== "paid" && laborInFlight ? (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          Labor payout is with PayPal. Refresh to check whether it has landed.
        </p>
      ) : null}

      {funded && stage.status !== "paid" && !laborInFlight ? (
        <>
          {!hasPassingPhoto ? (
            <textarea
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="No photo has passed verification. To release anyway, write why (this is recorded in the ledger)."
              className="min-h-16 rounded-lg border border-sand p-2 text-sm"
            />
          ) : null}
          <button
            disabled={pending || (!hasPassingPhoto && !override.trim())}
            className="rounded-lg bg-palm px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const res = await releaseLaborAction(stage.id, hasPassingPhoto ? undefined : override);
                if (!res.ok) setError(res.error);
                else setInfo("Payout sent through PayPal. Status updates when PayPal confirms.");
              })
            }
          >
            {pending ? "Sending payout…" : `Approve & pay contractor ${formatUsd(stage.laborTrancheUsdCents)}`}
          </button>
        </>
      ) : null}

      <button
        disabled={pending}
        className="self-start text-xs text-muted underline-offset-2 hover:underline"
        onClick={() =>
          run(async () => {
            const res = await refreshPaymentsAction();
            if (!res.ok) setError(res.error);
            else setInfo(`Checked ${res.data?.checked ?? 0} open payments with PayPal, ${res.data?.updated ?? 0} updated.`);
          })
        }
      >
        Refresh payment status from PayPal
      </button>
      {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p> : null}
      {info ? <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">{info}</p> : null}
    </section>
  );
}

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

      <StageActions
        key={stage.id}
        stage={stage}
        hasPassingPhoto={evidence.some((e) => e.kind === "photo" && e.verdict?.verdict === "pass")}
        laborInFlight={payments.some((p) => p.kind === "labor" && ["created", "pending", "unclaimed"].includes(p.status))}
      />

      <section>
        <h3 className="text-sm font-semibold">What counts as done</h3>
        <p className="mt-1 text-sm">{stage.acceptanceCriteria}</p>
      </section>

      <EvidencePanel stage={stage} evidence={evidence} />

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
