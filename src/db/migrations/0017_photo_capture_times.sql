ALTER TABLE "delivery_challan_photos" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_challan_photos" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_challan_photos" ADD CONSTRAINT "challan_photo_capture_window" CHECK (
      ("delivery_challan_photos"."captured_at" is null and "delivery_challan_photos"."received_at" is null)
      or ("delivery_challan_photos"."captured_at" is not null and "delivery_challan_photos"."received_at" is not null
        and "delivery_challan_photos"."captured_at" between "delivery_challan_photos"."received_at" - interval '10 minutes' and "delivery_challan_photos"."received_at" + interval '30 seconds'));--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photo_capture_window" CHECK (
      ("progress_photos"."captured_at" is null and "progress_photos"."received_at" is null)
      or ("progress_photos"."captured_at" is not null and "progress_photos"."received_at" is not null
        and "progress_photos"."captured_at" between "progress_photos"."received_at" - interval '10 minutes' and "progress_photos"."received_at" + interval '30 seconds'));