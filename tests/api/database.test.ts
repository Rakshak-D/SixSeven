import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { beforeAll, expect, it } from "vitest";
import { getDatabase } from "@/db/client";
import { testDatabase } from "./database-fixture";

beforeAll(() => {
  testDatabase();
});

const migrations = "src/db/migrations";

it("has applied the fresh migration history on the disposable database", async () => {
  const { sql } = getDatabase();
  const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8"));
  const rows = await sql`select id from drizzle.__drizzle_migrations`;
  expect(rows).toHaveLength(journal.entries.length);
});

it("upgrades a separate empty database with only the original baseline applied", async () => {
  const url = testDatabase();
  const { sql } = getDatabase();
  const database = `slate_test_upgrade_${crypto.randomUUID().replaceAll("-", "")}`;
  await sql`create database ${sql(database)}`;
  url.pathname = `/${database}`;
  const upgrade = postgres(url.href, { max: 1 });
  try {
    await mkdir(".cache", { recursive: true });
    const initial = await mkdtemp(".cache/m2-baseline-");
    await mkdir(join(initial, "meta"));
    const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8"));
    await writeFile(
      join(initial, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );
    await copyFile(join(migrations, "0000_init.sql"), join(initial, "0000_init.sql"));

    const db = drizzle(upgrade);
    await migrate(db, { migrationsFolder: initial });
    expect(await upgrade`select id from drizzle.__drizzle_migrations`).toHaveLength(1);
    expect(await upgrade`select to_regclass('public.projects') as name`).toEqual([{ name: null }]);
    await migrate(db, { migrationsFolder: migrations });
    expect(await upgrade`select id from drizzle.__drizzle_migrations`).toHaveLength(
      journal.entries.length,
    );
    expect(await upgrade`select to_regclass('public.projects') is not null as present`).toEqual([
      { present: true },
    ]);
    const guards = await upgrade`select tgname from pg_trigger where tgname in (
        'stock_movements_append_only', 'audit_log_append_only',
        'attendance_append_only', 'wage_payments_append_only', 'adjustments_append_only',
        'adjustments_project_target_guard'
      )`;
    expect(guards).toHaveLength(6);
    expect(
      await upgrade`select to_regclass('public.supplier_payments') is not null as present`,
    ).toEqual([{ present: true }]);
  } finally {
    await upgrade.end();
    await sql`drop database ${sql(database)}`;
  }
}, 25_000);

it("creates project-scoped append-only attendance, wage and correction tables", async () => {
  const { sql } = getDatabase();
  const tables = await sql`select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('attendance', 'wage_payments', 'adjustments')`;
  expect(tables.map(({ table_name }) => table_name).sort()).toEqual([
    "adjustments",
    "attendance",
    "wage_payments",
  ]);

  const [contractor] = await sql`select id from "user" where email = 'contractor@demo.invalid'`;
  const workerId = `ledger-worker-${crypto.randomUUID()}`;
  await sql`insert into workers (id, project_id, name, category, daily_rate_paise)
    values (${workerId}, 'demo-greenfield', 'Ledger fixture', 'mason', 90000)`;
  const attendanceId = crypto.randomUUID();
  await sql`insert into attendance (id, project_id, worker_id, work_date, half_days, rate_paise, created_by)
    values (${attendanceId}, 'demo-greenfield', ${workerId}, '2026-11-25', 1, 90000, ${contractor.id})`;
  await expect(sql`insert into attendance (id, project_id, worker_id, work_date, half_days, rate_paise, created_by)
    values (${crypto.randomUUID()}, 'demo-greenfield', ${workerId}, '2026-11-25', 2, 90000, ${contractor.id})`).rejects.toMatchObject(
    { code: "23505", constraint_name: "attendance_project_worker_date_unique" },
  );
  await expect(sql`insert into attendance (id, project_id, worker_id, work_date, half_days, rate_paise, created_by)
    values (${crypto.randomUUID()}, 'demo-greenfield', ${workerId}, '2026-11-26', 3, 90000, ${contractor.id})`).rejects.toMatchObject(
    { code: "23514" },
  );

  const paymentId = crypto.randomUUID();
  await sql`insert into wage_payments (id, project_id, worker_id, amount_paise, kind, mode, paid_on, reference, note, created_by)
    values (${paymentId}, 'demo-greenfield', ${workerId}, 25000, 'wage', 'upi', '2026-11-25', '202611250003', 'Synthetic payment', ${contractor.id})`;
  const adjustmentId = crypto.randomUUID();
  await sql`insert into adjustments (id, project_id, target_table, target_id, old_value, new_value, reason, actor_id)
    values (${adjustmentId}, 'demo-greenfield', 'attendance', ${attendanceId}, 1, 2, 'Verified signed site sheet', ${contractor.id})`;
  await expect(sql`insert into adjustments (id, project_id, target_table, target_id, old_value, new_value, reason, actor_id)
    values (${crypto.randomUUID()}, 'demo-isolated', 'attendance', ${attendanceId}, 1, 2, 'Wrong project target check', ${contractor.id})`).rejects.toMatchObject(
    { code: "23503" },
  );
  await expect(
    sql`insert into adjustments (id, project_id, target_table, target_id, old_value, new_value, reason, actor_id)
      values (${crypto.randomUUID()}, 'demo-greenfield', 'stock_movements', 'demo-stock-cement-correction', 1, 2, 'Cannot correct a compensation', ${contractor.id})`,
  ).rejects.toMatchObject({ code: "23503", constraint_name: "adjustments_project_target_fk" });
  await expect(
    sql`insert into adjustments (id, project_id, target_table, target_id, old_value, new_value, reason, actor_id)
      values (${crypto.randomUUID()}, 'demo-greenfield', 'attendance', ${attendanceId}, 1, 1, 'Same value is not a correction', ${contractor.id})`,
  ).rejects.toMatchObject({ code: "23514", constraint_name: "adjustment_values_differ" });
  await expect(
    sql`insert into wage_payments (id, project_id, worker_id, amount_paise, kind, mode, paid_on, note, created_by)
      values (${crypto.randomUUID()}, 'demo-greenfield', ${workerId}, 0, 'wage', 'cash', '2026-11-25', 'Synthetic payment', ${contractor.id})`,
  ).rejects.toMatchObject({ code: "23514", constraint_name: "wage_payment_amount_paise_valid" });
  await expect(
    sql`insert into wage_payments (id, project_id, worker_id, amount_paise, kind, mode, paid_on, created_by)
      values (${crypto.randomUUID()}, 'demo-greenfield', ${workerId}, 100, 'wage', 'crypto', '2026-11-25', ${contractor.id})`,
  ).rejects.toMatchObject({ code: "22P02" });

  for (const [table, id] of [
    ["attendance", attendanceId],
    ["wage_payments", paymentId],
    ["adjustments", adjustmentId],
  ] as const) {
    await expect(sql`update ${sql(table)} set id = id where id = ${id}`).rejects.toMatchObject({
      code: "55000",
    });
    await expect(sql`delete from ${sql(table)} where id = ${id}`).rejects.toMatchObject({
      code: "55000",
    });
    await expect(sql`truncate table ${sql(table)}`).rejects.toMatchObject({ code: "55000" });
  }
});

it("enforces seed identity, membership uniqueness and foreign keys", async () => {
  const { sql } = getDatabase();
  const [creator] = await sql`select created_by from projects where id = 'demo-greenfield'`;
  expect(creator).toBeDefined();
  expect(
    await sql`select id from "user" where email in (
    'owner@demo.invalid', 'contractor@demo.invalid', 'engineer@demo.invalid', 'isolated@demo.invalid'
  )`,
  ).toHaveLength(4);
  expect(
    await sql`select id from materials where project_id = 'demo-greenfield'
    and id in ('demo-cement', 'demo-sand', 'demo-steel')`,
  ).toHaveLength(3);
  expect(
    await sql`select id from workers where project_id = 'demo-greenfield'
    and id in ('demo-mason', 'demo-helper')`,
  ).toHaveLength(2);
  await expect(sql`insert into project_members (project_id, user_id, role)
    values ('demo-greenfield', ${creator.created_by}, 'owner')`).rejects.toMatchObject({
    code: "23505",
  });
  await expect(sql`insert into project_members (project_id, user_id, role)
    values ('no-project', ${creator.created_by}, 'owner')`).rejects.toMatchObject({
    code: "23503",
  });
  await expect(sql`insert into project_members (project_id, user_id, role)
    values ('demo-greenfield', 'no-account', 'owner')`).rejects.toMatchObject({ code: "23503" });
  await expect(sql`insert into stock_movements (id, project_id, material_id, type, qty, occurred_on, created_by)
    values ('wrong-site', 'demo-isolated', 'demo-cement', 'usage', -1, '2026-11-25', ${creator.created_by})`).rejects.toMatchObject(
    { code: "23503", constraint_name: "stock_movement_project_material_fk" },
  );
});

it("enforces safe money, valid quantities, normalized challans and append-only history", async () => {
  const { sql } = getDatabase();
  await expect(
    sql`update projects set budget_paise = -1 where id = 'demo-greenfield'`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update projects set budget_paise = 9007199254740992 where id = 'demo-greenfield'`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update workers set daily_rate_paise = 90001 where id = 'demo-mason'`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update materials set stock_qty = -0.001 where id = 'demo-cement'`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update materials set stock_qty = 'NaN' where id = 'demo-cement'`,
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sql`update materials set stock_qty = 100000000000 where id = 'demo-cement'`,
  ).rejects.toMatchObject({ code: "22003" });
  const [creator] = await sql`select created_by from projects where id = 'demo-isolated'`;
  const id = crypto.randomUUID();
  const materialId = crypto.randomUUID();
  await sql`insert into materials (id, project_id, name, unit, planned_qty, unit_cost_paise, tolerance_pct, low_stock_qty)
    values (${materialId}, 'demo-isolated', 'Constraint fixture', 'bag', 20, 41500, 5, 1)`;
  await expect(sql`insert into stock_movements (id, project_id, material_id, type, qty, occurred_on, created_by)
    values (${id}, 'demo-isolated', ${materialId}, 'usage', 1, '2026-11-25', ${creator.created_by})`).rejects.toMatchObject(
    { code: "23514" },
  );
  await sql.begin(async (tx) => {
    await tx`insert into stock_movements (id, project_id, material_id, type, qty, unit_cost_paise, supplier, challan_no, occurred_on, created_by)
      values (${id}, 'demo-isolated', ${materialId}, 'delivery', 12.375, 41500, 'Local Supply', ${id}, '2026-11-25', ${creator.created_by})`;
    await tx`update materials set stock_qty = stock_qty + 12.375 where id = ${materialId}`;
    await tx`insert into audit_log (id, project_id, actor_id, action, entity, entity_id)
      values (${id}, 'demo-isolated', ${creator.created_by}, 'created', 'delivery', ${id})`;
  });
  await expect(sql`insert into stock_movements (id, project_id, material_id, type, qty, unit_cost_paise, supplier, challan_no, occurred_on, created_by)
    values (${crypto.randomUUID()}, 'demo-isolated', ${materialId}, 'delivery', 1, 41500, ' local supply ', ${` ${id.toUpperCase()} `}, '2026-11-25', ${creator.created_by})`).rejects.toMatchObject(
    { code: "23505", constraint_name: "stock_delivery_supplier_challan_unique" },
  );
  await expect(sql`update stock_movements set qty = 1 where id = ${id}`).rejects.toMatchObject({
    code: "55000",
  });
  await expect(sql`delete from stock_movements where id = ${id}`).rejects.toMatchObject({
    code: "55000",
  });
  await expect(sql`update audit_log set action = 'updated' where id = ${id}`).rejects.toMatchObject(
    { code: "55000" },
  );
  await expect(sql`delete from audit_log where id = ${id}`).rejects.toMatchObject({
    code: "55000",
  });
  expect(await sql`select id from audit_log where id = ${id}`).toEqual([{ id }]);
  expect(await sql`select qty from stock_movements where id = ${id}`).toEqual([{ qty: "12.375" }]);
});
