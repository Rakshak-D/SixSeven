import { getDatabase } from "@/db/client";
import { testDatabase } from "./database-fixture";

async function snapshot() {
  testDatabase();
  const { sql } = getDatabase();
  try {
    const balances =
      await sql`select id, stock_qty from materials where project_id = 'demo-greenfield' order by id`;
    const movements =
      await sql`select id, material_id, qty from stock_movements where project_id = 'demo-greenfield' order by id`;
    const audits =
      await sql`select id, entity_id from audit_log where project_id = 'demo-greenfield' order by id`;
    const attendance = await sql`select id, worker_id, work_date, half_days, rate_paise
      from attendance where project_id = 'demo-greenfield' order by id`;
    const payments = await sql`select id, worker_id, amount_paise, kind, mode, paid_on
      from wage_payments where project_id = 'demo-greenfield' order by id`;
    const adjustments = await sql`select id, target_table, target_id, old_value, new_value, actor_id
      from adjustments where project_id = 'demo-greenfield' order by sequence_no`;
    console.log(JSON.stringify({ balances, movements, audits, attendance, payments, adjustments }));
  } finally {
    await sql.end();
  }
}

snapshot().catch(() => {
  console.error("Unable to snapshot demo seed");
  process.exitCode = 1;
});
