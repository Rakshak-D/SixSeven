ALTER TABLE "project_invitations" DROP CONSTRAINT "project_invitation_acceptance";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "verified_phone" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_verification_sid" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_verification_started" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_verified_phone_unique" UNIQUE("verified_phone");--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitation_acceptance" CHECK (("project_invitations"."accepted_by" is null) = ("project_invitations"."accepted_at" is null));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_verified_phone_matches" CHECK ("user"."verified_phone" is null or ("user"."phone" is not null and "user"."verified_phone" = "user"."phone"));