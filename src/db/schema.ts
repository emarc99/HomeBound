import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerCity: text("owner_city").notNull(),
  ownerCountry: text("owner_country").notNull(),
  siteCity: text("site_city").notNull(),
  siteState: text("site_state").notNull(),
  siteLat: doublePrecision("site_lat").notNull(),
  siteLng: doublePrecision("site_lng").notNull(),
  siteRadiusM: integer("site_radius_m").notNull().default(150),
  ngnPerUsd: integer("ngn_per_usd").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  synthetic: boolean("synthetic").notNull().default(false),
  createdAt: createdAt(),
});

export type PartyRole = "owner" | "contractor" | "foreman" | "supplier" | "inspector";

export const parties = pgTable(
  "parties",
  {
    id: id(),
    projectId: text("project_id").references(() => projects.id),
    role: text("role").$type<PartyRole>().notNull(),
    name: text("name").notNull(),
    city: text("city"),
    paypalEmail: text("paypal_email"),
    apiKeyHash: text("api_key_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("parties_project_idx").on(t.projectId), uniqueIndex("parties_api_key_idx").on(t.apiKeyHash)],
);

export type StageStatus =
  | "planned"
  | "funded"
  | "in_progress"
  | "evidence_submitted"
  | "verified"
  | "paid"
  | "blocked";

export const stages = pgTable(
  "stages",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    durationDays: integer("duration_days").notNull(),
    laborTrancheUsdCents: integer("labor_tranche_usd_cents").notNull(),
    dependsOnStageId: text("depends_on_stage_id"),
    contractorId: text("contractor_id").references(() => parties.id),
    status: text("status").$type<StageStatus>().notNull().default("planned"),
    acceptanceCriteria: text("acceptance_criteria").notNull(),
  },
  (t) => [index("stages_project_idx").on(t.projectId)],
);

export type LineItemCategory = "material" | "labor" | "finish";

export const lineItems = pgTable(
  "line_items",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id),
    itemKey: text("item_key").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull(),
    category: text("category").$type<LineItemCategory>().notNull(),
    qtyQuoted: doublePrecision("qty_quoted").notNull(),
    unitPriceQuotedNgn: integer("unit_price_quoted_ngn").notNull(),
  },
  (t) => [index("line_items_stage_idx").on(t.stageId)],
);

export type MaterialRequestStatus = "pending_audit" | "flagged" | "ok" | "approved" | "rejected" | "paid";

export type MaterialAudit = {
  verdict: "ok" | "flag";
  marketMedianNgn: number | null;
  priceDeltaPct: number | null;
  qtyRemaining: number;
  reasons: string[];
  model: string;
};

export const materialRequests = pgTable(
  "material_requests",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    lineItemId: text("line_item_id")
      .notNull()
      .references(() => lineItems.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => parties.id),
    qty: doublePrecision("qty").notNull(),
    unitPriceNgn: integer("unit_price_ngn").notNull(),
    note: text("note"),
    status: text("status").$type<MaterialRequestStatus>().notNull().default("pending_audit"),
    audit: jsonb("audit").$type<MaterialAudit>(),
    createdAt: createdAt(),
  },
  (t) => [index("material_requests_project_idx").on(t.projectId)],
);

export type EvidenceKind = "photo" | "waybill" | "inspection_report" | "message";

export type EvidenceVerdict = {
  verdict: "pass" | "fail" | "needs_review";
  confidence: number;
  observations: string[];
  checks: { name: string; status: "pass" | "fail" | "unavailable"; detail: string }[];
  extracted?: Record<string, unknown>;
  model: string;
};

export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    stageId: text("stage_id").references(() => stages.id),
    lineItemId: text("line_item_id").references(() => lineItems.id),
    materialRequestId: text("material_request_id").references(() => materialRequests.id),
    kind: text("kind").$type<EvidenceKind>().notNull(),
    uploadedById: text("uploaded_by_id").references(() => parties.id),
    blobKey: text("blob_key"),
    mime: text("mime"),
    sha256: text("sha256"),
    dhash: text("dhash"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    text: text("text"),
    verdict: jsonb("verdict").$type<EvidenceVerdict>(),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_project_idx").on(t.projectId), index("evidence_stage_idx").on(t.stageId)],
);

export type PaymentKind = "funding" | "labor" | "material" | "inspection";
export type PaymentStatus = "created" | "pending" | "completed" | "failed" | "unclaimed" | "returned" | "refunded";

export const payments = pgTable(
  "payments",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    stageId: text("stage_id").references(() => stages.id),
    lineItemId: text("line_item_id").references(() => lineItems.id),
    materialRequestId: text("material_request_id").references(() => materialRequests.id),
    inspectionId: text("inspection_id"),
    kind: text("kind").$type<PaymentKind>().notNull(),
    direction: text("direction").$type<"in" | "out">().notNull(),
    amountUsdCents: integer("amount_usd_cents").notNull(),
    amountNgn: integer("amount_ngn").notNull(),
    payeeId: text("payee_id").references(() => parties.id),
    status: text("status").$type<PaymentStatus>().notNull().default("created"),
    idempotencyKey: text("idempotency_key").notNull(),
    paypalOrderId: text("paypal_order_id"),
    paypalCaptureId: text("paypal_capture_id"),
    payoutBatchId: text("payout_batch_id"),
    payoutItemId: text("payout_item_id"),
    approvedBy: text("approved_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_idem_idx").on(t.idempotencyKey),
    index("payments_project_idx").on(t.projectId),
    index("payments_order_idx").on(t.paypalOrderId),
    index("payments_payout_item_idx").on(t.payoutItemId),
  ],
);

export const ledgerEvents = pgTable(
  "ledger_events",
  {
    id: id(),
    projectId: text("project_id").references(() => projects.id),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ledger_seq_idx").on(t.seq), index("ledger_project_idx").on(t.projectId)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export type InspectionStatus = "scheduled" | "reported" | "paid" | "cancelled";

export const inspections = pgTable(
  "inspections",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    stageId: text("stage_id").references(() => stages.id),
    inspectorId: text("inspector_id")
      .notNull()
      .references(() => parties.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    feeUsdCents: integer("fee_usd_cents").notNull(),
    status: text("status").$type<InspectionStatus>().notNull().default("scheduled"),
    reportEvidenceId: text("report_evidence_id"),
  },
  (t) => [index("inspections_inspector_idx").on(t.inspectorId)],
);

export type PriceSource = "seed" | "quote" | "request" | "payout" | "waybill";

export const priceObservations = pgTable(
  "price_observations",
  {
    id: id(),
    itemKey: text("item_key").notNull(),
    rawDescription: text("raw_description").notNull(),
    unit: text("unit").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    unitPriceNgn: integer("unit_price_ngn").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    source: text("source").$type<PriceSource>().notNull(),
    projectId: text("project_id"),
    synthetic: boolean("synthetic").notNull().default(false),
  },
  (t) => [index("price_obs_item_idx").on(t.itemKey, t.state)],
);
