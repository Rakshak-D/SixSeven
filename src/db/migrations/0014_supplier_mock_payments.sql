CREATE TABLE "supplier_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"material_id" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"remaining_qty" numeric(14, 3) NOT NULL,
	"max_unit_price_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_order_scope" UNIQUE("project_id","id"),
	CONSTRAINT "supplier_order_limits" CHECK ("supplier_orders"."qty" > 0 and "supplier_orders"."remaining_qty" between 0 and "supplier_orders"."qty" and "supplier_orders"."max_unit_price_paise" between 1 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"supplier_id" text,
	"order_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_paise" bigint DEFAULT 0 NOT NULL,
	"paid_by" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "supplier_payment_state" CHECK (
    ("supplier_payments"."status" = 'pending' and "supplier_payments"."amount_paise" = 0 and "supplier_payments"."decided_at" is null and "supplier_payments"."paid_by" is null)
    or ("supplier_payments"."status" = 'paid' and "supplier_payments"."amount_paise" between 1 and 9007199254740991 and "supplier_payments"."decided_at" is not null and
      "supplier_payments"."paid_by" is not null and "supplier_payments"."paid_by" in ('autopay','owner') and "supplier_payments"."supplier_id" is not null and "supplier_payments"."order_id" is not null)
    or ("supplier_payments"."status" = 'declined' and "supplier_payments"."amount_paise" = 0 and "supplier_payments"."decided_at" is not null and "supplier_payments"."paid_by" is null)
  )
);
--> statement-breakpoint
CREATE TABLE "supplier_project_rules" (
	"project_id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"gstin" text NOT NULL,
	"account_last4" text NOT NULL,
	"approved_at" timestamp with time zone,
	"pending_last4" text,
	"bank_requested_at" timestamp with time zone,
	"bank_effective_at" timestamp with time zone,
	"autopay_enabled" boolean DEFAULT false NOT NULL,
	"autopay_paused" boolean DEFAULT false NOT NULL,
	"per_bill_cap_paise" bigint DEFAULT 0 NOT NULL,
	"per_week_cap_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_project_pair" UNIQUE("project_id","id"),
	CONSTRAINT "supplier_project_gstin" UNIQUE("project_id","gstin"),
	CONSTRAINT "supplier_account_mask" CHECK ("suppliers"."account_last4" ~ '^[0-9]{4}$' and ("suppliers"."pending_last4" is null or "suppliers"."pending_last4" ~ '^[0-9]{4}$')),
	CONSTRAINT "supplier_valid_caps" CHECK ("suppliers"."per_bill_cap_paise" between 0 and 9007199254740991 and "suppliers"."per_week_cap_paise" between 0 and 9007199254740991 and
    (not "suppliers"."autopay_enabled" or ("suppliers"."per_bill_cap_paise" > 0 and "suppliers"."per_week_cap_paise" >= "suppliers"."per_bill_cap_paise")))
);
--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_order_supplier_scope" FOREIGN KEY ("project_id","supplier_id") REFERENCES "public"."suppliers"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_order_material_scope" FOREIGN KEY ("project_id","material_id") REFERENCES "public"."materials"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payment_verified_delivery" FOREIGN KEY ("project_id","delivery_id") REFERENCES "public"."delivery_verifications"("project_id","delivery_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payment_supplier_scope" FOREIGN KEY ("project_id","supplier_id") REFERENCES "public"."suppliers"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payment_order_scope" FOREIGN KEY ("project_id","order_id") REFERENCES "public"."supplier_orders"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_project_rules" ADD CONSTRAINT "supplier_project_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_order_match" ON "supplier_orders" USING btree ("project_id","supplier_id","material_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_payment_weekly_spend" ON "supplier_payments" USING btree ("project_id","supplier_id","status","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_project_name" ON "suppliers" USING btree ("project_id",lower(btrim("name")));
--> statement-breakpoint
INSERT INTO supplier_payments (id, project_id, delivery_id)
SELECT delivery_id, project_id, delivery_id FROM delivery_verifications
ON CONFLICT (delivery_id) DO NOTHING;
