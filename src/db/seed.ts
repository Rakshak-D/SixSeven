// Lane A: `pnpm db:seed`. Spec in src/db/AGENTS.md (Faker en_IN, demo users, Greenfield Home project).
import { sql } from "./client";

async function main() {
  console.log("seed: nothing to seed yet");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
