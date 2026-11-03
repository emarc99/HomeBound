CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text,
	"line_item_id" text,
	"material_request_id" text,
	"kind" text NOT NULL,
	"uploaded_by_id" text,
	"blob_key" text,
	"mime" text,
	"sha256" text,
	"dhash" text,
	"taken_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"text" text,
	"verdict" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text,
	"inspector_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fee_usd_cents" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"report_evidence_id" text
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"item_key" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"category" text NOT NULL,
	"qty_quoted" double precision NOT NULL,
	"unit_price_quoted_ngn" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"line_item_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"qty" double precision NOT NULL,
	"unit_price_ngn" integer NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending_audit' NOT NULL,
	"audit" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"paypal_email" text,
	"api_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"stage_id" text,
	"line_item_id" text,
	"material_request_id" text,
	"inspection_id" text,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"amount_ngn" integer NOT NULL,
	"payee_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"paypal_order_id" text,
	"paypal_capture_id" text,
	"payout_batch_id" text,
	"payout_item_id" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"item_key" text NOT NULL,
	"raw_description" text NOT NULL,
	"unit" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"unit_price_ngn" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"project_id" text,
	"synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_city" text NOT NULL,
	"owner_country" text NOT NULL,
	"site_city" text NOT NULL,
	"site_state" text NOT NULL,
	"site_lat" double precision NOT NULL,
	"site_lng" double precision NOT NULL,
	"site_radius_m" integer DEFAULT 150 NOT NULL,
	"ngn_per_usd" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"duration_days" integer NOT NULL,
	"labor_tranche_usd_cents" integer NOT NULL,
	"depends_on_stage_id" text,
	"contractor_id" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"acceptance_criteria" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_material_request_id_material_requests_id_fk" FOREIGN KEY ("material_request_id") REFERENCES "public"."material_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_id_parties_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_parties_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_material_request_id_material_requests_id_fk" FOREIGN KEY ("material_request_id") REFERENCES "public"."material_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_id_parties_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_contractor_id_parties_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_project_idx" ON "evidence" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "evidence_stage_idx" ON "evidence" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "inspections_inspector_idx" ON "inspections" USING btree ("inspector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_seq_idx" ON "ledger_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "ledger_project_idx" ON "ledger_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "line_items_stage_idx" ON "line_items" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "material_requests_project_idx" ON "material_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "parties_project_idx" ON "parties" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_api_key_idx" ON "parties" USING btree ("api_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idem_idx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_project_idx" ON "payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("paypal_order_id");--> statement-breakpoint
CREATE INDEX "payments_payout_item_idx" ON "payments" USING btree ("payout_item_id");--> statement-breakpoint
CREATE INDEX "price_obs_item_idx" ON "price_observations" USING btree ("item_key","state");--> statement-breakpoint
CREATE INDEX "stages_project_idx" ON "stages" USING btree ("project_id");