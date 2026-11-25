CREATE TABLE "change_request_events" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "change_request_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" text NOT NULL,
	"request_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" "project_role" NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_event_kind" CHECK ("change_request_events"."kind" in ('created','contractor_approved','contractor_rejected','reopened','owner_accepted','owner_rejected')),
	CONSTRAINT "change_event_nonblank_note" CHECK (char_length(btrim("change_request_events"."note")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text,
	"target_version" text,
	"payload" jsonb NOT NULL,
	"author_id" text NOT NULL,
	"author_role" "project_role" NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_request_project_pair" UNIQUE("project_id","id"),
	CONSTRAINT "change_request_kind" CHECK ("change_requests"."kind" in ('checklist_add','checklist_rename','checklist_remove','attendance_fix','medical_expense')),
	CONSTRAINT "change_request_status" CHECK ("change_requests"."status" in ('pending_contractor','pending_owner','rejected_contractor','accepted','rejected_owner')),
	CONSTRAINT "change_request_author_role" CHECK ("change_requests"."author_role" in ('engineer','contractor'))
);
--> statement-breakpoint
ALTER TABLE "change_request_events" ADD CONSTRAINT "change_event_scoped_request" FOREIGN KEY ("project_id","request_id") REFERENCES "public"."change_requests"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_events" ADD CONSTRAINT "change_event_actor_member" FOREIGN KEY ("project_id","actor_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_request_author_member" FOREIGN KEY ("project_id","author_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_event_request_sequence" ON "change_request_events" USING btree ("project_id","request_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "change_event_final_once" ON "change_request_events" USING btree ("request_id") WHERE "change_request_events"."kind" in ('owner_accepted','owner_rejected');--> statement-breakpoint
CREATE INDEX "change_request_project_queue" ON "change_requests" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "change_request_target_lookup" ON "change_requests" USING btree ("project_id","kind","target_id","status");--> statement-breakpoint
CREATE TRIGGER change_request_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON change_request_events
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
