import { defineConfig, devices } from "@playwright/test";

// Local only (not in CI): run `pnpm test:e2e` against a migrated + seeded DB before the demo.
const externalBaseURL = process.env.SLATE_E2E_BASE_URL;

export default defineConfig({
  timeout: 90000,
  expect: { timeout: 15000 },
  testDir: "./tests/e2e",
  use: { baseURL: externalBaseURL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000/api/v1/health",
        reuseExistingServer: false,
        env: { NEXT_PUBLIC_USE_MOCKS: "0" },
      },
});
