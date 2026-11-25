CREATE TYPE "public"."checklist_event_kind" AS ENUM('started', 'submitted', 'accepted', 'sent_back', 'added', 'renamed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."checklist_phase" AS ENUM('foundation', 'plinth', 'walls', 'slab', 'plumbing', 'electrical', 'plaster', 'flooring', 'finishing');--> statement-breakpoint
CREATE TYPE "public"."checklist_state" AS ENUM('todo', 'doing', 'waiting', 'done', 'sent_back');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "checklist_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_draft_binding" UNIQUE("project_id","id","created_by")
);
--> statement-breakpoint
CREATE TABLE "checklist_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "checklist_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" text NOT NULL,
	"item_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"kind" "checklist_event_kind" NOT NULL,
	"note" text,
	"previous" text,
	"next" text,
	"progress_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_events_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "checklist_events_progress_id_unique" UNIQUE("progress_id"),
	CONSTRAINT "checklist_event_evidence" CHECK (("checklist_events"."kind" = 'submitted') = ("checklist_events"."progress_id" is not null)),
	CONSTRAINT "checklist_event_reason" CHECK ("checklist_events"."kind" not in ('added', 'renamed', 'removed', 'sent_back') or ( "checklist_events"."note" is not null and length(btrim("checklist_events"."note")) >= 10 ))
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"checklist_id" text NOT NULL,
	"phase" "checklist_phase" NOT NULL,
	"task" text NOT NULL,
	"materials" text[] NOT NULL,
	"position" integer NOT NULL,
	"state" "checklist_state" DEFAULT 'todo' NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "checklist_item_project_id" UNIQUE("project_id","id"),
	CONSTRAINT "checklist_item_position" UNIQUE("checklist_id","position"),
	CONSTRAINT "checklist_item_task_valid" CHECK (length(btrim("checklist_items"."task")) between 1 and 120),
	CONSTRAINT "checklist_item_position_valid" CHECK ("checklist_items"."position" between 0 and 39)
);
--> statement-breakpoint
CREATE TABLE "checklist_records" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_records_draft_id_unique" UNIQUE("draft_id"),
	CONSTRAINT "checklist_record_project_id" UNIQUE("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"cost_impact_paise" bigint NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "proposal_decision_shape" CHECK (("proposals"."status" = 'pending' and "proposals"."decided_by" is null and "proposals"."decided_at" is null) or ("proposals"."status" <> 'pending' and "proposals"."decided_by" is not null and "proposals"."decided_at" is not null)),
	CONSTRAINT "proposal_safe_cost" CHECK ("proposals"."cost_impact_paise" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "progress_updates" DROP CONSTRAINT "progress_checklist_pending_m6";--> statement-breakpoint
ALTER TABLE "checklist_drafts" ADD CONSTRAINT "checklist_draft_actor_fk" FOREIGN KEY ("project_id","created_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_events" ADD CONSTRAINT "checklist_event_actor_fk" FOREIGN KEY ("project_id","actor_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_events" ADD CONSTRAINT "checklist_event_item_fk" FOREIGN KEY ("project_id","item_id") REFERENCES "public"."checklist_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_item_evidence_unique" UNIQUE("project_id","checklist_item_id","id");--> statement-breakpoint
ALTER TABLE "checklist_events" ADD CONSTRAINT "checklist_event_progress_fk" FOREIGN KEY ("project_id","item_id","progress_id") REFERENCES "public"."progress_updates"("project_id","checklist_item_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_item_record_fk" FOREIGN KEY ("project_id","checklist_id") REFERENCES "public"."checklist_records"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_records" ADD CONSTRAINT "checklist_record_draft_fk" FOREIGN KEY ("project_id","draft_id","created_by") REFERENCES "public"."checklist_drafts"("project_id","id","created_by") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposal_creator_fk" FOREIGN KEY ("project_id","created_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposal_decider_fk" FOREIGN KEY ("project_id","decided_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_event_item_seq" ON "checklist_events" USING btree ("project_id","item_id","sequence");--> statement-breakpoint
CREATE INDEX "proposal_project_time_idx" ON "proposals" USING btree ("project_id","created_at","id");--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_checklist_project_fk" FOREIGN KEY ("project_id","checklist_item_id") REFERENCES "public"."checklist_items"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER checklist_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON checklist_events
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
