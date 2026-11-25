ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_project_id_pair_unique" UNIQUE("project_id","id");--> statement-breakpoint
CREATE TABLE "delivery_challan_photos" (
	"project_id" text NOT NULL,
	"delivery_id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_challan_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "delivery_challan_photo_media" CHECK ("delivery_challan_photos"."size_bytes" between 1 and 5000000 and "delivery_challan_photos"."mime" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
CREATE TABLE "expected_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"material_id" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"supplier" text NOT NULL,
	"expected_on" date NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_id" text,
	"rejection_reason" text,
	"rescheduled_on" date,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_deliveries_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "expected_delivery_qty_positive" CHECK ("expected_deliveries"."qty" > 0),
	CONSTRAINT "expected_delivery_state" CHECK (
      ("expected_deliveries"."status" = 'pending' and "expected_deliveries"."delivery_id" is null and "expected_deliveries"."rejection_reason" is null and "expected_deliveries"."rescheduled_on" is null and "expected_deliveries"."decided_at" is null and "expected_deliveries"."decided_by" is null)
      or ("expected_deliveries"."status" = 'accepted' and "expected_deliveries"."delivery_id" is not null and "expected_deliveries"."rejection_reason" is null and "expected_deliveries"."rescheduled_on" is null and "expected_deliveries"."decided_at" is not null and "expected_deliveries"."decided_by" is not null)
      or ("expected_deliveries"."status" = 'rejected' and "expected_deliveries"."delivery_id" is null and "expected_deliveries"."rejection_reason" is not null and char_length(btrim("expected_deliveries"."rejection_reason")) between 10 and 2000 and "expected_deliveries"."decided_at" is not null and "expected_deliveries"."decided_by" is not null)
    )
);
--> statement-breakpoint
ALTER TABLE "delivery_challan_photos" ADD CONSTRAINT "delivery_challan_photos_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_challan_photos" ADD CONSTRAINT "delivery_challan_photo_movement_fk" FOREIGN KEY ("project_id","delivery_id") REFERENCES "public"."stock_movements"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_deliveries" ADD CONSTRAINT "expected_deliveries_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_deliveries" ADD CONSTRAINT "expected_deliveries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_deliveries" ADD CONSTRAINT "expected_deliveries_material_fk" FOREIGN KEY ("project_id","material_id") REFERENCES "public"."materials"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_deliveries" ADD CONSTRAINT "expected_deliveries_movement_fk" FOREIGN KEY ("project_id","delivery_id") REFERENCES "public"."stock_movements"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expected_deliveries_project_status_day_idx" ON "expected_deliveries" USING btree ("project_id","status","expected_on","id");
