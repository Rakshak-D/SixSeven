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
    const guards =
      await upgrade`select tgname from pg_trigger where tgname in ('stock_movements_append_only', 'audit_log_append_only')`;
    expect(guards).toHaveLength(2);
  } finally {
    await upgrade.end();
    await sql`drop database ${sql(database)}`;
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
  expect(await sql`select id from materials where project_id = 'demo-greenfield'`).toHaveLength(3);
  expect(await sql`select id from workers where project_id = 'demo-greenfield'`).toHaveLength(2);
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
  const [creator] = await sql`select created_by from projects where id = 'demo-greenfield'`;
  const id = crypto.randomUUID();
  await expect(sql`insert into stock_movements (id, project_id, material_id, type, qty, occurred_on, created_by)
    values (${id}, 'demo-greenfield', 'demo-cement', 'usage', 1, '2026-11-25', ${creator.created_by})`).rejects.toMatchObject(
    { code: "23514" },
  );
  await sql`insert into stock_movements (id, project_id, material_id, type, qty, unit_cost_paise, supplier, challan_no, occurred_on, created_by)
    values (${id}, 'demo-greenfield', 'demo-cement', 'delivery', 12.375, 41500, 'Local Supply', ${id}, '2026-11-25', ${creator.created_by})`;
  await expect(sql`insert into stock_movements (id, project_id, material_id, type, qty, unit_cost_paise, supplier, challan_no, occurred_on, created_by)
    values (${crypto.randomUUID()}, 'demo-greenfield', 'demo-sand', 'delivery', 1, 41500, ' local supply ', ${` ${id.toUpperCase()} `}, '2026-11-25', ${creator.created_by})`).rejects.toMatchObject(
    { code: "23505", constraint_name: "stock_delivery_supplier_challan_unique" },
  );
  await sql`insert into audit_log (id, project_id, actor_id, action, entity, entity_id)
    values (${id}, 'demo-greenfield', ${creator.created_by}, 'created', 'delivery', ${id})`;
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
