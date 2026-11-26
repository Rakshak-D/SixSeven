import { type Browser, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
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
        await contractorPage.keyboard.press("Escape");
        await contractorPage.getByRole("tab", { name: "Attendance" }).click();
        await contractorPage.getByText("Half", { exact: true }).click();
        await expect(contractorPage.getByRole("radio", { name: "Half" })).toBeChecked();
        await contractorPage.getByRole("button", { name: /Save.*1 half/ }).click();
        const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format();
        const projectPath = new URL(contractorPage.url()).pathname;
        const filter = `from=${date}&to=${date}`;
        const attendancePath = `/api/v1${projectPath}/attendance?${filter}`;
        await expect
          .poll(async () => {
            const rows = await (await contractor.request.get(attendancePath)).json();
            return rows[0]?.halfDays;
          })
          .toBe(1);
        const [attendance] = await (await contractor.request.get(attendancePath)).json();
        const request = await engineer.request.post(`/api/v1${projectPath}/change-requests`, {
          data: {
            kind: "attendance_fix",
            targetId: attendance.id,
            payload: { newValue: 2, reasonKind: "other", payFullDay: false },
            note: "Confirmed the full day's site work",
          },
        });
        expect(request.status()).toBe(201);
        const { id } = await request.json();
        const change = `/api/v1/change-requests/${id}`;
        expect(
          (
            await contractor.request.post(`${change}/vote`, {
              data: { approve: true, note: "Verified the site attendance record" },
            })
          ).status(),
        ).toBe(200);
        const accept = () =>
          owner.request.post(`${change}/decision`, {
            data: { accept: true, note: "Accepted the corrected attendance" },
          });
        expect((await accept()).status()).toBe(200);
        expect((await accept()).status()).toBe(409);
        const report = await (
          await owner.request.get(`/api/v1${projectPath}/wage-sheet?${filter}`)
        ).json();
        expect(report.workers).toEqual([
          expect.objectContaining({ name: "Release mason", halfDays: 2, accruedPaise: 90000 }),
        ]);
        const csv = await owner.request.get(
          `/api/v1${projectPath}/wage-sheet?${filter}&format=csv`,
        );
        expect(csv.status()).toBe(200);
        expect(await csv.text()).toContain("Release mason");
        const pdf = await owner.request.get(
          `/api/v1${projectPath}/wage-sheet?${filter}&format=pdf`,
        );
        expect(pdf.status()).toBe(200);
        expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
        const bytes = await sharp({
          create: { width: 32, height: 24, channels: 3, background: "#93aaba" },
        })
          .png()
          .toBuffer();
        const photo = { name: "synthetic-evidence.png", mimeType: "image/png", buffer: bytes };
        const capture = () => new Date().toISOString();
        const medical = await contractor.request.post(`/api/v1${projectPath}/medical-expenses`, {
          multipart: {
            workerId: attendance.workerId,
            billPaise: "24000",
            incidentOn: date,
            note: "Synthetic reimbursement claim",
            billPhotos: photo,
            capturedAt: capture(),
          },
        });
        expect(medical.status()).toBe(201);
        const claim = await medical.json();
        const [billPhoto] = claim.payload.billPhotos;
        expect((await engineer.request.get(billPhoto.url)).status()).toBe(404);
        const ownerPhoto = await owner.request.get(billPhoto.url);
        expect(ownerPhoto.status()).toBe(200);
        expect(await ownerPhoto.body()).toEqual(bytes);
        const reimburse = (payPaise: number) =>
          owner.request.post(`/api/v1/change-requests/${claim.id}/decision`, {
            data: { accept: true, payPaise, note: "Verified the synthetic bill" },
          });
        expect((await reimburse(24001)).status()).toBe(400);
        const reimbursed = await reimburse(12345);
        expect(reimbursed.status()).toBe(200);
        expect(await reimbursed.json()).toMatchObject({
          reimbursementProvider: "mock",
          payPaise: 12345,
        });
        expect((await reimburse(12345)).status()).toBe(409);
        const summary = await (await owner.request.get(`/api/v1${projectPath}/summary`)).json();
        expect(summary.spendSplit.otherPaise).toBe(12345);
        const checklists = `/api/v1${projectPath}/checklists`;
        const draft = await engineer.request.post(`${checklists}?source=template`, { data: {} });
        expect(draft.status()).toBe(200);
        const template = await draft.json();
        expect(template.source).toBe("template");
        const createChecklist = await engineer.request.post(`${checklists}/records`, {
          data: {
            draftId: template.draftId,
            title: "Synthetic steel checks",
            items: [{ ...template.draft.items[0], requiresSteelProof: true }],
          },
        });
        expect(createChecklist.status()).toBe(201);
        const {
          items: [item],
        } = await createChecklist.json();
        const itemPath = `/api/v1/checklist-items/${item.id}`;
        expect((await contractor.request.post(`${itemPath}/start`)).status()).toBe(200);
        const completion = await contractor.request.post(`${itemPath}/completion`, {
          multipart: {
            note: "Task completed with a synthetic photo",
            photos: photo,
            capturedAt: capture(),
          },
        });
        expect(completion.status()).toBe(200);
        const { progressId } = (await completion.json()).history.at(-1);
        const review = () =>
          engineer.request.post(`${itemPath}/review`, {
            data: {
              decision: "accept",
              progressId,
              note: "Reviewed the synthetic site evidence",
            },
          });
        expect((await review()).status()).toBe(409);
        expect(
          (
            await engineer.request.post(`${itemPath}/steel-proof`, {
              multipart: {
                progressId,
                note: "Synthetic steel evidence",
                photos: photo,
                capturedAt: capture(),
              },
            })
          ).status(),
        ).toBe(201);
        expect((await review()).status()).toBe(200);
        await contractorPage.getByRole("button", { name: "Manage workers" }).click();
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
        await contractorPage.getByRole("tab", { name: "Delivery" }).click();
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
        const apiPath = `/api/v1${path}`;
        const overviewPath = `${apiPath}/supplier-payments`;
        expect((await contractor.request.get(overviewPath)).status()).toBe(403);
        expect(
          (
            await owner.request.post(`${apiPath}/suppliers`, {
              data: {
                name: "Synthetic release supplier",
                gstin: "99ABCDE1234F1Z5",
                account: "100000000042",
                note: "Synthetic supplier for the browser test",
              },
            })
          ).status(),
        ).toBe(201);
        const supplierRead = await (await owner.request.get(overviewPath)).json();
        const [supplier] = supplierRead.suppliers;
        expect(supplier.accountLast4).toBe("0042");
        expect(supplier).not.toHaveProperty("account");
        const supplierRoute = `/api/v1/suppliers/${supplier.id}`;
        expect(
          (
            await owner.request.post(`${supplierRoute}/approve`, {
              data: { note: "Approved the synthetic supplier" },
            })
          ).status(),
        ).toBe(200);
        expect(
          (
            await owner.request.post(`${apiPath}/orders`, {
              data: {
                supplierId: supplier.id,
                materialId: materials[0].id,
                qty: 2,
                maxUnitPricePaise: 45000,
                note: "Approved two bags for the site",
              },
            })
          ).status(),
        ).toBe(201);
        const setCap = (perBillCapPaise: number) =>
          owner.request.put(`${supplierRoute}/autopay`, {
            data: {
              enabled: true,
              paused: false,
              perBillCapPaise,
              perWeekCapPaise: 100000,
              note: "Configured the synthetic payment limit",
            },
          });
        expect((await setCap(50000)).status()).toBe(200);
        const teamPath = new URL(desktop.url()).pathname;
        await desktop.goto(path);
        await desktop.getByRole("button", { name: "Verify", exact: true }).click();
        await desktop.getByLabel("Your note").fill("Counted both sealed bags on site");
        await desktop.getByLabel("Bag codes").fill("release-a\nrelease-b");
        await desktop.getByRole("button", { name: "It arrived as recorded" }).click();
        await expect(desktop.getByText("Every delivery is checked.")).toBeVisible();
        const initialPayments = await (await owner.request.get(overviewPath)).json();
        const [bill] = initialPayments.payments;
        expect(bill).toMatchObject({ provider: "mock", status: "pending" });
        const decide = () =>
          owner.request.post(`/api/v1/supplier-payments/${bill.id}/decision`, {
            data: { approve: true, note: "Approved the synthetic delivery receipt" },
          });
        expect((await decide()).status()).toBe(409);
        expect((await setCap(100000)).status()).toBe(200);
        expect((await decide()).status()).toBe(200);
        expect((await decide()).status()).toBe(409);
        const finalPayments = await (await owner.request.get(overviewPath)).json();
        expect(finalPayments.payments).toEqual([
          expect.objectContaining({
            id: bill.id,
            provider: "mock",
            status: "paid",
            amountPaise: 90000,
          }),
        ]);
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
