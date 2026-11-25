import { defineConfig, devices } from "@playwright/test";

// Local only (not in CI): run `pnpm test:e2e` against a migrated + seeded DB before the demo.
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/api/v1/health",
    reuseExistingServer: true,
  },
});
