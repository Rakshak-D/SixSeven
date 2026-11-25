import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/db/config";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const url = process.env.DATABASE_URL ? databaseUrl() : undefined;
if (process.argv.includes("migrate")) {
  if (!url || process.env.SLATE_MIGRATION_DATABASE !== url.pathname.slice(1)) {
    throw new Error("Set DATABASE_URL and confirm its database name with SLATE_MIGRATION_DATABASE");
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  out: "./src/db/migrations",
  ...(url && { dbCredentials: { url: url.href } }),
  strict: true,
});
