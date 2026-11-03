import "server-only";
import { count } from "drizzle-orm";
import type { Db } from "./index";
import {
  projects,
  parties,
  stages,
  lineItems,
  payments,
  priceObservations,
  inspections,
} from "./schema";
import { CATALOG, CITY_FACTORS, catalogItem } from "./catalog";
import { appendLedger } from "@/lib/ledger";
import { usdCentsToNgn } from "@/lib/money";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NGN_PER_USD = 1550;
const DAY = 86_400_000;

type StageSeed = {
  name: string;
  description: string;
  days: number;
  laborUsd: number;
  criteria: string;
  items: [string, number][];
};

const HERO_STAGES: StageSeed[] = [
  {
    name: "Site clearing & setting out",
    description: "Clear vegetation, survey pegs, set out the building lines.",
    days: 7,
    laborUsd: 300,
    criteria: "Site cleared of vegetation; profile boards and string lines visible marking the building footprint.",
    items: [],
  },
  {
    name: "Foundation & DPC",
    description: "Excavate trenches, cast strip footing, raise foundation blockwork, cast the damp-proof course slab.",
    days: 28,
    laborUsd: 1200,
    criteria:
      "Trenches excavated and concreted; foundation blockwork raised to DPC level; reinforcement mesh visible before the DPC slab is cast; footprint matches the plan.",
    items: [
      ["cement-50kg", 180],
      ["block-9in", 1200],
      ["sharp-sand-trip", 3],
      ["granite-trip", 1],
      ["rod-12mm", 60],
      ["binding-wire", 2],
    ],
  },
  {
    name: "Blockwork to lintel",
    description: "Raise walls with 9-inch and 6-inch blocks to lintel level and cast the lintel beam.",
    days: 35,
    laborUsd: 1500,
    criteria:
      "Walls raised to lintel height on all elevations; door and window openings formed; lintel reinforcement and formwork in place or lintel cast.",
    items: [
      ["cement-50kg", 220],
      ["block-9in", 3800],
      ["block-6in", 600],
      ["sharp-sand-trip", 4],
      ["granite-trip", 1],
      ["rod-12mm", 40],
      ["rod-16mm", 20],
    ],
  },
  {
    name: "Roofing",
    description: "Timber roof trusses, purlins and longspan aluminium sheets.",
    days: 21,
    laborUsd: 1100,
    criteria: "Roof trusses fixed on wall plates; longspan sheets covering the full roof; fascia boards installed.",
    items: [
      ["timber-2x4", 260],
      ["timber-2x6", 120],
      ["longspan-alu", 210],
      ["roofing-nails", 6],
    ],
  },
  {
    name: "Plumbing & electrical first fix",
    description: "Conduits, cable runs, soil and water pipes chased into walls before plastering.",
    days: 21,
    laborUsd: 900,
    criteria: "Electrical conduits and back boxes chased into walls; soil and water pipes laid and visible before plastering.",
    items: [
      ["pvc-4in", 30],
      ["cable-2.5mm", 6],
    ],
  },
  {
    name: "Finishes",
    description: "Plaster, tiling, sanitary fittings, doors and painting.",
    days: 42,
    laborUsd: 2000,
    criteria:
      "Walls plastered and painted; floor tiles laid; WC, basin and shower fittings installed and matching the approved specification; exterior steel door hung.",
    items: [
      ["floor-tile-60", 130],
      ["wc-suite", 2],
      ["basin-pedestal", 2],
      ["shower-mixer", 2],
      ["emulsion-20l", 14],
      ["steel-door", 1],
    ],
  },
];

const OTHER_PROJECTS = [
  { name: "Duplex at Lekki Phase 2", ownerName: "Ifeoma Nwosu", ownerCity: "Houston", ownerCountry: "US", siteCity: "Lagos", lat: 6.4474, lng: 3.5468 },
  { name: "Family bungalow, Independence Layout", ownerName: "Chukwuemeka Obi", ownerCity: "Toronto", ownerCountry: "CA", siteCity: "Enugu", lat: 6.4584, lng: 7.5464 },
  { name: "4-bed detached, Gwarinpa", ownerName: "Aisha Bello", ownerCity: "Manchester", ownerCountry: "GB", siteCity: "Abuja", lat: 9.1112, lng: 7.4069 },
  { name: "Rental flats, Rumuola", ownerName: "Tamuno Briggs", ownerCity: "Aberdeen", ownerCountry: "GB", siteCity: "Port Harcourt", lat: 4.8396, lng: 7.0109 },
  { name: "Retirement home, Bodija", ownerName: "Olufemi Adebayo", ownerCity: "Atlanta", ownerCountry: "US", siteCity: "Ibadan", lat: 7.4352, lng: 3.9133 },
  { name: "3-bed bungalow, Trans-Ekulu", ownerName: "Ngozi Okeke", ownerCity: "Dublin", ownerCountry: "IE", siteCity: "Enugu", lat: 6.4789, lng: 7.5136 },
  { name: "Mini-flats, Ikorodu", ownerName: "Babatunde Lawal", ownerCity: "Berlin", ownerCountry: "DE", siteCity: "Lagos", lat: 6.6194, lng: 3.5105 },
];

function quotePrice(base: number): number {
  return Math.round((base * 1.05) / 50) * 50;
}

export async function isSeeded(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(projects);
  return (row?.n ?? 0) > 0;
}

export async function seed(db: Db): Promise<void> {
  if (await isSeeded(db)) return;
  const rand = mulberry32(20261103);
  const env = process.env;

  const [hero] = await db
    .insert(projects)
    .values({
      name: "3-bedroom bungalow, Akobo",
      ownerName: "Tunde Adeyemi",
      ownerCity: "London",
      ownerCountry: "GB",
      siteCity: "Ibadan",
      siteState: "Oyo",
      siteLat: 7.437,
      siteLng: 3.947,
      siteRadiusM: 150,
      ngnPerUsd: NGN_PER_USD,
      startDate: new Date("2026-10-05T08:00:00Z"),
    })
    .returning();

  const others = await db
    .insert(projects)
    .values(
      OTHER_PROJECTS.map((p) => ({
        name: p.name,
        ownerName: p.ownerName,
        ownerCity: p.ownerCity,
        ownerCountry: p.ownerCountry,
        siteCity: p.siteCity,
        siteState: CITY_FACTORS[p.siteCity].state,
        siteLat: p.lat,
        siteLng: p.lng,
        ngnPerUsd: NGN_PER_USD,
        startDate: new Date(Date.UTC(2026, 3 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 27))),
        synthetic: true,
      })),
    )
    .returning();

  const [owner, contractor, foreman] = await db
    .insert(parties)
    .values([
      { projectId: hero.id, role: "owner", name: "Tunde Adeyemi", city: "London" },
      { projectId: hero.id, role: "contractor", name: "Adewale Builders Ltd", city: "Ibadan", paypalEmail: env.SANDBOX_CONTRACTOR_EMAIL ?? null },
      { projectId: hero.id, role: "foreman", name: "Kunle Ogundipe (site foreman)", city: "Ibadan" },
    ])
    .returning();

  const supplierEmail = env.SANDBOX_SUPPLIER_EMAIL ?? null;
  const suppliers = await db
    .insert(parties)
    .values([
      { role: "supplier", name: "Oyo Cement Depot", city: "Ibadan", paypalEmail: supplierEmail },
      { role: "supplier", name: "Akobo Blocks Industry", city: "Ibadan", paypalEmail: supplierEmail },
      { role: "supplier", name: "Bodija Iron & Steel", city: "Ibadan", paypalEmail: supplierEmail },
      { role: "supplier", name: "Ring Road Roofing Mart", city: "Ibadan", paypalEmail: supplierEmail },
      { role: "supplier", name: "Dugbe Finishes Hub", city: "Ibadan", paypalEmail: supplierEmail },
    ])
    .returning();

  const inspectorEmail = env.SANDBOX_INSPECTOR_EMAIL ?? null;
  const inspectorRows = await db
    .insert(parties)
    .values([
      { role: "inspector", name: "Engr. Folake Bello", city: "Ibadan", paypalEmail: inspectorEmail },
      { role: "inspector", name: "Engr. Musa Ibrahim", city: "Ibadan", paypalEmail: inspectorEmail },
      { role: "inspector", name: "QS Ngozi Eze", city: "Ibadan", paypalEmail: inspectorEmail },
    ])
    .returning();

  let cursor = hero.startDate.getTime();
  let prevStageId: string | null = null;
  const stageRows: (typeof stages.$inferSelect)[] = [];
  for (const [i, s] of HERO_STAGES.entries()) {
    const status = i === 0 ? "paid" : i === 1 ? "funded" : "planned";
    const [row]: (typeof stages.$inferSelect)[] = await db
      .insert(stages)
      .values({
        projectId: hero.id,
        seq: i + 1,
        name: s.name,
        description: s.description,
        startDate: new Date(cursor),
        durationDays: s.days,
        laborTrancheUsdCents: s.laborUsd * 100,
        dependsOnStageId: prevStageId,
        contractorId: contractor.id,
        status,
        acceptanceCriteria: s.criteria,
      })
      .returning();
    stageRows.push(row);
    prevStageId = row.id;
    cursor += s.days * DAY;

    const items = [
      ...s.items.map(([key, qty]) => {
        const c = catalogItem(key);
        return {
          projectId: hero.id,
          stageId: row.id,
          itemKey: key,
          description: c.description,
          unit: c.unit,
          category: c.category,
          qtyQuoted: qty,
          unitPriceQuotedNgn: quotePrice(c.baseIbadanNgn),
        };
      }),
      {
        projectId: hero.id,
        stageId: row.id,
        itemKey: "labor",
        description: `Labor: ${s.name}`,
        unit: "lot",
        category: "labor" as const,
        qtyQuoted: 1,
        unitPriceQuotedNgn: usdCentsToNgn(s.laborUsd * 100, NGN_PER_USD),
      },
    ];
    await db.insert(lineItems).values(items);
  }

  const first = stageRows[0];
  const second = stageRows[1];
  const firstNgn = usdCentsToNgn(first.laborTrancheUsdCents, NGN_PER_USD);
  await db.insert(payments).values([
    {
      projectId: hero.id,
      stageId: first.id,
      kind: "funding",
      direction: "in",
      amountUsdCents: first.laborTrancheUsdCents,
      amountNgn: firstNgn,
      status: "completed",
      idempotencyKey: "seed-fund-stage-1",
    },
    {
      projectId: hero.id,
      stageId: first.id,
      kind: "labor",
      direction: "out",
      amountUsdCents: first.laborTrancheUsdCents,
      amountNgn: firstNgn,
      payeeId: contractor.id,
      status: "completed",
      idempotencyKey: "seed-labor-stage-1",
      approvedBy: owner.name,
    },
    {
      projectId: hero.id,
      stageId: second.id,
      kind: "funding",
      direction: "in",
      amountUsdCents: second.laborTrancheUsdCents,
      amountNgn: usdCentsToNgn(second.laborTrancheUsdCents, NGN_PER_USD),
      status: "completed",
      idempotencyKey: "seed-fund-stage-2",
    },
  ]);

  const visitStart = new Date(Date.UTC(2026, 10, 9, 9));
  await db.insert(inspections).values(
    inspectorRows.map((insp, i) => ({
      projectId: hero.id,
      stageId: second.id,
      inspectorId: insp.id,
      startsAt: new Date(visitStart.getTime() + i * 2 * DAY),
      endsAt: new Date(visitStart.getTime() + i * 2 * DAY + 3 * 3_600_000),
      feeUsdCents: 4000,
      status: "scheduled" as const,
    })),
  );

  const obs: (typeof priceObservations.$inferInsert)[] = [];
  const allProjects = [hero, ...others];
  for (const item of CATALOG) {
    if (item.category === "labor") continue;
    for (const [city, { state, factor }] of Object.entries(CITY_FACTORS)) {
      for (let month = 0; month <= 10; month++) {
        const drift = 1 - 0.012 * (10 - month);
        const n = 2 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const noise = 1 + (rand() - 0.5) * 0.16;
          const outlier = rand() < 0.03 ? 1.35 : 1;
          const names = [item.description, ...item.aliases];
          const proj = allProjects.filter((p) => p.siteCity === city);
          obs.push({
            itemKey: item.itemKey,
            rawDescription: names[Math.floor(rand() * names.length)],
            unit: item.unit,
            city,
            state,
            unitPriceNgn: Math.round(item.baseIbadanNgn * factor * drift * noise * outlier),
            observedAt: new Date(Date.UTC(2026, month, 1 + Math.floor(rand() * 27))),
            source: (["quote", "request", "payout", "waybill"] as const)[Math.floor(rand() * 4)],
            projectId: proj.length ? proj[Math.floor(rand() * proj.length)].id : null,
            synthetic: true,
          });
        }
      }
    }
  }
  for (let i = 0; i < obs.length; i += 500) {
    await db.insert(priceObservations).values(obs.slice(i, i + 500));
  }

  await appendLedger(db, {
    projectId: hero.id,
    type: "project.created",
    actor: owner.name,
    payload: { name: hero.name, stages: stageRows.length, suppliers: suppliers.length },
  });
  await appendLedger(db, {
    projectId: hero.id,
    type: "plan.accepted",
    actor: owner.name,
    payload: { contractor: contractor.name, foreman: foreman.name },
  });
}
