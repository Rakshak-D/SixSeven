CREATE TABLE "supplier_delegations" (
	"project_id" text PRIMARY KEY NOT NULL,
	"engineer_id" text NOT NULL,
	"cap_paise" bigint NOT NULL,
	"remaining_paise" bigint NOT NULL,
	CONSTRAINT "supplier_delegate_budget" CHECK ("supplier_delegations"."cap_paise" between 1 and 9007199254740991 and "supplier_delegations"."remaining_paise" between 0 and "supplier_delegations"."cap_paise")
);
--> statement-breakpoint
ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payment_state";--> statement-breakpoint
ALTER TABLE "supplier_delegations" ADD CONSTRAINT "supplier_delegations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_delegations" ADD CONSTRAINT "supplier_delegate_member_fk" FOREIGN KEY ("project_id","engineer_id") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payment_state" CHECK (
    ("supplier_payments"."status" = 'pending' and "supplier_payments"."amount_paise" = 0 and "supplier_payments"."decided_at" is null and "supplier_payments"."paid_by" is null)
    or ("supplier_payments"."status" = 'paid' and "supplier_payments"."amount_paise" between 1 and 9007199254740991 and "supplier_payments"."decided_at" is not null and
      "supplier_payments"."paid_by" is not null and "supplier_payments"."paid_by" in ('autopay','owner','delegate') and "supplier_payments"."supplier_id" is not null and "supplier_payments"."order_id" is not null)
    or ("supplier_payments"."status" = 'declined' and "supplier_payments"."amount_paise" = 0 and "supplier_payments"."decided_at" is not null and "supplier_payments"."paid_by" is null)
  );