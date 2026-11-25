ALTER TYPE "public"."wage_payment_mode" ADD VALUE 'cheque';--> statement-breakpoint
ALTER TABLE "wage_payments" ADD CONSTRAINT "wage_payment_reference_by_mode" CHECK (case "wage_payments"."mode"::text
      when 'cash' then true
      when 'upi' then "wage_payments"."reference" is not null and "wage_payments"."reference" ~ '^[0-9]{12}$'
      when 'bank' then "wage_payments"."reference" is not null and "wage_payments"."reference" ~ '^[A-Za-z0-9]{6,22}$'
      when 'cheque' then "wage_payments"."reference" is not null and "wage_payments"."reference" ~ '^[0-9]{6}$'
      else false end) NOT VALID;
