CREATE TABLE "project_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"email" text,
	"phone" text,
	"role" "project_role" NOT NULL,
	"invited_by" text NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitation_email_unique" UNIQUE("project_id","email"),
	CONSTRAINT "project_invitation_phone_unique" UNIQUE("project_id","phone"),
	CONSTRAINT "project_invitation_recipient_canonical" CHECK (("project_invitations"."email" is not null and "project_invitations"."phone" is null and "project_invitations"."email" = lower(btrim("project_invitations"."email")) and char_length("project_invitations"."email") between 3 and 254)
        or ("project_invitations"."phone" is not null and "project_invitations"."email" is null and "project_invitations"."phone" ~ '^[+]91[6-9][0-9]{9}$')),
	CONSTRAINT "project_invitation_role" CHECK ("project_invitations"."role" in ('owner', 'contractor')),
	CONSTRAINT "project_invitation_acceptance" CHECK (("project_invitations"."accepted_by" is null) = ("project_invitations"."accepted_at" is null) and ("project_invitations"."phone" is null or "project_invitations"."accepted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_invitation_recipient_idx" ON "project_invitations" USING btree ("email","accepted_at","created_at");