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
    console.log(JSON.stringify({ balances, movements, audits }));
  } finally {
    await sql.end();
  }
}

snapshot().catch(() => {
  console.error("Unable to snapshot stock seed");
  process.exitCode = 1;
});
