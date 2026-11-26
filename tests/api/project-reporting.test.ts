import { readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as authPost } from "@/app/api/auth/[...auth]/route";
import { getDatabase } from "@/db/client";
import {
  auditLog,
  checklistEvents,
  expenses,
  progressPhotos,
  progressUpdates,
  projectMembers,
} from "@/db/schema";
import { app } from "@/server/app";
import { createAuth } from "@/server/auth";
import {
  ensurePhotoStorage,
  persistValidatedPhotos,
  readStoredPhoto,
  validateImageUpload,
} from "@/server/services/photo-storage";
import { loadEffectiveAttendance } from "@/server/services/wage-calculations";
import { ErrorResponse } from "@/shared/errors";
import { ActivityResponse } from "@/shared/schemas/activity";
import { AttendanceListResponse, AttendanceResponse } from "@/shared/schemas/attendance";
import { DemoAccountEmail, SignInResponse } from "@/shared/schemas/auth";
import { ChangeRequest, ChangeRequestsResponse } from "@/shared/schemas/change-requests";
import {
  ChecklistDraftResponse,
  VerifiedChecklistItemResponse,
  VerifiedChecklistResponse,
} from "@/shared/schemas/checklist";
import { DeliveryResponse } from "@/shared/schemas/deliveries";
import { ProgressResponse, TimelineResponse } from "@/shared/schemas/progress";
import {
  ProjectInvitationResponse,
  ProjectMemberResponse,
  ProjectResponse,
} from "@/shared/schemas/projects";
import { ProposalResponse } from "@/shared/schemas/proposals";
import { SummaryResponse } from "@/shared/schemas/summary";
import { UsageResponse } from "@/shared/schemas/usages";
import { WagePaymentResponse } from "@/shared/schemas/wages";
import { WorkerResponse } from "@/shared/schemas/workers";
import { testDatabase } from "./database-fixture";

const authOrigin = process.env.BETTER_AUTH_URL;
const IST_OFFSET_MS = 330 * 60 * 1000;

async function signIn(email: string) {
  const password = process.env.SLATE_DEMO_PASSWORD;
  if (!password || !authOrigin) throw new Error("Seed the disposable database before API tests");
  const response = await authPost(
    new Request(new URL("/api/auth/sign-in/email", authOrigin), {
      method: "POST",
      headers: { "content-type": "application/json", origin: authOrigin },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(response.status).toBe(200);
  const data = SignInResponse.parse(await response.json());
  return {
    userId: data.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  };
}

type Actor = Awaited<ReturnType<typeof signIn>>;
let contractor: Actor;
let owner: Actor;
let engineer: Actor;
let outsider: Actor;

beforeAll(async () => {
  testDatabase();
  [contractor, owner, engineer, outsider] = await Promise.all([
    signIn(DemoAccountEmail.contractor),
    signIn(DemoAccountEmail.owner),
    signIn(DemoAccountEmail.engineer),
    signIn("isolated@demo.invalid"),
  ]);
});

function api(path: string, actor?: Actor, body?: unknown, method?: string) {
  const headers = new Headers();
  if (actor) headers.set("cookie", actor.cookie);
  if (body instanceof FormData)
    return app.request(`/api/v1${path}`, { method: method ?? "POST", headers, body });
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.request(`/api/v1${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe(code);
}

function dateString(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monday(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function newProject(startDate: string, budgetPaise = 25_000_000) {
  const response = await api("/projects", engineer, {
    name: "Synthetic M5 reporting project",
    location: "Demo site",
    startDate,
    budgetPaise,
  });
  expect(response.status).toBe(201);
  const project = ProjectResponse.parse(await response.json());
  for (const [email, role, recipient] of [
    [DemoAccountEmail.owner, "owner", owner],
    [DemoAccountEmail.contractor, "contractor", contractor],
  ] as const) {
    const invite = await api(`/projects/${project.id}/invitations`, engineer, { email, role });
    expect(invite.status).toBe(201);
    const { id } = ProjectInvitationResponse.parse(await invite.json());
    const member = await api(`/invitations/${id}/accept`, recipient, {}, "POST");
    expect(member.status).toBe(200);
    expect(ProjectMemberResponse.parse(await member.json()).role).toBe(role);
  }
  return project.id;
}

async function imageFile(type: "png" | "jpeg" | "webp" = "png") {
  const source = sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 111, g: 149, b: 173 } },
  });
  const bytes = await (type === "png"
    ? source.png().toBuffer()
    : type === "jpeg"
      ? source.jpeg().toBuffer()
      : source.webp().toBuffer());
  const mime = type === "jpeg" ? "image/jpeg" : `image/${type}`;
  return {
    bytes,
    file: new File([new Uint8Array(bytes)], `fixture.${type}`, { type: mime }),
  };
}

describe("medical reimbursements", () => {
  it("keeps bills private and reconciles one partial mock reimbursement", async () => {
    const today = dateString(new Date());
    const id = await newProject(today);
    const worker = await api(`/projects/${id}/workers`, contractor, {
      name: "Synthetic bill worker",
      category: "mason",
      dailyRatePaise: 80_000,
    });
    expect(worker.status).toBe(201);
    const { id: workerId } = await worker.json();
    const image = await imageFile();
    const form = (capturedAt: string) => {
      const data = new FormData();
      data.set("workerId", workerId);
      data.set("billPaise", "24000");
      data.set("incidentOn", today);
      data.set("note", "Synthetic medical evidence");
      data.append("billPhotos", image.file);
      data.append("capturedAt", capturedAt);
      return data;
    };
    const path = `/projects/${id}/medical-expenses`;
    await expectError(
      await api(path, contractor, form(new Date(Date.now() - 601_000).toISOString())),
      400,
      "VALIDATION_ERROR",
    );
    const capture = new Date().toISOString();
    await expectError(await api(path, outsider, form(capture)), 404, "NOT_FOUND");
    const submitted = await api(path, contractor, form(capture));
    expect(submitted.status).toBe(201);
    const claim = await submitted.json();
    expect(claim).toMatchObject({
      kind: "medical_expense",
      status: "pending_owner",
      reimbursementProvider: "mock",
      payPaise: null,
    });
    const [photo] = claim.payload.billPhotos;
    expect(photo).toMatchObject({ capturedAt: capture, receivedAt: expect.any(String) });
    const imagePath = photo.url.slice("/api/v1".length);
    await expectError(await api(imagePath, engineer), 404, "NOT_FOUND");
    const fromOwner = await api(imagePath, owner);
    expect(fromOwner.status).toBe(200);
    expect(fromOwner.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await fromOwner.arrayBuffer())).toEqual(image.bytes);
    const decision = `/change-requests/${claim.id}/decision`;
    await expectError(
      await api(decision, owner, { accept: true, payPaise: 24_001, note: "Above the bill" }),
      400,
      "VALIDATION_ERROR",
    );
    const approve = () =>
      api(decision, owner, { accept: true, payPaise: 12_345, note: "Partial reimbursement" });
    const outcomes = await Promise.all([approve(), approve()]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 409]);
    const accepted = outcomes.find((response) => response.ok);
    expect(await accepted?.json()).toMatchObject({ status: "accepted", payPaise: 12_345 });
    const rejection = await api(path, contractor, form(new Date().toISOString()));
    const rejectedClaim = await rejection.json();
    expect(
      (
        await api(`/change-requests/${rejectedClaim.id}/decision`, owner, {
          accept: false,
          note: "Invalid duplicate claim",
        })
      ).status,
    ).toBe(200);
    const summary = SummaryResponse.parse(
      await (await api(`/projects/${id}/summary`, owner)).json(),
    );
    expect(summary).toMatchObject({
      spendSplit: { otherPaise: 12_345 },
      spendByWeek: [{ weekStart: monday(today), otherPaise: 12_345 }],
    });
  });
});

describe("project financial summary", () => {
  it("uses effective records, exact material cost rounding, IST weeks and role-safe responses", async () => {
    const today = dateString(new Date());
    const currentWeek = monday(today);
    const weekA = addDays(currentWeek, -14);
    const weekBDate = addDays(currentWeek, -5);
    const startDate = weekA;
    const projectId = await newProject(startDate);

    const createMaterial = async (
      name: string,
      plannedQty: number,
      tolerancePct: number,
      lowStockQty: number,
    ) => {
      const response = await api(`/projects/${projectId}/materials`, contractor, {
        name,
        unit: "bag",
        plannedQty,
        unitCostPaise: 1_000,
        tolerancePct,
        lowStockQty,
      });
      expect(response.status).toBe(201);
      return (await response.json()) as { id: string };
    };
    const recordDelivery = async (
      materialId: string,
      qty: number,
      unitCostPaise: number,
      occurredOn: string,
    ) => {
      const response = await api(`/projects/${projectId}/deliveries`, contractor, {
        materialId,
        qty,
        unitCostPaise,
        supplier: `Synthetic ${crypto.randomUUID()}`,
        challanNo: crypto.randomUUID(),
        occurredOn,
      });
      expect(response.status).toBe(201);
      return DeliveryResponse.parse(await response.json());
    };
    const recordUsage = async (materialId: string, qty: number, occurredOn: string) => {
      const response = await api(`/projects/${projectId}/usages`, contractor, {
        materialId,
        qty,
        occurredOn,
      });
      expect(response.status).toBe(201);
      return UsageResponse.parse(await response.json());
    };
    const correctStock = async (targetId: string, newValue: number) => {
      const response = await api(`/projects/${projectId}/adjustments`, contractor, {
        targetTable: "stock_movements",
        targetId,
        newValue,
        reason: "Verified against the synthetic signed source record",
      });
      expect(response.status).toBe(201);
    };

    const cement = await createMaterial("Fractional cement", 1, 0, 0.898);
    const sand = await createMaterial("Tolerance boundary sand", 1, 10, 0.5);
    const exactTolerance = await createMaterial("Exact tolerance boundary", 1, 10, 0);
    const zeroPlan = await createMaterial("Zero plan material", 0, 0, 0);
    const future = await createMaterial("Future delivery material", 1, 0, 0);

    const cementIn = await recordDelivery(cement.id, 1.001, 1_500, weekA);
    await correctStock(cementIn.id, 1);
    await correctStock(cementIn.id, 1.001);
    const cementUse = await recordUsage(cement.id, 0.101, today);
    await correctStock(cementUse.id, 0.102);
    await correctStock(cementUse.id, 0.103);

    await recordDelivery(sand.id, 2, 1_000, weekBDate);
    await recordUsage(sand.id, 1.101, today);
    await recordDelivery(exactTolerance.id, 1.1, 1_000, weekBDate);
    await recordUsage(exactTolerance.id, 1.1, today);
    await recordDelivery(zeroPlan.id, 0.1, 1_000, weekBDate);
    await recordUsage(zeroPlan.id, 0.001, today);
    await recordDelivery(future.id, 1, 90_000, addDays(today, 1));

    const workerResponse = await api(`/projects/${projectId}/workers`, contractor, {
      name: "Synthetic summary worker",
      category: "mason",
      dailyRatePaise: 90_000,
    });
    expect(workerResponse.status).toBe(201);
    const worker = WorkerResponse.parse(await workerResponse.json());
    const attendanceResponse = await api(`/projects/${projectId}/attendance`, contractor, {
      workDate: today,
      entries: [{ workerId: worker.id, halfDays: 1 }],
    });
    expect(attendanceResponse.status).toBe(201);
    const attendanceRecord = AttendanceResponse.parse(await attendanceResponse.json()).entries[0];
    if (!attendanceRecord) throw new Error("Missing created attendance");
    const attendanceCorrection = await api(`/projects/${projectId}/change-requests`, contractor, {
      kind: "attendance_fix",
      targetId: attendanceRecord.id,
      payload: { newValue: 2, reasonKind: "other", payFullDay: false },
      note: "Verified the full-day signed register entry",
    });
    expect(attendanceCorrection.status).toBe(201);
    const attendanceRequest = ChangeRequest.parse(await attendanceCorrection.json());
    expect(
      (
        await api(`/change-requests/${attendanceRequest.id}/decision`, owner, {
          accept: true,
          note: "Approved verified attendance",
        })
      ).status,
    ).toBe(200);
    const attendanceList = await api(
      `/projects/${projectId}/attendance?from=${today}&to=${today}`,
      owner,
    );
    expect(attendanceList.status).toBe(200);
    expect(AttendanceListResponse.parse(await attendanceList.json())).toContainEqual(
      expect.objectContaining({
        id: attendanceRecord.id,
        halfDays: 1,
        effectiveHalfDays: 2,
        ratePaise: 90_000,
      }),
    );
    const { db } = getDatabase();
    const effectiveAttendance = await db.transaction((tx) =>
      loadEffectiveAttendance(tx, projectId, startDate, today),
    );
    expect(effectiveAttendance).toContainEqual(
      expect.objectContaining({
        workerId: worker.id,
        workDate: today,
        halfDays: "2",
        ratePaise: "90000",
      }),
    );

    const wageResponse = await api(`/projects/${projectId}/wage-payments`, contractor, {
      workerId: worker.id,
      amountPaise: 25_000,
      kind: "wage",
      mode: "upi",
      paidOn: today,
    });
    expect(wageResponse.status).toBe(201);
    const wagePayment = WagePaymentResponse.parse(await wageResponse.json());
    const paymentCorrection = await api(`/projects/${projectId}/adjustments`, contractor, {
      targetTable: "wage_payments",
      targetId: wagePayment.id,
      newValue: 27_000,
      reason: "Corrected the recorded bank transfer amount",
    });
    expect(paymentCorrection.status).toBe(201);
    const advance = await api(`/projects/${projectId}/wage-payments`, contractor, {
      workerId: worker.id,
      amountPaise: 10_000,
      kind: "advance",
      mode: "cash",
      paidOn: today,
    });
    expect(advance.status).toBe(201);

    await db.insert(expenses).values({
      id: crypto.randomUUID(),
      projectId,
      amountPaise: 25_000,
      occurredOn: today,
      description: "Synthetic reporting fixture expense",
      createdBy: contractor.userId,
    });

    const ownerResponse = await api(`/projects/${projectId}/summary`, owner);
    expect(ownerResponse.status).toBe(200);
    const ownerSummary = SummaryResponse.parse(await ownerResponse.json());
    if (ownerSummary.role === "engineer") throw new Error("Owner received engineer summary shape");
    expect(ownerSummary).toMatchObject({
      role: "owner",
      budgetPaise: 25_000_000,
      spendPaise: 119_702,
      burnRatePaisePerDay: Math.floor(
        119_702 /
          (Math.floor(
            (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
          ) +
            1),
      ),
      spendSplit: { materialsPaise: 4_702, labourPaise: 90_000, otherPaise: 25_000 },
    });
    expect(
      ownerSummary.materialVariance.find(({ materialId }) => materialId === sand.id),
    ).toMatchObject({
      plannedQty: 1,
      usedQty: 1.101,
      tolerancePct: 10,
      overTolerance: true,
    });
    expect(
      ownerSummary.materialVariance.find(({ materialId }) => materialId === exactTolerance.id),
    ).toMatchObject({ plannedQty: 1, usedQty: 1.1, overTolerance: false });
    expect(
      ownerSummary.materialVariance.find(({ materialId }) => materialId === zeroPlan.id)
        ?.overTolerance,
    ).toBe(true);
    expect(
      ownerSummary.materialVariance.find(({ materialId }) => materialId === cement.id),
    ).toMatchObject({
      plannedQty: 1,
      usedQty: 0.103,
      overTolerance: false,
    });
    expect(ownerSummary.stockAlerts).toContainEqual({
      materialId: cement.id,
      name: "Fractional cement",
      balance: 0.898,
      lowStockQty: 0.898,
    });
    expect(ownerSummary.spendByWeek).toEqual([
      { weekStart: weekA, materialsPaise: 1_502, wagesPaise: 0, otherPaise: 0 },
      { weekStart: monday(weekBDate), materialsPaise: 3_200, wagesPaise: 0, otherPaise: 0 },
      { weekStart: currentWeek, materialsPaise: 0, wagesPaise: 90_000, otherPaise: 25_000 },
    ]);
    const weeklyTotal = ownerSummary.spendByWeek.reduce(
      (sum, week) => sum + week.materialsPaise + week.wagesPaise + week.otherPaise,
      0,
    );
    expect(weeklyTotal).toBe(ownerSummary.spendPaise);

    const contractorSummary = SummaryResponse.parse(
      await (await api(`/projects/${projectId}/summary`, contractor)).json(),
    );
    expect(contractorSummary).toMatchObject({ role: "contractor", spendPaise: 119_702 });
    const engineerResponse = await api(`/projects/${projectId}/summary`, engineer);
    const engineerRaw = await engineerResponse.json();
    const engineerSummary = SummaryResponse.parse(engineerRaw);
    expect(engineerSummary).toMatchObject({ role: "engineer", spendPaise: 119_702 });
    expect(engineerSummary.spendByWeek).toEqual([
      { weekStart: weekA, spendPaise: 1_502 },
      { weekStart: monday(weekBDate), spendPaise: 3_200 },
      { weekStart: currentWeek, spendPaise: 115_000 },
    ]);
    expect(engineerRaw).not.toHaveProperty("spendSplit");
    expect(JSON.stringify(engineerRaw)).not.toMatch(/labourPaise|wagesPaise|workerId|dailyRate/i);

    await expectError(await api(`/projects/${projectId}/summary`), 401, "UNAUTHENTICATED");
    await expectError(await api(`/projects/${projectId}/summary`, outsider), 404, "NOT_FOUND");

    const activity = await api(`/projects/${projectId}/activity`, engineer);
    expect(activity.status).toBe(200);
    const activityRows = (await activity.json()) as Array<{
      entity: string;
      action: string;
      entityId: string;
    }>;
    expect(
      activityRows.some(({ entity }) => entity === "attendance" || entity === "wagePayment"),
    ).toBe(false);
    expect(
      activityRows.some(({ entity, action }) => entity === "adjustment" && action === "created"),
    ).toBe(false);
    expect(
      activityRows.filter(
        ({ entity, action }) => entity === "adjustment" && action === "corrected",
      ),
    ).toHaveLength(4);
    const ownerActivity = (await (
      await api(`/projects/${projectId}/activity`, owner)
    ).json()) as Array<{
      entity: string;
      action: string;
      entityId: string;
    }>;
    expect(ownerActivity.some(({ entity }) => entity === "attendance")).toBe(true);
    expect(ownerActivity.some(({ entity }) => entity === "wagePayment")).toBe(true);
    expect(
      ownerActivity.filter(
        ({ entity, action }) => entity === "adjustment" && action === "corrected",
      ),
    ).toHaveLength(6);
  });

  it("returns a conflict instead of overflowing safe aggregate paise", async () => {
    const today = dateString(new Date());
    const projectId = await newProject(today, Number.MAX_SAFE_INTEGER);
    const maximumBudgetSummary = SummaryResponse.parse(
      await (await api(`/projects/${projectId}/summary`, owner)).json(),
    );
    expect(maximumBudgetSummary.budgetPaise).toBe(Number.MAX_SAFE_INTEGER);
    const { db } = getDatabase();
    await db.insert(expenses).values([
      {
        id: crypto.randomUUID(),
        projectId,
        amountPaise: Number.MAX_SAFE_INTEGER,
        occurredOn: today,
        description: "Synthetic maximum expense",
        createdBy: contractor.userId,
      },
      {
        id: crypto.randomUUID(),
        projectId,
        amountPaise: 1,
        occurredOn: today,
        description: "Synthetic overflow expense",
        createdBy: contractor.userId,
      },
    ]);
    await expectError(await api(`/projects/${projectId}/summary`, owner), 409, "CONFLICT");

    const laborOverflowProjectId = await newProject(today);
    const workers = await Promise.all(
      [
        "Synthetic engineer-visible labor overflow A",
        "Synthetic engineer-visible labor overflow B",
      ].map(async (name) => {
        const response = await api(`/projects/${laborOverflowProjectId}/workers`, contractor, {
          name,
          category: "mason",
          dailyRatePaise: 9_007_199_254_740_990,
        });
        expect(response.status).toBe(201);
        return WorkerResponse.parse(await response.json());
      }),
    );
    for (const worker of workers) {
      const response = await api(`/projects/${laborOverflowProjectId}/attendance`, contractor, {
        workDate: today,
        entries: [{ workerId: worker.id, halfDays: 2 }],
      });
      expect(response.status).toBe(201);
    }
    const engineerOverflowResponse = await api(
      `/projects/${laborOverflowProjectId}/summary`,
      engineer,
    );
    expect(engineerOverflowResponse.status).toBe(409);
    const engineerOverflow = ErrorResponse.parse(await engineerOverflowResponse.json());
    expect(engineerOverflow.error.message).not.toMatch(/labou?r|wages?/i);
  });

  it("publishes summary, progress, timeline, photo and activity paths in OpenAPI", async () => {
    const response = await app.request("/api/v1/doc");
    expect(response.status).toBe(200);
    const { paths } = await response.json();
    expect(paths["/api/v1/projects/{id}/summary"]).toHaveProperty("get");
    expect(paths["/api/v1/projects/{id}/progress"]).toHaveProperty("post");
    expect(paths["/api/v1/projects/{id}/timeline"]).toHaveProperty("get");
    expect(paths["/api/v1/projects/{id}/photos/{photoId}"]).toHaveProperty("get");
    expect(paths["/api/v1/projects/{id}/activity"]).toHaveProperty("get");
  });
});

describe("progress photo storage and project timeline", () => {
  it("validates uploads, serves the original bytes only to project members, and groups timeline by IST date", async () => {
    const today = dateString(new Date());
    const projectId = await newProject(today);
    const [{ bytes: pngBytes, file: firstFile }, { file: secondFile }] = await Promise.all([
      imageFile("png"),
      imageFile("jpeg"),
    ]);
    const form = new FormData();
    form.append("note", "Engineer verified the synthetic foundation evidence.");
    form.append("photos", firstFile);
    form.append("photos", secondFile);
    const createdResponse = await api(`/projects/${projectId}/progress`, engineer, form);
    expect(createdResponse.status).toBe(201);
    const created = ProgressResponse.parse(await createdResponse.json());
    expect(created.photos).toHaveLength(2);
    expect(JSON.stringify(created)).not.toMatch(/storageKey|\.cache|C:\\\\|filePath/i);

    const photoResponse = await api(
      `/projects/${projectId}/photos/${created.photos[0]?.id}`,
      owner,
    );
    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toBe("image/png");
    expect(photoResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(photoResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await photoResponse.arrayBuffer())).toEqual(pngBytes);
    const otherProjectId = await newProject(today);
    await expectError(
      await api(`/projects/${otherProjectId}/photos/${created.photos[0]?.id}`, owner),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await api(`/projects/${projectId}/photos/${created.photos[0]?.id}`, outsider),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await api(`/projects/${projectId}/photos/${crypto.randomUUID()}`, owner),
      404,
      "NOT_FOUND",
    );
    await expectError(await api(`/projects/${projectId}/timeline`), 401, "UNAUTHENTICATED");
    await expectError(await api(`/projects/${projectId}/timeline`, outsider), 404, "NOT_FOUND");

    const mismatch = new FormData();
    mismatch.append("note", "Mismatched declared MIME should fail.");
    mismatch.append(
      "photos",
      new File([new Uint8Array(pngBytes)], "dishonest.jpg", { type: "image/jpeg" }),
    );
    await expectError(
      await api(`/projects/${projectId}/progress`, contractor, mismatch),
      400,
      "VALIDATION_ERROR",
    );

    const malformed = new FormData();
    malformed.append("note", "Invalid image bytes must not be stored.");
    malformed.append("photos", new File(["not an image"], "not-image.png", { type: "image/png" }));
    await expectError(
      await api(`/projects/${projectId}/progress`, contractor, malformed),
      400,
      "VALIDATION_ERROR",
    );

    const oversized = new FormData();
    oversized.append("note", "The attachment exceeds its per-file size limit.");
    oversized.append(
      "photos",
      new File([new Uint8Array(5_000_001)], "large.png", { type: "image/png" }),
    );
    await expectError(
      await api(`/projects/${projectId}/progress`, contractor, oversized),
      400,
      "VALIDATION_ERROR",
    );

    const unavailableChecklist = new FormData();
    unavailableChecklist.append("note", "An unknown checklist item must not be attached.");
    unavailableChecklist.append("checklistItemId", crypto.randomUUID().replaceAll("-", ""));
    unavailableChecklist.append("photos", firstFile);
    await expectError(
      await api(`/projects/${projectId}/progress`, contractor, unavailableChecklist),
      404,
      "NOT_FOUND",
    );
    await expectError(await api(`/projects/${projectId}/progress`, owner, form), 403, "FORBIDDEN");
    await expectError(
      await api(`/projects/${projectId}/progress`, outsider, form),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await api(`/projects/${projectId}/progress`, undefined, form),
      401,
      "UNAUTHENTICATED",
    );

    const { db } = getDatabase();
    const seedPhotoRow = (
      await db
        .select()
        .from(progressPhotos)
        .where(eq(progressPhotos.id, "demo-progress-photo-foundation"))
    )[0];
    expect(seedPhotoRow).toBeDefined();
    const seedBytes = await readStoredPhoto(seedPhotoRow?.storageKey ?? "");
    expect(seedBytes?.byteLength).toBe(seedPhotoRow?.sizeBytes);
    const twoFiles = await Promise.all([imageFile("webp"), imageFile("png")]);
    const staged = await persistValidatedPhotos(
      await Promise.all(twoFiles.map(({ file }) => validateImageUpload(file))),
    );
    try {
      await db.transaction(async (tx) => {
        const values = [
          {
            id: crypto.randomUUID(),
            note: "IST day before midnight boundary",
            createdAt: new Date("2026-11-24T18:29:59.999Z"),
          },
          {
            id: crypto.randomUUID(),
            note: "IST day after midnight boundary",
            createdAt: new Date("2026-11-24T18:30:00.000Z"),
          },
        ];
        for (let index = 0; index < values.length; index++) {
          const value = values[index];
          const storedPhoto = staged.photos[index];
          if (!value || !storedPhoto) throw new Error("Missing timeline fixture");
          await tx.insert(progressUpdates).values({
            id: value.id,
            projectId,
            note: value.note,
            createdBy: engineer.userId,
            createdAt: value.createdAt,
          });
          await tx.insert(progressPhotos).values({
            id: crypto.randomUUID(),
            projectId,
            progressId: value.id,
            mime: storedPhoto.mime,
            sizeBytes: storedPhoto.sizeBytes,
            takenOn: today,
            storageKey: storedPhoto.storageKey,
          });
          await tx.insert(auditLog).values({
            id: crypto.randomUUID(),
            projectId,
            actorId: engineer.userId,
            action: "created",
            entity: "progress",
            entityId: value.id,
          });
        }
      });
    } catch (error) {
      await staged.cleanup();
      throw error;
    }
    const timelineResponse = await api(`/projects/${projectId}/timeline`, owner);
    expect(timelineResponse.status).toBe(200);
    const timeline = TimelineResponse.parse(await timelineResponse.json());
    expect(timeline.map(({ date }) => date)).toEqual(
      [...timeline.map(({ date }) => date)].sort().reverse(),
    );
    const beforeMidnight = timeline.find(({ updates }) =>
      updates.some(({ note }) => note === "IST day before midnight boundary"),
    );
    const afterMidnight = timeline.find(({ updates }) =>
      updates.some(({ note }) => note === "IST day after midnight boundary"),
    );
    expect(beforeMidnight?.date).toBe("2026-11-24");
    expect(afterMidnight?.date).toBe("2026-11-25");
  });

  it("cleans every file and rolls back progress metadata when the audit insert fails", async () => {
    const today = dateString(new Date());
    const projectId = await newProject(today);
    const { db, sql } = getDatabase();
    const { root: rootPath } = await ensurePhotoStorage();
    const filesBefore = await readdir(rootPath);
    const updatesBefore = await db
      .select({ id: progressUpdates.id })
      .from(progressUpdates)
      .where(eq(progressUpdates.projectId, projectId));
    const photosBefore = await db
      .select({ id: progressPhotos.id })
      .from(progressPhotos)
      .where(eq(progressPhotos.projectId, projectId));
    await sql`create function slate_test_reporting_audit_failure() returns trigger language plpgsql as $$
      begin if new.entity = 'progress' then raise exception 'controlled progress audit failure'; end if; return new; end; $$`;
    try {
      await sql`create trigger slate_test_reporting_audit_failure before insert on audit_log
        for each row execute function slate_test_reporting_audit_failure()`;
      const form = new FormData();
      form.append("note", "The two-file transaction will be rolled back.");
      for (const file of [await imageFile("png"), await imageFile("webp")])
        form.append("photos", file.file);
      await expectError(
        await api(`/projects/${projectId}/progress`, contractor, form),
        500,
        "INTERNAL",
      );
      expect(
        await db
          .select({ id: progressUpdates.id })
          .from(progressUpdates)
          .where(eq(progressUpdates.projectId, projectId)),
      ).toHaveLength(updatesBefore.length);
      expect(
        await db
          .select({ id: progressPhotos.id })
          .from(progressPhotos)
          .where(eq(progressPhotos.projectId, projectId)),
      ).toHaveLength(photosBefore.length);
      expect(await readdir(rootPath)).toEqual(filesBefore);
    } finally {
      await sql`drop trigger if exists slate_test_reporting_audit_failure on audit_log`;
      await sql`drop function if exists slate_test_reporting_audit_failure()`;
    }
  });
});

describe("M6 proposals and checklist verification", () => {
  it("lets only an owner decide once and records only the winning decision", async () => {
    const project = await newProject(dateString(new Date()));
    const path = `/projects/${project}/proposals`;
    const created = await api(path, engineer, {
      title: "Extend drain",
      description: "Add a drain before flooring.",
      costImpactPaise: 1234,
    });
    expect(created.status).toBe(201);
    const proposal = ProposalResponse.parse(await created.json());
    const decision = `/proposals/${proposal.id}/decision`;
    await expectError(await api(decision, contractor, { decision: "approve" }), 403, "FORBIDDEN");
    await expectError(await api(decision, outsider, { decision: "approve" }), 404, "NOT_FOUND");
    const results = await Promise.all([
      api(decision, owner, { decision: "approve" }),
      api(decision, owner, { decision: "reject" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const listed = (await (await api(path, contractor)).json()) as unknown[];
    expect(ProposalResponse.parse(listed[0]).status).not.toBe("pending");
    const events = await getDatabase()
      .db.select()
      .from(auditLog)
      .where(eq(auditLog.entityId, proposal.id));
    expect(events).toHaveLength(2);
    expect(events.filter((event) => event.actorId === owner.userId)).toHaveLength(1);
    const projectAfter = ProjectResponse.parse(
      await (await api(`/projects/${project}`, owner)).json(),
    );
    expect(projectAfter.budgetPaise).toBe(25_000_000);
  });

  it("requires private steel-marking evidence for the current flagged submission", async () => {
    const project = await newProject(dateString(new Date()));
    const draftPath = `/projects/${project}/checklists`;
    const draft = ChecklistDraftResponse.parse(
      await (await api(`${draftPath}?source=template`, engineer, {})).json(),
    );
    const saved = await api(`${draftPath}/records`, engineer, {
      draftId: draft.draftId,
      title: "Pre-pour steel inspection",
      items: [{ ...draft.draft.items[0], requiresSteelProof: true }],
    });
    expect(saved.status).toBe(201);
    const [item] = VerifiedChecklistResponse.parse(await saved.json()).items;
    if (!item) throw new Error("Checklist item missing from fixture");
    expect(item.requiresSteelProof).toBe(true);
    const path = `/checklist-items/${item.id}`;
    expect((await api(`${path}/start`, contractor, undefined, "POST")).status).toBe(200);
    const image = await imageFile();
    const completion = new FormData();
    completion.set("note", "Synthetic completion evidence.");
    completion.set("photos", image.file);
    const submitted = VerifiedChecklistItemResponse.parse(
      await (await api(`${path}/completion`, contractor, completion)).json(),
    );
    const progressId = submitted.history.at(-1)?.progressId;
    if (!progressId) throw new Error("Progress link missing from fixture");
    const review = { decision: "accept", progressId, note: "Reviewed the steel markings." };
    await expectError(await api(`${path}/review`, engineer, review), 409, "STEEL_PROOF_REQUIRED");

    const evidence = () => {
      const form = new FormData();
      form.set("progressId", progressId);
      form.set("note", "Synthetic brand, BIS and mill certificate markings.");
      form.set("photos", image.file);
      form.set("capturedAt", new Date().toISOString());
      return form;
    };
    const proofPath = `${path}/steel-proof`;
    await expectError(await api(proofPath, contractor, evidence()), 403, "FORBIDDEN");
    await expectError(await api(proofPath, outsider, evidence()), 404, "NOT_FOUND");
    const recorded = await api(proofPath, engineer, evidence());
    expect(recorded.status).toBe(201);
    const [{ id }] = await recorded.json();
    await expectError(await api(proofPath, engineer, evidence()), 409, "CONFLICT");
    await expectError(await api(`${proofPath}/${id}`, outsider), 404, "NOT_FOUND");
    const downloaded = await api(`${proofPath}/${id}`, owner);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(image.bytes);
    expect((await api(`${path}/review`, engineer, review)).status).toBe(200);
  });

  it("binds drafts, submissions and reviews and preserves modification history", async () => {
    const project = await newProject(dateString(new Date()));
    const draftPath = `/projects/${project}/checklists`;
    const draft = ChecklistDraftResponse.parse(
      await (await api(`${draftPath}?source=template`, engineer, {})).json(),
    );
    expect(draft.draft.items).toHaveLength(9);
    const payload = {
      draftId: draft.draftId,
      title: "Reviewed site checks",
      items: draft.draft.items.slice(0, 2),
    };
    const other = await newProject(dateString(new Date()));
    await expectError(
      await api(`/projects/${other}/checklists/records`, engineer, payload),
      404,
      "NOT_FOUND",
    );
    const plan = new FormData();
    plan.append("plan", (await imageFile()).file);
    const fallback = await api(`${draftPath}?source=ai`, engineer, plan);
    expect(fallback.status).toBe(200);
    expect(ChecklistDraftResponse.parse(await fallback.json())).toMatchObject({
      source: "template",
      fallbackReason: "unavailable",
    });
    const email = `m6-reviewer-${crypto.randomUUID()}@demo.invalid`;
    const password = process.env.SLATE_DEMO_PASSWORD;
    if (!password) throw new Error("Seed the disposable database before API tests");
    await createAuth(getDatabase().db, { provisioning: true }).api.signUpEmail({
      body: { email, password, name: "Second test engineer" },
    });
    const secondEngineer = await signIn(email);
    await getDatabase()
      .db.insert(projectMembers)
      .values({ projectId: project, userId: secondEngineer.userId, role: "engineer" });
    await expectError(await api(`${draftPath}/records`, secondEngineer, payload), 404, "NOT_FOUND");
    const save = await api(`${draftPath}/records`, engineer, payload);
    expect(save.status).toBe(201);
    const record = VerifiedChecklistResponse.parse(await save.json());
    await expectError(await api(`${draftPath}/records`, engineer, payload), 409, "CONFLICT");
    const [first] = record.items;
    if (!first) throw new Error("Checklist fixture missing");
    const path = `/checklist-items/${first.id}`;
    await expectError(await api(`${path}/start`, outsider, undefined, "POST"), 404, "NOT_FOUND");
    await expectError(await api(path, contractor, { status: "done" }, "PATCH"), 404, "NOT_FOUND");
    expect((await api(`${path}/start`, contractor, undefined, "POST")).status).toBe(200);
    await expectError(await api(`${path}/start`, contractor, undefined, "POST"), 409, "CONFLICT");
    const photo = await imageFile();
    const evidence = () => {
      const form = new FormData();
      form.set("note", "Synthetic evidence of the finished work.");
      form.append("photos", photo.file);
      return form;
    };
    const invalid = new FormData();
    invalid.set("note", "Photo proof missing");
    await expectError(
      await api(`${path}/completion`, contractor, invalid),
      400,
      "VALIDATION_ERROR",
    );
    const { sql } = getDatabase();
    const { root } = await ensurePhotoStorage();
    const filesBefore = await readdir(root);
    await sql`create function slate_test_checklist_failure() returns trigger language plpgsql as $$
      begin if new.kind = 'submitted' then raise exception 'controlled checklist event failure'; end if; return new; end; $$`;
    try {
      await sql`create trigger slate_test_checklist_failure before insert on checklist_events
        for each row execute function slate_test_checklist_failure()`;
      await expectError(await api(`${path}/completion`, contractor, evidence()), 500, "INTERNAL");
      expect(await readdir(root)).toEqual(filesBefore);
      expect(
        TimelineResponse.parse(await (await api(`/projects/${project}/timeline`, owner)).json()),
      ).toEqual([]);
    } finally {
      await sql`drop trigger if exists slate_test_checklist_failure on checklist_events`;
      await sql`drop function if exists slate_test_checklist_failure()`;
    }
    const completions = await Promise.all([
      api(`${path}/completion`, contractor, evidence()),
      api(`${path}/completion`, contractor, evidence()),
    ]);
    expect(completions.map((r) => r.status).sort()).toEqual([200, 409]);
    const success = completions.find((r) => r.ok);
    const submitted = VerifiedChecklistItemResponse.parse(await success?.json());
    const progressId = submitted.history.find((event) => event.kind === "submitted")?.progressId;
    expect(submitted.verificationStatus).toBe("waiting");
    await expectError(
      await api(`${path}/review`, contractor, { decision: "accept", progressId }),
      403,
      "FORBIDDEN",
    );
    await expectError(
      await api(`${path}/review`, owner, { decision: "accept", progressId }),
      403,
      "FORBIDDEN",
    );
    const rejected = await api(`${path}/review`, engineer, {
      decision: "send_back",
      note: "Please show the entire footing.",
      progressId,
    });
    expect(VerifiedChecklistItemResponse.parse(await rejected.json()).verificationStatus).toBe(
      "sent_back",
    );
    const resubmitted = VerifiedChecklistItemResponse.parse(
      await (await api(`${path}/completion`, contractor, evidence())).json(),
    );
    const latest = resubmitted.history.at(-1)?.progressId;
    expect(latest).not.toBe(progressId);
    await expectError(
      await api(`${path}/review`, engineer, { decision: "accept", progressId }),
      409,
      "CONFLICT",
    );
    const reviews = await Promise.all([
      api(`${path}/review`, engineer, { decision: "accept", progressId: latest }),
      api(`${path}/review`, engineer, { decision: "accept", progressId: latest }),
    ]);
    expect(reviews.map((r) => r.status).sort()).toEqual([200, 409]);
    const requestPath = `/projects/${project}/change-requests`;
    const submitChange = async (input: unknown) => {
      const result = await api(requestPath, engineer, input);
      expect(result.status).toBe(201);
      return `/change-requests/${ChangeRequest.parse(await result.json()).id}`;
    };
    const vote = (request: string, approve: boolean) =>
      api(`${request}/vote`, contractor, {
        approve,
        note: approve ? "Reviewed by contractor" : "Refine request before approval",
      });
    const decide = (request: string) =>
      api(`${request}/decision`, owner, {
        accept: true,
        note: "Owner approval recorded",
      });
    const readItem = async () => {
      const rows = await (await api(draftPath, owner)).json();
      return VerifiedChecklistItemResponse.parse(VerifiedChecklistResponse.parse(rows[0]).items[0]);
    };
    const rename = {
      kind: "checklist_rename",
      targetId: first.id,
      payload: { task: "Inspect footing layout" },
      note: "Clarify the inspection scope",
    };
    const renameRequest = await submitChange(rename);
    const stale = await submitChange({ ...rename, payload: { task: "Stale proposed name" } });
    await expectError(
      await api(`${renameRequest}/vote`, outsider, { approve: true, note: "Out of project" }),
      404,
      "NOT_FOUND",
    );
    await expectError(await decide(renameRequest), 409, "CONFLICT");
    expect(ChangeRequest.parse(await (await vote(renameRequest, false)).json()).status).toBe(
      "rejected_contractor",
    );
    const ownerQueue = await api(`${requestPath}?status=pending_owner`, owner);
    expect(ChangeRequestsResponse.parse(await ownerQueue.json())).toEqual([]);
    await expectError(
      await api(`${renameRequest}/reopen`, owner, { note: "Try to reopen" }),
      403,
      "FORBIDDEN",
    );
    expect(
      (await api(`${renameRequest}/reopen`, engineer, { note: "Resubmitted by the author" }))
        .status,
    ).toBe(200);
    expect((await vote(renameRequest, true)).status).toBe(200);
    expect((await vote(stale, true)).status).toBe(200);
    const decisions = await Promise.all([decide(renameRequest), decide(renameRequest)]);
    expect(decisions.map(({ status }) => status).sort()).toEqual([200, 409]);
    const approved = ChangeRequest.parse(await decisions.find(({ ok }) => ok)?.json());
    expect(approved.events.map(({ kind }) => kind)).toEqual([
      "created",
      "contractor_rejected",
      "reopened",
      "contractor_approved",
      "owner_accepted",
    ]);
    await expect(
      sql`update change_request_events set note = 'changed' where request_id = ${approved.id}`,
    ).rejects.toMatchObject({ code: "55000" });
    await expectError(await decide(stale), 409, "CONFLICT");
    await expectError(
      await api(path, engineer, { task: "Bypass", reason: "Should not be permitted" }, "PATCH"),
      404,
      "NOT_FOUND",
    );
    const renamed = await readItem();
    expect(renamed.history.at(-1)).toMatchObject({
      kind: "renamed",
      previous: first.task,
      next: "Inspect footing layout",
      actorId: owner.userId,
    });
    const added = await submitChange({
      kind: "checklist_add",
      payload: { checklistId: record.id, phase: "slab", task: "Inspect slab work" },
      note: "Add a second inspection point",
    });
    expect((await vote(added, true)).status).toBe(200);
    expect((await decide(added)).status).toBe(200);
    const removal = await submitChange({
      kind: "checklist_remove",
      targetId: first.id,
      payload: {},
      note: "Retire the completed inspection",
    });
    expect((await vote(removal, true)).status).toBe(200);
    expect((await decide(removal)).status).toBe(200);
    const removed = await readItem();
    expect(removed.removedAt).toBeTruthy();
    expect(removed.verificationStatus).toBe("done");
    const records = (await (await api(draftPath, owner)).json()) as unknown[];
    expect(VerifiedChecklistResponse.parse(records[0]).items[0]?.history).toEqual(removed.history);
    const timeline = TimelineResponse.parse(
      await (await api(`/projects/${project}/timeline`, owner)).json(),
    );
    const updates = timeline.flatMap((day) => day.updates);
    expect(updates.map((update) => update.id).sort()).toEqual([progressId, latest].sort());
    const photoId = updates[0]?.photos[0]?.id;
    const image = await api(`/projects/${project}/photos/${photoId}`, owner);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(photo.bytes);
    await expectError(await api(`/projects/${other}/photos/${photoId}`, owner), 404, "NOT_FOUND");
    const events = await getDatabase()
      .db.select()
      .from(checklistEvents)
      .where(eq(checklistEvents.itemId, first.id));
    expect(events).toHaveLength(7);
    const activity = ActivityResponse.parse(
      await (await api(`/projects/${project}/activity`, owner)).json(),
    );
    expect(activity.filter((row) => row.entityId === first.id)).toHaveLength(7);
    expect(activity.some((row) => row.entityId === first.id && row.action === "approved")).toBe(
      true,
    );
    expect(activity.some((row) => row.entityId === first.id && row.action === "rejected")).toBe(
      true,
    );
  });
});
