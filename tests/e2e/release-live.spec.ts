import { type Browser, expect, type Page, test } from "@playwright/test";
import { DemoAccountEmail } from "../../src/shared/schemas/auth";

async function signIn(browser: Browser, page: Page, role: keyof typeof DemoAccountEmail) {
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const signedIn = await context.newPage();
    await signedIn.goto("/login");
    await signedIn.getByLabel("Email").fill(DemoAccountEmail[role]);
    const password = process.env.SLATE_DEMO_PASSWORD;
    if (!password) throw new Error("Set SLATE_DEMO_PASSWORD for the disposable seeded database");
    await signedIn.getByLabel("Password").fill(password);
    await signedIn.getByRole("button", { name: "Sign in" }).click();
    await expect(signedIn.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(signedIn.getByRole("link", { name: /Greenfield Home/ })).toBeVisible();
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}

test("three real sessions preserve project access and wage privacy after reload", async ({
  browser,
  page,
}) => {
  await page.goto("/login");
  const engineer = await signIn(browser, page, "engineer");
  try {
    const owner = await signIn(browser, page, "owner");
    try {
      const contractor = await signIn(browser, page, "contractor");
      try {
        const desktop = engineer.pages()[0];
        await desktop.reload();
        await expect(desktop.getByRole("link", { name: /Greenfield Home/ })).toBeVisible();
        expect(
          (await engineer.request.get("/api/v1/projects/demo-greenfield/wage-payments")).status(),
        ).toBe(403);
        expect(
          (await owner.request.get("/api/v1/projects/demo-greenfield/wage-payments")).status(),
        ).toBe(200);
        expect((await contractor.request.get("/api/v1/projects/demo-isolated")).status()).toBe(404);
        expect((await page.request.get("/api/v1/projects")).status()).toBe(401);
      } finally {
        await contractor.close();
      }
    } finally {
      await owner.close();
    }
  } finally {
    await engineer.close();
  }
});
