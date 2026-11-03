import type { ProjectView, BoqRow } from "./queries";
import type { EvidenceVerdict, MaterialAudit } from "@/db/schema";

export type ClientStage = {
  id: string;
  seq: number;
  name: string;
  description: string;
  startDate: string;
  durationDays: number;
  laborTrancheUsdCents: number;
  laborTrancheNgn: number;
  status: string;
  dependsOnStageId: string | null;
  acceptanceCriteria: string;
  fundedUsdCents: number;
  laborPaidUsdCents: number;
};

export type ClientPayment = {
  id: string;
  stageId: string | null;
  lineItemId: string | null;
  kind: string;
  direction: "in" | "out";
  amountUsdCents: number;
  amountNgn: number;
  payeeName: string | null;
  status: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  payoutBatchId: string | null;
  createdAt: string;
};

export type ClientEvidence = {
  id: string;
  stageId: string | null;
  lineItemId: string | null;
  kind: string;
  blobKey: string | null;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
  text: string | null;
  uploadedByName: string | null;
  verdict: EvidenceVerdict | null;
  createdAt: string;
};

export type ClientRequest = {
  id: string;
  lineItemId: string;
  supplierName: string;
  qty: number;
  unitPriceNgn: number;
  note: string | null;
  status: string;
  audit: MaterialAudit | null;
  createdAt: string;
};

export type ClientView = {
  project: {
    id: string;
    name: string;
    ownerName: string;
    ownerCity: string;
    ownerCountry: string;
    siteCity: string;
    siteState: string;
    ngnPerUsd: number;
  };
  stages: ClientStage[];
  boq: BoqRow[];
  payments: ClientPayment[];
  evidence: ClientEvidence[];
  requests: ClientRequest[];
};

export function toClientView(v: ProjectView): ClientView {
  const partyName = new Map(v.parties.map((p) => [p.id, p.name]));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    project: {
      id: v.project.id,
      name: v.project.name,
      ownerName: v.project.ownerName,
      ownerCity: v.project.ownerCity,
      ownerCountry: v.project.ownerCountry,
      siteCity: v.project.siteCity,
      siteState: v.project.siteState,
      ngnPerUsd: v.project.ngnPerUsd,
    },
    stages: v.stages.map((s) => {
      const funded = v.payments.filter((p) => p.stageId === s.id && p.kind === "funding" && p.status === "completed");
      const laborPaid = v.payments.filter((p) => p.stageId === s.id && p.kind === "labor" && p.status === "completed");
      return {
        id: s.id,
        seq: s.seq,
        name: s.name,
        description: s.description,
        startDate: s.startDate.toISOString(),
        durationDays: s.durationDays,
        laborTrancheUsdCents: s.laborTrancheUsdCents,
        laborTrancheNgn: Math.round((s.laborTrancheUsdCents / 100) * v.project.ngnPerUsd),
        status: s.status,
        dependsOnStageId: s.dependsOnStageId,
        acceptanceCriteria: s.acceptanceCriteria,
        fundedUsdCents: funded.reduce((a, p) => a + p.amountUsdCents, 0),
        laborPaidUsdCents: laborPaid.reduce((a, p) => a + p.amountUsdCents, 0),
      };
    }),
    boq: v.boq,
    payments: v.payments.map((p) => ({
      id: p.id,
      stageId: p.stageId,
      lineItemId: p.lineItemId,
      kind: p.kind,
      direction: p.direction,
      amountUsdCents: p.amountUsdCents,
      amountNgn: p.amountNgn,
      payeeName: p.payeeId ? (partyName.get(p.payeeId) ?? null) : null,
      status: p.status,
      paypalOrderId: p.paypalOrderId,
      paypalCaptureId: p.paypalCaptureId,
      payoutBatchId: p.payoutBatchId,
      createdAt: p.createdAt.toISOString(),
    })),
    evidence: v.evidence.map((e) => ({
      id: e.id,
      stageId: e.stageId,
      lineItemId: e.lineItemId,
      kind: e.kind,
      blobKey: e.blobKey,
      takenAt: iso(e.takenAt),
      lat: e.lat,
      lng: e.lng,
      text: e.text,
      uploadedByName: e.uploadedById ? (partyName.get(e.uploadedById) ?? null) : null,
      verdict: e.verdict,
      createdAt: e.createdAt.toISOString(),
    })),
    requests: v.requests.map((r) => ({
      id: r.id,
      lineItemId: r.lineItemId,
      supplierName: partyName.get(r.supplierId) ?? "Unknown supplier",
      qty: r.qty,
      unitPriceNgn: r.unitPriceNgn,
      note: r.note,
      status: r.status,
      audit: r.audit,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
