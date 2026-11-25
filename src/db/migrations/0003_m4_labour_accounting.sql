CREATE TYPE "public"."adjustment_target" AS ENUM('stock_movements', 'attendance', 'wage_payments');--> statement-breakpoint
CREATE TYPE "public"."wage_payment_kind" AS ENUM('wage', 'advance');--> statement-breakpoint
CREATE TYPE "public"."wage_payment_mode" AS ENUM('cash', 'upi', 'bank');--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "adjustments_sequence_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" text NOT NULL,
	"target_table" "adjustment_target" NOT NULL,
	"target_id" text NOT NULL,
	"old_value" numeric(20, 3) NOT NULL,
	"new_value" numeric(20, 3) NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustment_values_differ" CHECK ("adjustments"."old_value" <> "adjustments"."new_value"),
	CONSTRAINT "adjustment_values_match_target" CHECK ((
        ("adjustments"."target_table" = 'stock_movements' and "adjustments"."old_value" between 0 and 99999999999.999
          and "adjustments"."new_value" between 0 and 99999999999.999) or
        ("adjustments"."target_table" = 'attendance' and "adjustments"."old_value" in (0, 1, 2) and "adjustments"."new_value" in (0, 1, 2)) or
        ("adjustments"."target_table" = 'wage_payments'
          and "adjustments"."old_value" between 1 and 9007199254740991 and "adjustments"."new_value" between 1 and 9007199254740991
          and "adjustments"."old_value" = trunc("adjustments"."old_value") and "adjustments"."new_value" = trunc("adjustments"."new_value"))
      )),
	CONSTRAINT "adjustment_reason_valid" CHECK (length(btrim("adjustments"."reason")) between 10 and 2000)
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"work_date" date NOT NULL,
	"half_days" integer NOT NULL,
	"rate_paise" bigint NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_project_worker_date_unique" UNIQUE("project_id","worker_id","work_date"),
	CONSTRAINT "attendance_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "attendance_half_days_valid" CHECK ("attendance"."half_days" in (0, 1, 2)),
	CONSTRAINT "attendance_rate_paise_valid" CHECK ("attendance"."rate_paise" between 2 and 9007199254740991 and "attendance"."rate_paise" % 2 = 0)
);
--> statement-breakpoint
CREATE TABLE "wage_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"kind" "wage_payment_kind" NOT NULL,
	"mode" "wage_payment_mode" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wage_payments_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "wage_payment_amount_paise_valid" CHECK ("wage_payments"."amount_paise" between 1 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_project_worker_fk" FOREIGN KEY ("project_id","worker_id") REFERENCES "public"."workers"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_payments" ADD CONSTRAINT "wage_payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_payments" ADD CONSTRAINT "wage_payments_project_worker_fk" FOREIGN KEY ("project_id","worker_id") REFERENCES "public"."workers"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adjustments_sequence_no_unique" ON "adjustments" USING btree ("sequence_no");--> statement-breakpoint
CREATE INDEX "adjustments_project_sequence_idx" ON "adjustments" USING btree ("project_id","sequence_no");--> statement-breakpoint
CREATE INDEX "adjustments_effective_target_idx" ON "adjustments" USING btree ("project_id","target_table","target_id","sequence_no");--> statement-breakpoint
CREATE INDEX "adjustments_project_time_idx" ON "adjustments" USING btree ("project_id","created_at","sequence_no");--> statement-breakpoint
CREATE INDEX "attendance_project_day_idx" ON "attendance" USING btree ("project_id","work_date","worker_id");--> statement-breakpoint
CREATE INDEX "wage_payments_project_day_idx" ON "wage_payments" USING btree ("project_id","paid_on","worker_id");--> statement-breakpoint
CREATE INDEX "wage_payments_worker_day_idx" ON "wage_payments" USING btree ("project_id","worker_id","paid_on");
--> statement-breakpoint
CREATE FUNCTION slate_validate_adjustment_target() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_table = 'stock_movements' THEN
    PERFORM 1 FROM stock_movements
      WHERE id = NEW.target_id AND project_id = NEW.project_id AND type <> 'adjustment';
  ELSIF NEW.target_table = 'attendance' THEN
    PERFORM 1 FROM attendance
      WHERE id = NEW.target_id AND project_id = NEW.project_id;
  ELSE
    PERFORM 1 FROM wage_payments
      WHERE id = NEW.target_id AND project_id = NEW.project_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction target is missing or belongs to another project'
      USING ERRCODE = '23503', CONSTRAINT = 'adjustments_project_target_fk';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER adjustments_project_target_guard BEFORE INSERT ON adjustments
FOR EACH ROW EXECUTE FUNCTION slate_validate_adjustment_target();
--> statement-breakpoint
CREATE TRIGGER attendance_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON attendance
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER wage_payments_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON wage_payments
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER adjustments_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON adjustments
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
