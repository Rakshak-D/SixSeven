ALTER TABLE "project_invitations" DROP CONSTRAINT "project_invitation_role";--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "removed_by" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitation_role" CHECK ("project_invitations"."role" in ('owner', 'contractor', 'engineer'));--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_member_removal" CHECK (("project_members"."removed_at" is null) = ("project_members"."removed_by" is null));