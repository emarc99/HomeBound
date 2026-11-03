"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ClientView } from "@/lib/client-view";
import { formatNgn, formatUsd } from "@/lib/money";
import StagePanel from "./StagePanel";

const StageGantt = dynamic(() => import("./gantt/StageGantt"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading timeline…</div>,
});
const BoqGrid = dynamic(() => import("./boq/BoqGrid"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading ledger…</div>,
});

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-sand bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export default function ProjectWorkspace({ view }: { view: ClientView }) {
  const [stageId, setStageId] = useState<string | null>(
    view.stages.find((s) => s.status !== "paid")?.id ?? null,
  );
  const stage = view.stages.find((s) => s.id === stageId) ?? null;

  const quoted = view.boq.reduce((a, r) => a + r.quotedTotalNgn, 0);
  const fundedCents = view.payments
    .filter((p) => p.direction === "in" && p.status === "completed")
    .reduce((a, p) => a + p.amountUsdCents, 0);
  const paidCents = view.payments
    .filter((p) => p.direction === "out" && p.status === "completed")
    .reduce((a, p) => a + p.amountUsdCents, 0);
  const flagged = view.boq.filter((r) => r.flags.length).length;

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Quoted budget" value={formatNgn(quoted)} hint={`${view.boq.length} line items`} />
        <Kpi label="Funded via PayPal" value={formatUsd(fundedCents)} hint={formatNgn(Math.round((fundedCents / 100) * view.project.ngnPerUsd))} />
        <Kpi label="Paid to payees" value={formatUsd(paidCents)} hint="contractor, suppliers, inspectors" />
        <Kpi label="Lines flagged" value={String(flagged)} hint="price, quantity or delivery" />
      </section>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="h-[380px] overflow-hidden rounded-xl border border-sand bg-white">
            <StageGantt stages={view.stages} selectedStageId={stageId} onSelectStage={setStageId} />
          </section>
          <section className="flex h-[460px] flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                Bill of quantities {stage ? <span className="text-muted">· stage {stage.seq}: {stage.name}</span> : <span className="text-muted">· all stages</span>}
              </h2>
              {stage ? (
                <button className="text-sm text-laterite hover:underline" onClick={() => setStageId(null)}>
                  Show all stages
                </button>
              ) : null}
            </div>
            <div className="flex-1">
              <BoqGrid rows={view.boq} stageId={stageId} />
            </div>
          </section>
        </div>
        <StagePanel view={view} stage={stage} />
      </div>
    </div>
  );
}
