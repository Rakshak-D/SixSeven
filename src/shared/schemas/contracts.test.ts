import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ErrorResponse, InsufficientStockErrorResponse } from "../errors";
import { CreateAdjustmentInput } from "./adjustments";
import { AttendanceResponse, CreateAttendanceInput } from "./attendance";
import {
  AuthErrorResponse,
  DemoAccountEmail,
  SessionResponse,
  SignInInput,
  SignInResponse,
} from "./auth";
import { ChecklistDraftRequest, SaveChecklistInput } from "./checklist";
import { DailyRatePaise, IsoDate, Paise, PositiveQty, Qty, SignedQty } from "./common";
import { CreateDeliveryInput, DeliveryResponse } from "./deliveries";
import { PhotoFile } from "./progress";
import { CreateProjectInput, ProjectsResponse } from "./projects";
import { DecideProposalInput, ProposalResponse } from "./proposals";
import { StockMovementResponse } from "./stock";
import { SummaryResponse } from "./summary";
import { CreateWagePaymentInput, WageSheetQuery, WageSheetResponse } from "./wages";

describe("shared primitives", () => {
  it.each([
    -1,
    0.25,
    Number.MAX_SAFE_INTEGER + 1,
    "123",
    Infinity,
  ])("rejects invalid paise %s", (value) => {
    expect(Paise.safeParse(value).success).toBe(false);
  });

  it("accepts only positive even daily rates", () => {
    expect(DailyRatePaise.safeParse(90_000).success).toBe(true);
    expect(DailyRatePaise.safeParse(90_001).success).toBe(false);
    expect(DailyRatePaise.safeParse(0).success).toBe(false);
  });

  it.each([
    -1,
    1.0001,
    1.0000000001,
    100_000_000_000,
    "1.25",
    NaN,
  ])("rejects invalid quantity %s", (value) => {
    expect(Qty.safeParse(value).success).toBe(false);
  });

  it("handles numeric(14,3) boundaries and signed movements", () => {
    expect(Qty.parse(99_999_999_999.999)).toBe(99_999_999_999.999);
    expect(Qty.parse(0.001)).toBe(0.001);
    expect(SignedQty.parse(-99_999_999_999.999)).toBe(-99_999_999_999.999);
    expect(PositiveQty.safeParse(0).success).toBe(false);
  });

  it("validates calendar dates", () => {
    expect(IsoDate.safeParse("2028-02-29").success).toBe(true);
    expect(IsoDate.safeParse("2026-02-29").success).toBe(false);
    expect(IsoDate.safeParse("2026-01-01T00:00:00Z").success).toBe(false);
  });
});

describe("core operations", () => {
  const valid = { workDate: "2026-11-25", entries: [{ workerId: "worker-1", halfDays: 1 }] };

  it("rejects bad attendance units, duplicate workers, empty batches and submitted rates", () => {
    expect(CreateAttendanceInput.safeParse(valid).success).toBe(true);
    for (const halfDays of [-1, 3, 0.5, "1"]) {
      expect(
        CreateAttendanceInput.safeParse({ ...valid, entries: [{ workerId: "worker-1", halfDays }] })
          .success,
      ).toBe(false);
    }
    expect(
      CreateAttendanceInput.safeParse({ ...valid, entries: [...valid.entries, ...valid.entries] })
        .success,
    ).toBe(false);
    expect(CreateAttendanceInput.safeParse({ ...valid, entries: [] }).success).toBe(false);
    expect(
      CreateAttendanceInput.safeParse({
        ...valid,
        entries: [{ ...valid.entries[0], ratePaise: 100 }],
      }).success,
    ).toBe(false);
    expect(
      AttendanceResponse.safeParse({
        ...valid,
        entries: [{ ...valid.entries[0], id: "att-1", ratePaise: 90_000 }],
      }).success,
    ).toBe(true);
  });

  it("validates required project fields and scoped roles", () => {
    expect(CreateProjectInput.safeParse({ name: "Greenfield Home" }).success).toBe(false);
    const project = {
      id: "site-1",
      name: "Greenfield Home",
      location: "Chikkamagaluru",
      startDate: "2026-11-25",
      budgetPaise: 100,
      role: "contractor",
    };
    expect(ProjectsResponse.parse([project])).toEqual([project]);
    expect(ProjectsResponse.safeParse([{ ...project, role: "admin" }]).success).toBe(false);
    expectTypeOf<ProjectsResponse[number]["role"]>().toEqualTypeOf<
      "owner" | "contractor" | "engineer"
    >();
  });

  it("rejects an incorrectly signed usage in movement history", () => {
    const movement = {
      id: "m1",
      materialId: "mat-1",
      type: "usage",
      qty: -0.125,
      occurredOn: "2026-11-25",
      createdAt: "2026-11-25T10:00:00.000Z",
      note: null,
    };
    expect(StockMovementResponse.safeParse(movement).success).toBe(true);
    expect(StockMovementResponse.safeParse({ ...movement, qty: 0.125 }).success).toBe(false);
  });
});

describe("auth, reports and corrections", () => {
  it("allows demo addresses and projects native auth payloads without credentials", () => {
    const user = { id: "u1", name: "Demo Contractor", email: DemoAccountEmail.contractor };
    expect(
      SignInInput.safeParse({ email: user.email, password: "local-only-example" }).success,
    ).toBe(true);
    expect(SignInResponse.parse({ redirect: false, token: "example", user })).toEqual({
      redirect: false,
      user,
    });
    const expiresAt = "2026-11-25T10:00:00.000Z";
    expect(
      SessionResponse.parse({
        session: { expiresAt, token: "example", ipAddress: "127.0.0.1" },
        user,
      }),
    ).toEqual({ session: { expiresAt }, user });
    expect(SessionResponse.parse(null)).toBeNull();
    expect(
      AuthErrorResponse.safeParse({
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid credentials",
      }).success,
    ).toBe(true);
    expect(
      ErrorResponse.safeParse({ error: { code: "NOT_A_CODE", message: "invalid" } }).success,
    ).toBe(false);
  });

  it("rejects financial splits in engineer summaries and requires them for owners", () => {
    const base = {
      budgetPaise: 100,
      spendPaise: 40,
      burnRatePaisePerDay: 10,
      materialVariance: [],
      stockAlerts: [],
    };
    const spendSplit = { materialsPaise: 15, labourPaise: 20, otherPaise: 5 };
    expect(SummaryResponse.safeParse({ ...base, role: "engineer", spendSplit }).success).toBe(
      false,
    );
    expect(SummaryResponse.safeParse({ ...base, role: "owner" }).success).toBe(false);
    expect(
      SummaryResponse.safeParse({ ...base, role: "owner", spendSplit, spendByWeek: [] }).success,
    ).toBe(true);
    expectTypeOf<Extract<SummaryResponse, { role: "engineer" }>>().not.toHaveProperty("spendSplit");
  });

  it("validates role-specific weekly expenditure summaries", () => {
    const base = {
      budgetPaise: 100,
      spendPaise: 40,
      burnRatePaisePerDay: 10,
      materialVariance: [],
      stockAlerts: [],
    };
    const week = { weekStart: "2026-11-23", materialsPaise: 15, wagesPaise: 20, otherPaise: 5 };
    const owner = {
      ...base,
      role: "owner",
      spendSplit: { materialsPaise: 15, labourPaise: 20, otherPaise: 5 },
      spendByWeek: [week],
    };
    const engineer = {
      ...base,
      role: "engineer",
      spendByWeek: [{ weekStart: "2026-11-23", spendPaise: 40 }],
    };
    expect(SummaryResponse.safeParse(owner).success).toBe(true);
    expect(SummaryResponse.safeParse(engineer).success).toBe(true);
    expect(SummaryResponse.safeParse({ ...engineer, spendByWeek: [week] }).success).toBe(false);
    expect(
      SummaryResponse.safeParse({ ...owner, spendByWeek: [{ ...week, weekStart: "2026-11-24" }] })
        .success,
    ).toBe(false);
    expectTypeOf<
      Extract<SummaryResponse, { role: "engineer" }>["spendByWeek"][number]
    >().toHaveProperty("spendPaise");
    expectTypeOf<
      Extract<SummaryResponse, { role: "owner" }>["spendByWeek"][number]
    >().toHaveProperty("wagesPaise");
  });

  it("validates wage modes and dates, and permits signed dues", () => {
    const dates = { from: "2026-11-01", to: "2026-11-25" };
    expect(WageSheetQuery.safeParse({ ...dates, format: "csv" }).success).toBe(true);
    expect(WageSheetQuery.safeParse({ from: dates.to, to: dates.from }).success).toBe(false);
    expect(WageSheetQuery.safeParse({ ...dates, format: "xls" }).success).toBe(false);
    const payment = {
      workerId: "w1",
      amountPaise: 10,
      kind: "advance",
      mode: "upi",
      paidOn: dates.to,
      note: "Paid for site work",
    };
    for (const [mode, reference] of [
      ["cash", undefined],
      ["upi", "202611250001"],
      ["bank", "ABCD1234"],
      ["cheque", "000123"],
    ] as const) {
      expect(CreateWagePaymentInput.safeParse({ ...payment, mode, reference }).success).toBe(true);
      if (mode !== "cash") {
        expect(CreateWagePaymentInput.safeParse({ ...payment, mode }).success).toBe(false);
        expect(
          CreateWagePaymentInput.safeParse({ ...payment, mode, reference: "A-B" }).success,
        ).toBe(false);
      }
    }
    expect(
      CreateWagePaymentInput.safeParse({ ...payment, mode: "cash", reference: "OLD123" }).success,
    ).toBe(false);
    expect(CreateWagePaymentInput.safeParse({ ...payment, mode: "cash", note: " " }).success).toBe(
      false,
    );
    expect(
      WageSheetResponse.safeParse({
        ...dates,
        workers: [],
        totals: { accruedPaise: 0, paidWagesPaise: 0, advancesPaise: 10, duePaise: -10 },
      }).success,
    ).toBe(true);
  });

  it("keeps actor attribution outside correction inputs", () => {
    const correction = {
      targetTable: "attendance",
      targetId: "a1",
      newValue: 0,
      reason: "Corrected per site register",
    };
    expect(CreateAdjustmentInput.safeParse(correction).success).toBe(true);
    expect(CreateAdjustmentInput.safeParse({ ...correction, actorId: "u1" }).success).toBe(false);
    expect(CreateAdjustmentInput.safeParse({ ...correction, reason: "short" }).success).toBe(false);
    expect(CreateAdjustmentInput.safeParse({ ...correction, newValue: 0.25 }).success).toBe(false);
  });
});

describe("progress and reviewed decisions", () => {
  it("validates upload type and size", () => {
    expect(
      PhotoFile.safeParse(new File(["image"], "site.png", { type: "image/png" })).success,
    ).toBe(true);
    expect(
      PhotoFile.safeParse(new File(["image"], "site.svg", { type: "image/svg+xml" })).success,
    ).toBe(false);
    expect(
      PhotoFile.safeParse(new File([new Uint8Array(5_000_001)], "site.png", { type: "image/png" }))
        .success,
    ).toBe(false);
  });

  it("validates proposal decisions and their response states", () => {
    expect(DecideProposalInput.safeParse({ decision: "accept" }).success).toBe(false);
    expect(DecideProposalInput.safeParse({ decision: "approve" }).success).toBe(true);
    expect(
      ProposalResponse.safeParse({
        id: "p1",
        title: "Door change",
        description: "Use a wider frame",
        costImpactPaise: -10,
        createdAt: "2026-11-25T10:00:00.000Z",
        status: "approved",
        decidedAt: null,
      }).success,
    ).toBe(false);
  });

  it("requires AI inputs and edited items on separate requests", () => {
    expect(
      ChecklistDraftRequest.safeParse({ query: { source: "template" }, body: {} }).success,
    ).toBe(true);
    expect(ChecklistDraftRequest.safeParse({ query: { source: "ai" }, body: {} }).success).toBe(
      false,
    );
    expect(
      ChecklistDraftRequest.safeParse({
        query: { source: "ai" },
        body: { houseType: "G+1", floors: 2, rooms: 5 },
      }).success,
    ).toBe(true);
    expect(
      SaveChecklistInput.safeParse({ draftId: "d1", title: "Site checks", items: [] }).success,
    ).toBe(false);
  });
});

it("validates every documented JSON example against the exported schema", () => {
  const docs = readFileSync(new URL("../../../docs/API.md", import.meta.url), "utf8");
  const schemas = {
    CreateDeliveryInput,
    DeliveryResponse,
    CreateAttendanceInput,
    InsufficientStockErrorResponse,
    SummaryResponse,
  };
  const examples = [...docs.matchAll(/^(\w+)\r?\n```json\r?\n([\s\S]*?)\r?\n```/gm)];
  expect(examples.map(([, name]) => name).sort()).toEqual(Object.keys(schemas).sort());
  for (const [_, name, json] of examples) {
    expect(schemas[name as keyof typeof schemas].safeParse(JSON.parse(json)).success, name).toBe(
      true,
    );
  }
});
