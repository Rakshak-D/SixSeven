import { sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { FraudFlags } from "@/shared/schemas/summary";

export async function listFraudFlags(tx: Transaction, projectId: string, today: string) {
  const rows = await tx.execute(sql`
    with flags as (
      select 'new_supplier' as kind, 'supplier' as "refType", s.id as "refId",
        (s.created_at at time zone 'Asia/Kolkata')::date as date
      from suppliers s where s.project_id = ${projectId}
        and (s.created_at at time zone 'Asia/Kolkata')::date between ${today}::date - 6 and ${today}::date
      union all
      select 'bank_change', 'supplier', s.id, (s.bank_requested_at at time zone 'Asia/Kolkata')::date
      from suppliers s where s.project_id = ${projectId} and s.bank_requested_at is not null
        and (s.bank_effective_at is null or s.bank_effective_at > now())
      union all
      select 'missing_engineer_confirmation', 'delivery', d.id, d.occurred_on + 2
      from stock_movements d where d.project_id = ${projectId} and d.type = 'delivery'
        and d.occurred_on between ${today}::date - 30 and ${today}::date - 2
        and not exists (select 1 from delivery_verifications v where v.project_id = d.project_id and v.delivery_id = d.id)
      union all
      select 'unusual_material_price', 'delivery', d.id, d.occurred_on
      from stock_movements d
      cross join lateral (
        select count(*) as samples, avg(unit_cost_paise) as mean from (
          select prior.unit_cost_paise from stock_movements prior
          where prior.project_id = d.project_id and prior.material_id = d.material_id and prior.type = 'delivery'
            and prior.unit_cost_paise > 0 and (prior.occurred_on, prior.created_at, prior.id) < (d.occurred_on, d.created_at, d.id)
          order by prior.occurred_on desc, prior.created_at desc, prior.id desc limit 5
        ) as prices
      ) as baseline
      where d.project_id = ${projectId} and d.type = 'delivery'
        and d.occurred_on between ${today}::date - 30 and ${today}::date
        and baseline.samples >= 3 and d.unit_cost_paise * 4::numeric > baseline.mean * 5
      union all
      select 'payment_without_verified_delivery', 'supplierPayment', p.id,
        (p.decided_at at time zone 'Asia/Kolkata')::date
      from supplier_payments p where p.project_id = ${projectId} and p.status = 'paid'
        and not exists(select 1 from delivery_verifications v where v.project_id = p.project_id and v.delivery_id = p.delivery_id)
      union all
      select 'repeated_delivery_delays', 'expectedDelivery', (array_agg(e.id order by e.expected_on desc, e.id))[1],
        max(e.expected_on)
      from expected_deliveries e where e.project_id = ${projectId} and e.status = 'rejected'
        and e.rescheduled_on is not null and e.expected_on between ${today}::date - 30 and ${today}::date
      group by lower(btrim(e.supplier)), e.material_id having count(*) >= 2
    )
    select kind, "refType", "refId", date::text as "raisedOn" from flags
    order by date desc, kind, "refId" limit 100
  `);
  return FraudFlags.parse(rows);
}
