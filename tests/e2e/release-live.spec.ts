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
    await signedIn.waitForURL("**/projects", { timeout: 20000 });
    await expect(signedIn.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(signedIn.getByRole("link", { name: /Greenfield Home/ })).toBeVisible();
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}

test.use({ trace: "off", screenshot: "off", video: "off" });

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
        const name = `Release test ${crypto.randomUUID()}`;
        await desktop.getByRole("button", { name: "Start a project" }).click();
        await desktop.getByLabel("Project name").fill(name);
        await desktop.getByLabel("Site location").fill("Test site");
        await desktop.getByLabel("Budget (₹)").fill("120000");
        await desktop.getByRole("button", { name: "Start project", exact: true }).click();
        await expect(desktop.getByRole("heading", { name: "Invite someone" })).toBeVisible();
        for (const [role, context] of [
          ["owner", owner],
          ["contractor", contractor],
        ] as const) {
          await desktop.getByLabel("Their email or mobile number").fill(DemoAccountEmail[role]);
          await desktop.getByRole("combobox", { name: "Their role" }).click();
          await desktop.getByRole("option", { name: role, exact: false }).click();
          await desktop.getByRole("button", { name: "Invite", exact: true }).click();
          await expect(desktop.getByText(DemoAccountEmail[role], { exact: false })).toBeVisible();
          const memberPage = context.pages()[0];
          await memberPage.reload();
          const invitations = memberPage.getByRole("region", { name: "Your invitations" });
          const row = invitations.getByRole("listitem").filter({ hasText: name });
          await row.getByRole("button", { name: "Accept" }).click();
          await expect(memberPage.getByRole("link", { name: new RegExp(name) })).toBeVisible();
          await memberPage.reload();
          await expect(memberPage.getByRole("link", { name: new RegExp(name) })).toBeVisible();
        }
        await desktop.reload();
        await expect(desktop.getByText("Accepted", { exact: true })).toHaveCount(2);
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
