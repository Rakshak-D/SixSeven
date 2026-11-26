import { defineConfig, devices } from "@playwright/test";

// Local only (not in CI): run `pnpm test:e2e` against a migrated + seeded DB before the demo.
const externalBaseURL = process.env.SLATE_E2E_BASE_URL;
if (externalBaseURL) {
  const url = new URL(externalBaseURL);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.origin !== externalBaseURL ||
    process.env.SLATE_E2E_DISPOSABLE !== "1"
  ) {
    throw new Error("Point browser tests at an isolated local app and set SLATE_E2E_DISPOSABLE=1");
  }
} else {
  const database = URL.parse(process.env.DATABASE_URL ?? "");
  if (
    process.env.SLATE_TEST_DATABASE !== "1" ||
    !database ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    !/^\/slate_test(?:_[a-zA-Z0-9_-]+)?$/.test(database.pathname)
  ) {
    throw new Error(
      "Browser tests need an explicitly configured disposable loopback test database",
    );
  }
}

export default defineConfig({
  timeout: 90000,
  expect: { timeout: 15000 },
  testDir: "./tests/e2e",
  use: {
    baseURL: externalBaseURL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-fake-device-for-media-stream"] },
  },
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
