"use client";

import { useMemo } from "react";
import { BryntumGantt } from "@bryntum/gantt-react";
import { StringHelper, TaskModel } from "@bryntum/gantt";
import "@bryntum/gantt/gantt.css";
import "@bryntum/gantt/stockholm-light.css";
import "@bryntum/gantt/fontawesome/css/fontawesome.css";
import "@bryntum/gantt/fontawesome/css/solid.css";
import type { ClientStage } from "@/lib/client-view";
import { formatNgn } from "@/lib/money";

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  funded: "Funded",
  in_progress: "In progress",
  evidence_submitted: "Evidence in",
  verified: "Verified",
  paid: "Paid",
  blocked: "Blocked",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "gray",
  funded: "blue",
  in_progress: "teal",
  evidence_submitted: "orange",
  verified: "green",
  paid: "green",
  blocked: "red",
};

const PROGRESS: Record<string, number> = {
  planned: 0,
  funded: 5,
  in_progress: 40,
  evidence_submitted: 80,
  verified: 95,
  paid: 100,
  blocked: 0,
};

class StageTask extends TaskModel {
  static fields = [
    { name: "stageId", type: "string" },
    { name: "stageStatus", type: "string" },
    { name: "trancheNgn", type: "number" },
    { name: "kind", type: "string" },
  ];
  declare stageId: string;
  declare stageStatus: string;
  declare trancheNgn: number;
  declare kind: "stage" | "gate";
}

function gateState(s: ClientStage): { label: string; color: string } {
  if (s.status === "paid") return { label: "released", color: "green" };
  if (s.status === "blocked") return { label: "blocked", color: "red" };
  if (s.fundedUsdCents >= s.laborTrancheUsdCents) return { label: "funded, awaiting proof", color: "orange" };
  return { label: "not funded", color: "gray" };
}

export default function StageGantt({
  stages,
  selectedStageId,
  onSelectStage,
}: {
  stages: ClientStage[];
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
}) {
  const dataKey = stages
    .map((s) => `${s.id}:${s.status}:${s.fundedUsdCents}:${s.laborPaidUsdCents}:${s.startDate}:${s.durationDays}`)
    .join("|");

  const project = useMemo(() => {
    const tasks = stages.flatMap((s) => {
      const gate = gateState(s);
      return [
        {
          id: `s-${s.id}`,
          name: `${s.seq}. ${s.name}`,
          startDate: s.seq === 1 ? s.startDate : undefined,
          duration: s.durationDays,
          durationUnit: "day",
          percentDone: PROGRESS[s.status] ?? 0,
          eventColor: STATUS_COLOR[s.status] ?? "gray",
          stageId: s.id,
          stageStatus: s.status,
          trancheNgn: s.laborTrancheNgn,
          kind: "stage",
        },
        {
          id: `g-${s.id}`,
          name: `Pay ${formatNgn(s.laborTrancheNgn)} labor (${gate.label})`,
          duration: 0,
          eventColor: gate.color,
          stageId: s.id,
          stageStatus: s.status,
          trancheNgn: s.laborTrancheNgn,
          kind: "gate",
        },
      ];
    });
    const dependencies = stages.flatMap((s, i) => {
      const deps = [{ id: `d-sg-${s.id}`, fromTask: `s-${s.id}`, toTask: `g-${s.id}` }];
      const next = stages[i + 1];
      if (next) deps.push({ id: `d-gs-${s.id}`, fromTask: `g-${s.id}`, toTask: `s-${next.id}` });
      return deps;
    });
    return { startDate: stages[0]?.startDate, taskModelClass: StageTask, tasks, dependencies };
    // Bryntum re-applies the project config whenever its identity changes, so rebuild only when the data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <BryntumGantt
      key={dataKey}
      project={project}
      readOnly
      viewPreset="weekAndMonth"
      barMargin={8}
      rowHeight={40}
      columns={[
        { type: "name", text: "Stage / payment gate", width: 300 },
        {
          text: "Status",
          width: 120,
          field: "stageStatus",
          renderer: ({ record }: { record: unknown }) => {
            const r = record as StageTask;
            return r.kind === "stage" ? (STATUS_LABEL[r.stageStatus] ?? r.stageStatus) : "";
          },
        },
      ]}
      taskTooltipFeature={{
        template: ({ taskRecord }: { taskRecord: StageTask }) => {
          const name = StringHelper.encodeHtml(taskRecord.name);
          if (taskRecord.kind === "gate") {
            return `<b>${name}</b><br>The next stage cannot start until this payment gate is released.`;
          }
          return `<b>${name}</b><br>Status: ${STATUS_LABEL[taskRecord.stageStatus] ?? taskRecord.stageStatus}<br>Labor tranche: ${formatNgn(taskRecord.trancheNgn)}`;
        },
      }}
      onTaskClick={({ taskRecord }: { taskRecord: TaskModel }) => {
        const stageId = (taskRecord as StageTask).stageId ?? null;
        onSelectStage(stageId === selectedStageId ? null : stageId);
      }}
    />
  );
}
