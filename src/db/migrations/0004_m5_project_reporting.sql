CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_paise_valid" CHECK ("expenses"."amount_paise" between 1 and 9007199254740991),
	CONSTRAINT "expense_description_valid" CHECK (length(btrim("expenses"."description")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"progress_id" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"taken_on" date NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "progress_photo_mime_valid" CHECK ("progress_photos"."mime" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "progress_photo_size_valid" CHECK ("progress_photos"."size_bytes" between 1 and 5000000),
	CONSTRAINT "progress_photo_storage_key_valid" CHECK ("progress_photos"."storage_key" ~ '^[a-f0-9-]{36}\.(jpg|png|webp)$')
);
--> statement-breakpoint
CREATE TABLE "progress_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"note" text NOT NULL,
	"checklist_item_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_updates_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "progress_note_valid" CHECK (length(btrim("progress_updates"."note")) between 1 and 2000),
	CONSTRAINT "progress_checklist_pending_m6" CHECK ("progress_updates"."checklist_item_id" is null)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_project_update_fk" FOREIGN KEY ("project_id","progress_id") REFERENCES "public"."progress_updates"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_project_date_idx" ON "expenses" USING btree ("project_id","occurred_on","id");--> statement-breakpoint
CREATE INDEX "progress_photos_project_update_idx" ON "progress_photos" USING btree ("project_id","progress_id","id");--> statement-breakpoint
CREATE INDEX "progress_updates_project_time_idx" ON "progress_updates" USING btree ("project_id","created_at","id");
--> statement-breakpoint
CREATE TRIGGER expenses_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON expenses
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER progress_updates_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON progress_updates
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER progress_photos_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON progress_photos
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
