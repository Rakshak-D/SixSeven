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
        const contractorPage = contractor.pages()[0];
        await contractorPage.getByRole("link", { name: new RegExp(name) }).click();
        await contractorPage.getByRole("button", { name: "Add material" }).click();
        await contractorPage.getByLabel("Material name").fill("Release cement");
        await contractorPage.getByLabel("Unit", { exact: true }).fill("bag");
        await contractorPage.getByLabel("Planned quantity").fill("30");
        await contractorPage.getByLabel("Unit cost (₹)").fill("450");
        await contractorPage.getByLabel("Tolerance (%)").fill("5");
        await contractorPage.getByLabel("Low-stock threshold").fill("3");
        await contractorPage.getByLabel("Track unique bag codes").check();
        await contractorPage.getByRole("button", { name: "Save material" }).click();
        await expect(contractorPage.getByText("Material saved.")).toBeVisible();
        await contractorPage.keyboard.press("Escape");
        await contractorPage.getByRole("button", { name: "Manage workers" }).click();
        await contractorPage.getByLabel("Worker name").fill("Release mason");
        await contractorPage.getByLabel("Trade").fill("Mason");
        await contractorPage.getByLabel("Daily rate (₹)").fill("900");
        await contractorPage.getByRole("button", { name: "Add worker" }).click();
        await expect(contractorPage.getByText("Worker added.")).toBeVisible();
        await contractorPage.getByRole("button", { name: "Deactivate Release mason" }).click();
        await contractorPage.getByLabel("Deactivation reason").fill("Release fixture completed");
        await contractorPage.getByRole("button", { name: "Confirm deactivation" }).click();
        await expect(contractorPage.getByText("Worker deactivated.")).toBeVisible();
        const path = new URL(contractorPage.url()).pathname;
        const materials = await (await contractor.request.get(`/api/v1${path}/materials`)).json();
        expect(materials).toEqual([
          expect.objectContaining({ name: "Release cement", tracksBags: true }),
        ]);
        const workers = await (await contractor.request.get(`/api/v1${path}/workers`)).json();
        expect(workers).toEqual([
          expect.objectContaining({ name: "Release mason", active: false }),
        ]);
        await contractorPage.keyboard.press("Escape");
        const expected = contractorPage.getByRole("region", { name: "Expected deliveries" });
        await expected.getByText("Schedule delivery", { exact: true }).click();
        await expected.getByLabel("Expected quantity").fill("2");
        await expected.getByLabel("Expected supplier").fill("Synthetic release supplier");
        await expected.getByRole("button", { name: "Save schedule" }).click();
        await expect(expected.getByText(/Synthetic release supplier.*pending/)).toBeVisible();
        await expected.getByText("Record arrival or rejection").click();
        await expected.getByLabel("Unit cost (₹)").fill("450");
        await expected.getByLabel("Challan number").fill("RELEASE-1");
        await expected.getByLabel("Arrival note").fill("Synthetic delivery for the release test");
        await expected.getByRole("button", { name: "Record arrival" }).click();
        await expect(expected.getByText(/Synthetic release supplier.*accepted/)).toBeVisible();
        const teamPath = new URL(desktop.url()).pathname;
        await desktop.goto(path);
        await desktop.getByRole("button", { name: "Verify", exact: true }).click();
        await desktop.getByLabel("Your note").fill("Counted both sealed bags on site");
        await desktop.getByLabel("Bag codes").fill("release-a\nrelease-b");
        await desktop.getByRole("button", { name: "It arrived as recorded" }).click();
        await expect(desktop.getByText("Every delivery is checked.")).toBeVisible();
        await contractorPage.getByRole("tab", { name: "Usage" }).click();
        const usage = contractorPage.getByRole("form", { name: "Record usage" });
        const fillUsage = async () => {
          await usage.getByLabel(/Quantity/).fill("1");
          await usage.getByLabel("Where was it used?").fill("Test slab");
          await usage.getByLabel("Registered bag codes").fill("release-a");
          await usage.getByRole("button", { name: "Save usage" }).click();
        };
        await fillUsage();
        await expect(usage.getByText(/Saved. On site now/)).toBeVisible();
        await fillUsage();
        await expect(usage.getByRole("alert")).toBeVisible();
        const stock = await (await contractor.request.get(`/api/v1${path}/stock`)).json();
        expect(stock).toEqual([
          expect.objectContaining({ materialId: materials[0].id, balance: 1 }),
        ]);
        await desktop.goto(teamPath);
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
