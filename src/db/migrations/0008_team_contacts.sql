ALTER TABLE "user" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_indian_mobile" CHECK ("user"."phone" is null or "user"."phone" ~ '^[+]91[6-9][0-9]{9}$');