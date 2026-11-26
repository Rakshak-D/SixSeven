CREATE TABLE "checklist_steel_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"item_id" text NOT NULL,
	"progress_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "checklist_steel_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "steel_photo_capture_window" CHECK ("checklist_steel_photos"."captured_at" between "checklist_steel_photos"."received_at" - interval '10 minutes' and "checklist_steel_photos"."received_at" + interval '30 seconds'),
	CONSTRAINT "steel_photo_media" CHECK ("checklist_steel_photos"."size_bytes" between 1 and 5000000 and "checklist_steel_photos"."mime" in ('image/jpeg','image/png','image/webp'))
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD COLUMN "requires_steel_proof" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_steel_photos" ADD CONSTRAINT "steel_photo_proof_scope" FOREIGN KEY ("project_id","item_id","progress_id") REFERENCES "public"."progress_updates"("project_id","checklist_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_steel_photos" ADD CONSTRAINT "steel_photo_actor_scope" FOREIGN KEY ("project_id","created_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "steel_photo_item_proof" ON "checklist_steel_photos" USING btree ("project_id","item_id","progress_id");