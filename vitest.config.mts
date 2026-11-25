import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile();
} catch {
  // no .env: use the environment (CI)
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/api/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // API tests share one real Postgres; run files one at a time so they don't fight over rows.
    fileParallelism: false,
  },
});
