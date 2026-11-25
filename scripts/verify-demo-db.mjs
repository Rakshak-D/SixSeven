import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const uri = new URL(process.env.DATABASE_URL);
const sql = postgres(uri.href, { max: 1, connect_timeout: 5, onnotice: () => {} });
(async () => {
  try {
    const [row] = await sql.unsafe(
      "select current_database() as db, current_user as role, system_identifier::text as identity from pg_control_system()",
    );
    if (
      row.db !== process.env.SLATE_MIGRATION_DATABASE ||
      row.role !== "slate" ||
      row.identity !== process.argv[2]
    )
      throw new Error();
    const [result] = await sql.unsafe(
      "select not exists(select 1 from pg_namespace where nspname = 'drizzle') and not exists(select 1 from pg_namespace where nspname <> 'public' and nspname <> 'information_schema' and nspname !~ '^pg_') and not exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') as fresh",
    );
    if (!result.fresh) {
      const journal = JSON.parse(readFileSync("src/db/migrations/meta/_journal.json", "utf8"));
      const applied = await sql.unsafe(
        "select hash, created_at::text as applied_at from drizzle.__drizzle_migrations order by created_at, id",
      );
      const hash = (text) => createHash("sha256").update(text).digest("hex");
      if (
        !applied.length ||
        applied.length > journal.entries.length ||
        applied.some((migration, index) => {
          const expected = journal.entries[index];
          const content = readFileSync(`src/db/migrations/${expected.tag}.sql`, "utf8");
          const lf = content.replace(/\r\n/g, "\n");
          return (
            String(expected.when) !== migration.applied_at ||
            ![hash(content), hash(lf), hash(lf.replace(/\n/g, "\r\n"))].includes(migration.hash)
          );
        })
      ) {
        throw new Error();
      }
    }
    console.log(result.fresh ? "fresh" : "existing");
  } catch {
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 2 });
  }
})();
