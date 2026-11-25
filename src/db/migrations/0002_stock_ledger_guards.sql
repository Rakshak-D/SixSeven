CREATE UNIQUE INDEX "stock_delivery_supplier_challan_unique" ON "stock_movements" USING btree ("project_id",lower(btrim("supplier")),lower(btrim("challan_no"))) WHERE "stock_movements"."type" = 'delivery';
--> statement-breakpoint
CREATE FUNCTION slate_reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON stock_movements
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION slate_reject_ledger_mutation();
