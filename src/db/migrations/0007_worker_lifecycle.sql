ALTER TABLE "workers" ADD COLUMN "removed_reason" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "worker_removal_metadata" CHECK (("workers"."removed_reason" is null and "workers"."removed_at" is null)
          or (not "workers"."active" and "workers"."removed_reason" is not null and "workers"."removed_at" is not null
              and char_length(btrim("workers"."removed_reason")) between 5 and 2000));