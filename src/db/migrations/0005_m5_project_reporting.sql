ALTER TABLE "expenses" DROP CONSTRAINT "expenses_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "progress_updates" DROP CONSTRAINT "progress_updates_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_actor_fk" FOREIGN KEY ("project_id","created_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_project_actor_fk" FOREIGN KEY ("project_id","created_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;