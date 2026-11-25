CREATE TABLE "medical_bill_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"request_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "medical_bill_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "medical_photo_size_bound" CHECK ("medical_bill_photos"."size_bytes" between 1 and 5000000),
	CONSTRAINT "medical_photo_mime" CHECK ("medical_bill_photos"."mime" in ('image/jpeg','image/png','image/webp')),
	CONSTRAINT "medical_photo_capture_window" CHECK ("medical_bill_photos"."captured_at" between "medical_bill_photos"."received_at" - interval '10 minutes' and "medical_bill_photos"."received_at" + interval '30 seconds')
);
--> statement-breakpoint
CREATE TABLE "medical_claims" (
	"project_id" text NOT NULL,
	"request_id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"bill_paise" bigint NOT NULL,
	"incident_on" date NOT NULL,
	"reimbursement_paise" bigint,
	CONSTRAINT "medical_claim_project_pair" UNIQUE("project_id","request_id"),
	CONSTRAINT "medical_claim_bill_bound" CHECK ("medical_claims"."bill_paise" between 1 and 9007199254740991 and
      ("medical_claims"."reimbursement_paise" is null or "medical_claims"."reimbursement_paise" between 1 and "medical_claims"."bill_paise"))
);
--> statement-breakpoint
ALTER TABLE "medical_bill_photos" ADD CONSTRAINT "medical_photo_claim_scope" FOREIGN KEY ("project_id","request_id") REFERENCES "public"."medical_claims"("project_id","request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_claims" ADD CONSTRAINT "medical_claim_request_scope" FOREIGN KEY ("project_id","request_id") REFERENCES "public"."change_requests"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_claims" ADD CONSTRAINT "medical_claim_worker_scope" FOREIGN KEY ("project_id","worker_id") REFERENCES "public"."workers"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_photo_claim_idx" ON "medical_bill_photos" USING btree ("project_id","request_id");