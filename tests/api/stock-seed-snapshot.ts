import { lstat, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
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
    const expenses = await sql`select id, amount_paise, occurred_on, description, created_by
      from expenses where project_id = 'demo-greenfield' order by id`;
    const progress = await sql`select id, note, checklist_item_id, created_by
      from progress_updates where project_id = 'demo-greenfield' order by id`;
    const photos = await sql`select id, progress_id, mime, size_bytes, taken_on, storage_key
      from progress_photos where project_id = 'demo-greenfield' order by id`;
    const workspaceRoot = resolve(process.cwd());
    const storageRoot = resolve(workspaceRoot, process.env.UPLOAD_DIR ?? ".cache/uploads");
    const localPath = relative(workspaceRoot, storageRoot);
    if (!localPath || localPath === ".." || localPath.startsWith(`..${sep}`))
      throw new Error("Photo snapshot directory must stay inside the workspace");
    let current = workspaceRoot;
    for (const part of localPath.split(sep)) {
      current = join(current, part);
      const entry = await lstat(current);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new Error("Photo snapshot directory must be a real project-local directory");
    }
    const storedFiles = (await readdir(storageRoot)).sort();
    console.log(
      JSON.stringify({
        balances,
        movements,
        audits,
        attendance,
        payments,
        adjustments,
        expenses,
        progress,
        photos,
        storedFiles,
      }),
    );
  } finally {
    await sql.end();
  }
}

snapshot().catch(() => {
  console.error("Unable to snapshot demo seed");
  process.exitCode = 1;
});
