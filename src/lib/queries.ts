import "server-only";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projects,
  parties,
  stages,
  lineItems,
  materialRequests,
  evidence,
  payments,
  priceObservations,
  inspections,
  ledgerEvents,
} from "@/db/schema";

export async function getHeroProject() {
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.synthetic, false)).orderBy(asc(projects.createdAt)).limit(1);
  return p ?? null;
}

export async function getMarketMedians(state: string, sinceDays = 90): Promise<Map<string, { median: number; n: number }>> {
  const db = await getDb();
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db
    .select({
      itemKey: priceObservations.itemKey,
      median: sql<number>`percentile_cont(0.5) within group (order by ${priceObservations.unitPriceNgn})`,
      n: sql<number>`count(*)::int`,
    })
    .from(priceObservations)
    .where(and(eq(priceObservations.state, state), gte(priceObservations.observedAt, since)))
    .groupBy(priceObservations.itemKey);
  return new Map(rows.map((r) => [r.itemKey, { median: Math.round(Number(r.median)), n: Number(r.n) }]));
}

export type BoqRow = {
  id: string;
  stageId: string;
  stageSeq: number;
  stageName: string;
  itemKey: string;
  description: string;
  unit: string;
  category: string;
  qtyQuoted: number;
  unitPriceQuotedNgn: number;
  quotedTotalNgn: number;
  marketMedianNgn: number | null;
  qtyRequested: number;
  avgRequestedPriceNgn: number | null;
  paidNgn: number;
  qtyDelivered: number;
  flags: string[];
};

export async function getProjectView(projectId: string) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;

  const [stageRows, itemRows, requestRows, paymentRows, evidenceRows, partyRows, inspectionRows, medians] =
    await Promise.all([
      db.select().from(stages).where(eq(stages.projectId, projectId)).orderBy(asc(stages.seq)),
      db.select().from(lineItems).where(eq(lineItems.projectId, projectId)),
      db.select().from(materialRequests).where(eq(materialRequests.projectId, projectId)).orderBy(desc(materialRequests.createdAt)),
      db.select().from(payments).where(eq(payments.projectId, projectId)).orderBy(desc(payments.createdAt)),
      db.select().from(evidence).where(eq(evidence.projectId, projectId)).orderBy(desc(evidence.createdAt)),
      db.select().from(parties),
      db.select().from(inspections).where(eq(inspections.projectId, projectId)).orderBy(asc(inspections.startsAt)),
      getMarketMedians(project.siteState),
    ]);

  const stageById = new Map(stageRows.map((s) => [s.id, s]));

  const boq: BoqRow[] = itemRows
    .map((li) => {
      const stage = stageById.get(li.stageId)!;
      const reqs = requestRows.filter((r) => r.lineItemId === li.id && r.status !== "rejected");
      const qtyRequested = reqs.reduce((a, r) => a + r.qty, 0);
      const avgRequestedPriceNgn = qtyRequested
        ? Math.round(reqs.reduce((a, r) => a + r.qty * r.unitPriceNgn, 0) / qtyRequested)
        : null;
      const paid = paymentRows.filter(
        (p) =>
          p.direction === "out" &&
          p.status === "completed" &&
          (p.lineItemId === li.id || (li.itemKey === "labor" && p.kind === "labor" && p.stageId === li.stageId)),
      );
      const paidNgn = paid.reduce((a, p) => a + p.amountNgn, 0);
      const qtyDelivered = evidenceRows
        .filter((e) => e.kind === "waybill" && e.lineItemId === li.id)
        .reduce((a, e) => a + Number((e.verdict?.extracted as { quantity?: number } | undefined)?.quantity ?? 0), 0);
      const median = medians.get(li.itemKey)?.median ?? null;

      const flags: string[] = [];
      if (median && li.unitPriceQuotedNgn > median * 1.15) flags.push("quote above market");
      if (avgRequestedPriceNgn && median && avgRequestedPriceNgn > median * 1.15) flags.push("request above market");
      if (qtyRequested > li.qtyQuoted) flags.push("over quoted quantity");
      if (qtyDelivered && qtyDelivered < qtyRequested && reqs.some((r) => r.status === "paid")) flags.push("short delivery");

      return {
        id: li.id,
        stageId: li.stageId,
        stageSeq: stage.seq,
        stageName: stage.name,
        itemKey: li.itemKey,
        description: li.description,
        unit: li.unit,
        category: li.category,
        qtyQuoted: li.qtyQuoted,
        unitPriceQuotedNgn: li.unitPriceQuotedNgn,
        quotedTotalNgn: Math.round(li.qtyQuoted * li.unitPriceQuotedNgn),
        marketMedianNgn: li.category === "labor" ? null : median,
        qtyRequested,
        avgRequestedPriceNgn,
        paidNgn,
        qtyDelivered,
        flags,
      };
    })
    .sort((a, b) => a.stageSeq - b.stageSeq || a.category.localeCompare(b.category) || a.description.localeCompare(b.description));

  return {
    project,
    stages: stageRows,
    boq,
    requests: requestRows,
    payments: paymentRows,
    evidence: evidenceRows,
    parties: partyRows,
    inspections: inspectionRows,
  };
}

export type ProjectView = NonNullable<Awaited<ReturnType<typeof getProjectView>>>;

export async function getLedger(projectId: string, limit = 50) {
  const db = await getDb();
  return db.select().from(ledgerEvents).where(eq(ledgerEvents.projectId, projectId)).orderBy(desc(ledgerEvents.seq)).limit(limit);
}

export async function getParty(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(parties).where(eq(parties.id, id));
  return p ?? null;
}
