import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as authPost } from "@/app/api/auth/[...auth]/route";
import { getDatabase } from "@/db/client";
import { adjustments, attendance, stockMovements, wagePayments, workers } from "@/db/schema";
import { app } from "@/server/app";
import { ErrorResponse } from "@/shared/errors";
import { AdjustmentListResponse, AdjustmentResponse } from "@/shared/schemas/adjustments";
import { AttendanceListResponse, AttendanceResponse } from "@/shared/schemas/attendance";
import { DemoAccountEmail, SignInResponse } from "@/shared/schemas/auth";
import { DeliveryResponse } from "@/shared/schemas/deliveries";
import {
  WagePaymentListResponse,
  WagePaymentResponse,
  WageSheetResponse,
} from "@/shared/schemas/wages";
import { testDatabase } from "./database-fixture";

const projectId = "demo-greenfield";
const isolatedProjectId = "demo-isolated";
const authOrigin = process.env.BETTER_AUTH_URL;

async function signIn(email: string) {
  const password = process.env.SLATE_DEMO_PASSWORD;
  if (!password || !authOrigin)
    throw new Error("Seed the disposable database and set auth configuration");
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

function call(
  project: string,
  path: string,
  actor?: Actor,
  body?: unknown,
  method?: "GET" | "POST",
) {
  const selectedMethod = method ?? (body === undefined ? "GET" : "POST");
  return app.request(`/api/v1/projects/${project}/${path}`, {
    method: selectedMethod,
    headers: {
      ...(actor && { cookie: actor.cookie }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe(code);
}

async function newWorker(actor = contractor, name = "Synthetic Labour", dailyRatePaise = 90_000) {
  const response = await call(projectId, "workers", actor, {
    name,
    category: "mason",
    dailyRatePaise,
  });
  expect(response.status).toBe(201);
  const worker = (await response.json()) as { id: string; dailyRatePaise: number };
  return worker;
}

async function newMaterial(actor = contractor) {
  const response = await call(projectId, "materials", actor, {
    name: "Correction aggregate",
    unit: "bag",
    plannedQty: 500,
    unitCostPaise: 4_150,
    tolerancePct: 5,
    lowStockQty: 10,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

describe("attendance and wage accounting", () => {
  it("requires a session and hides labour records from engineers and nonmembers", async () => {
    const day = "2026-11-20";
    await failure(
      await call(projectId, "attendance", undefined, {
        workDate: day,
        entries: [{ workerId: "w1", halfDays: 2 }],
      }),
      401,
      "UNAUTHENTICATED",
    );
    await failure(
      await call(projectId, "wage-payments", undefined, {
        workerId: "w1",
        amountPaise: 100,
        kind: "wage",
        mode: "cash",
        paidOn: day,
      }),
      401,
      "UNAUTHENTICATED",
    );
    await failure(
      await call(projectId, "adjustments", undefined, {
        targetTable: "attendance",
        targetId: "a1",
        newValue: 1,
        reason: "Correct the signed register",
      }),
      401,
      "UNAUTHENTICATED",
    );
    for (const path of [
      `attendance?from=${day}`,
      `wage-payments?from=${day}`,
      `adjustments?from=${day}`,
      `wage-sheet?from=${day}&to=${day}`,
    ]) {
      await failure(await call(projectId, path), 401, "UNAUTHENTICATED");
    }
    await failure(await call(projectId, `attendance?from=${day}`, engineer), 403, "FORBIDDEN");
    await failure(await call(projectId, `wage-payments?from=${day}`, engineer), 403, "FORBIDDEN");
    await failure(await call(projectId, `adjustments?from=${day}`, engineer), 403, "FORBIDDEN");
    await failure(
      await call(projectId, `wage-sheet?from=${day}&to=${day}`, engineer),
      403,
      "FORBIDDEN",
    );
    await failure(await call(projectId, `attendance?from=${day}`, outsider), 404, "NOT_FOUND");
  });

  it("records full, half and absent days with persisted rate snapshots and an atomic batch", async () => {
    const full = await newWorker(contractor, "Full day fixture", 90_000);
    const half = await newWorker(contractor, "Half day fixture", 72_000);
    const absent = await newWorker(contractor, "Absent fixture", 60_000);
    const day = "2026-11-21";
    const input = {
      workDate: day,
      entries: [
        { workerId: full.id, halfDays: 2 },
        { workerId: half.id, halfDays: 1 },
        { workerId: absent.id, halfDays: 0 },
      ],
    };
    const response = await call(projectId, "attendance", contractor, input);
    expect(response.status).toBe(201);
    const created = AttendanceResponse.parse(await response.json());
    expect(created.entries.map(({ halfDays, ratePaise }) => [halfDays, ratePaise])).toEqual([
      [2, 90_000],
      [1, 72_000],
      [0, 60_000],
    ]);

    await getDatabase()
      .db.update(workers)
      .set({ dailyRatePaise: 120_000 })
      .where(eq(workers.id, full.id));
    const listResponse = await call(projectId, `attendance?from=${day}&to=${day}`, owner);
    expect(listResponse.status).toBe(200);
    const listed = AttendanceListResponse.parse(await listResponse.json());
    const fullRecord = listed.find(({ workerId }) => workerId === full.id);
    expect(fullRecord).toMatchObject({ halfDays: 2, effectiveHalfDays: 2, ratePaise: 90_000 });

    const failedDay = "2026-11-22";
    const countBefore = await getDatabase()
      .db.select()
      .from(attendance)
      .where(eq(attendance.workDate, failedDay));
    await failure(
      await call(projectId, "attendance", contractor, {
        workDate: failedDay,
        entries: [
          { workerId: half.id, halfDays: 2 },
          { workerId: "other-project-worker", halfDays: 1 },
        ],
      }),
      404,
      "NOT_FOUND",
    );
    const countAfter = await getDatabase()
      .db.select()
      .from(attendance)
      .where(eq(attendance.workDate, failedDay));
    expect(countAfter).toHaveLength(countBefore.length);
    await failure(
      await call(projectId, "attendance", engineer, {
        workDate: failedDay,
        entries: [{ workerId: half.id, halfDays: 1 }],
      }),
      403,
      "FORBIDDEN",
    );
    await failure(
      await call(projectId, "attendance", contractor, {
        workDate: failedDay,
        entries: [
          { workerId: full.id, halfDays: 1 },
          { workerId: full.id, halfDays: 2 },
        ],
      }),
      400,
      "VALIDATION_ERROR",
    );
    const inactive = await newWorker();
    await getDatabase()
      .db.update(workers)
      .set({ active: false })
      .where(eq(workers.id, inactive.id));
    await failure(
      await call(projectId, "attendance", contractor, {
        workDate: failedDay,
        entries: [{ workerId: inactive.id, halfDays: 2 }],
      }),
      409,
      "CONFLICT",
    );
  });

  it("serializes concurrent attendance submissions for the same worker and date", async () => {
    const worker = await newWorker();
    const input = { workDate: "2026-11-23", entries: [{ workerId: worker.id, halfDays: 2 }] };
    const results = await Promise.all([
      call(projectId, "attendance", contractor, input),
      call(projectId, "attendance", contractor, input),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const [rows] = await getDatabase().sql`
      select count(*)::int as count from attendance
      where project_id = ${projectId} and worker_id = ${worker.id} and work_date = ${input.workDate}
    `;
    expect(rows.count).toBe(1);
  });

  it("records payments and advances and returns the signed balance in the wage sheet", async () => {
    const worker = await newWorker(contractor, '=Crew, "A"', 90_000);
    const attendanceResponse = await call(projectId, "attendance", contractor, {
      workDate: "2026-11-21",
      entries: [{ workerId: worker.id, halfDays: 2 }],
    });
    expect(attendanceResponse.status).toBe(201);
    const attendanceId = AttendanceResponse.parse(await attendanceResponse.json()).entries[0].id;
    await call(projectId, "attendance", contractor, {
      workDate: "2026-11-22",
      entries: [{ workerId: worker.id, halfDays: 1 }],
    });
    const wage = await call(projectId, "wage-payments", contractor, {
      workerId: worker.id,
      amountPaise: 50_000,
      kind: "wage",
      mode: "upi",
      paidOn: "2026-11-22",
      reference: "UPI-2026-001",
    });
    expect(wage.status).toBe(201);
    const wageRecord = WagePaymentResponse.parse(await wage.json());
    const advance = await call(projectId, "wage-payments", contractor, {
      workerId: worker.id,
      amountPaise: 10_000,
      kind: "advance",
      mode: "cash",
      paidOn: "2026-11-23",
    });
    expect(advance.status).toBe(201);

    const list = await call(
      projectId,
      `wage-payments?workerId=${worker.id}&from=2026-11-22&to=2026-11-23`,
      owner,
    );
    expect(WagePaymentListResponse.parse(await list.json())).toHaveLength(2);
    const sheetResponse = await call(projectId, "wage-sheet?from=2026-11-21&to=2026-11-23", owner);
    expect(sheetResponse.status).toBe(200);
    const sheet = WageSheetResponse.parse(await sheetResponse.json());
    expect(sheet.workers.find(({ workerId }) => workerId === worker.id)).toMatchObject({
      halfDays: 3,
      accruedPaise: 135_000,
      paidWagesPaise: 50_000,
      advancesPaise: 10_000,
      duePaise: 75_000,
    });
    expect(wageRecord.id).not.toBe(attendanceId);
    expect(sheet.totals.duePaise).toBeGreaterThanOrEqual(75_000);
  });

  it("corrects immutable stock, attendance and payment records using the latest value", async () => {
    const worker = await newWorker();
    const day = "2026-11-24";
    const attendanceCreated = await call(projectId, "attendance", contractor, {
      workDate: day,
      entries: [{ workerId: worker.id, halfDays: 1 }],
    });
    const attendanceId = AttendanceResponse.parse(await attendanceCreated.json()).entries[0].id;
    const payResponse = await call(projectId, "wage-payments", contractor, {
      workerId: worker.id,
      amountPaise: 25_000,
      kind: "wage",
      mode: "bank",
      paidOn: day,
    });
    const paymentId = WagePaymentResponse.parse(await payResponse.json()).id;
    const material = await newMaterial();
    const deliveryResponse = await call(projectId, "deliveries", contractor, {
      materialId: material.id,
      qty: 10.123,
      unitCostPaise: 4_150,
      supplier: "Correction yard",
      challanNo: crypto.randomUUID(),
      occurredOn: day,
    });
    const delivery = DeliveryResponse.parse(await deliveryResponse.json());

    const corrections = [
      {
        targetTable: "stock_movements",
        targetId: delivery.id,
        newValue: 9.111,
        reason: "Corrected quantity on challan",
      },
      {
        targetTable: "stock_movements",
        targetId: delivery.id,
        newValue: 9.112,
        reason: "Verified one more small bag",
      },
      {
        targetTable: "attendance",
        targetId: attendanceId,
        newValue: 2,
        reason: "Signed attendance confirms full day",
      },
      {
        targetTable: "attendance",
        targetId: attendanceId,
        newValue: 0,
        reason: "Final site register marks absent",
      },
      {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 30_000,
        reason: "Corrected payment entry amount",
      },
    ] as const;
    const responses = [];
    for (const correction of corrections) {
      const response = await call(projectId, "adjustments", contractor, correction);
      expect(response.status).toBe(201);
      responses.push(AdjustmentResponse.parse(await response.json()));
    }
    expect(responses.slice(0, 2).map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
      [10.123, 9.111],
      [9.111, 9.112],
    ]);
    expect(responses.slice(2, 4).map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
      [1, 2],
      [2, 0],
    ]);
    expect(responses[4]).toMatchObject({ oldValue: 25_000, newValue: 30_000 });

    const listedAttendance = AttendanceListResponse.parse(
      await (await call(projectId, `attendance?workerId=${worker.id}`, owner)).json(),
    );
    const attendanceHistory = AdjustmentListResponse.parse(
      await (
        await call(projectId, `adjustments?targetTable=attendance&targetId=${attendanceId}`, owner)
      ).json(),
    );
    expect(attendanceHistory.map(({ oldValue, newValue }) => [oldValue, newValue])).toEqual([
      [2, 0],
      [1, 2],
    ]);
    expect(listedAttendance[0]).toMatchObject({
      halfDays: 1,
      effectiveHalfDays: 0,
      ratePaise: 90_000,
    });
    const listedPayments = WagePaymentListResponse.parse(
      await (await call(projectId, `wage-payments?workerId=${worker.id}`, owner)).json(),
    );
    expect(listedPayments[0]).toMatchObject({ amountPaise: 25_000, effectiveAmountPaise: 30_000 });
    const history = AdjustmentListResponse.parse(
      await (await call(projectId, `adjustments?targetId=${delivery.id}`, owner)).json(),
    );
    expect(history.map(({ newValue }) => newValue)).toEqual([9.112, 9.111]);
    expect(history.every(({ actorId }) => actorId === contractor.userId)).toBe(true);

    const { sql, db } = getDatabase();
    const [balance] =
      await sql`select stock_qty::text as value from materials where id = ${material.id}`;
    expect(balance.value).toBe("9.112");
    expect(
      (await db.select().from(stockMovements).where(eq(stockMovements.id, delivery.id)))[0].qty,
    ).toBe("10.123");
    expect(
      (await db.select().from(attendance).where(eq(attendance.id, attendanceId)))[0].halfDays,
    ).toBe(1);
    expect(
      (await db.select().from(wagePayments).where(eq(wagePayments.id, paymentId)))[0].amountPaise,
    ).toBe(25_000);
    expect(
      await db.select().from(adjustments).where(eq(adjustments.targetId, delivery.id)),
    ).toHaveLength(2);
  });

  it("rejects no-op, cross-project, unauthorized and concurrent stale corrections", async () => {
    const worker = await newWorker();
    const payment = await call(projectId, "wage-payments", contractor, {
      workerId: worker.id,
      amountPaise: 20_000,
      kind: "wage",
      mode: "cash",
      paidOn: "2026-11-25",
    });
    const paymentId = WagePaymentResponse.parse(await payment.json()).id;
    await failure(
      await call(projectId, "adjustments", contractor, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 20_000,
        reason: "No change should be stored",
      }),
      409,
      "CONFLICT",
    );
    await failure(
      await call(projectId, "adjustments", engineer, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 21_000,
        reason: "Engineer cannot change wages",
      }),
      403,
      "FORBIDDEN",
    );
    await failure(
      await call(projectId, "adjustments", contractor, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 21_000,
        reason: "Client identity is ignored",
        actorId: owner.userId,
      }),
      400,
      "VALIDATION_ERROR",
    );
    await failure(
      await call(isolatedProjectId, "adjustments", outsider, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 21_000,
        reason: "Cross project target must be hidden",
      }),
      404,
      "NOT_FOUND",
    );

    const competing = await Promise.all([
      call(projectId, "adjustments", contractor, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 21_000,
        reason: "Concurrent corrected amount A",
      }),
      call(projectId, "adjustments", contractor, {
        targetTable: "wage_payments",
        targetId: paymentId,
        newValue: 22_000,
        reason: "Concurrent corrected amount B",
      }),
    ]);
    expect(competing.map(({ status }) => status)).toEqual([201, 201]);
    const rows = AdjustmentListResponse.parse(
      await (
        await call(projectId, `adjustments?targetTable=wage_payments&targetId=${paymentId}`, owner)
      ).json(),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].oldValue).toBe(rows[1].newValue);
    expect([21_000, 22_000]).toContain(rows[0].newValue);
  });

  it("reverses zero-quantity stock records only when the guarded balance allows it", async () => {
    const material = await newMaterial();
    const delivery = DeliveryResponse.parse(
      await (
        await call(projectId, "deliveries", contractor, {
          materialId: material.id,
          qty: 5.125,
          unitCostPaise: 4_150,
          supplier: "Zero reversal yard",
          challanNo: crypto.randomUUID(),
          occurredOn: "2026-11-25",
        })
      ).json(),
    );
    const usage = await call(projectId, "usages", contractor, {
      materialId: material.id,
      qty: 2.125,
      occurredOn: "2026-11-25",
    });
    expect(usage.status).toBe(201);
    const usageId = (await usage.json()).id as string;

    await failure(
      await call(projectId, "adjustments", contractor, {
        targetTable: "stock_movements",
        targetId: delivery.id,
        newValue: 0,
        reason: "Reverse delivery after missing stock",
      }),
      409,
      "INSUFFICIENT_STOCK",
    );
    const reverseUsage = await call(projectId, "adjustments", contractor, {
      targetTable: "stock_movements",
      targetId: usageId,
      newValue: 0,
      reason: "Reverse the original consumption entry",
    });
    expect(reverseUsage.status).toBe(201);
    const reverseDelivery = await call(projectId, "adjustments", contractor, {
      targetTable: "stock_movements",
      targetId: delivery.id,
      newValue: 0,
      reason: "Reverse delivery after stock return",
    });
    expect(reverseDelivery.status).toBe(201);
    const { sql } = getDatabase();
    const [current] = await sql`select material.stock_qty::text as balance,
      coalesce(sum(movement.qty), 0)::numeric(14, 3)::text as total
      from materials material
      left join stock_movements movement on movement.material_id = material.id
        and movement.project_id = material.project_id
      where material.id = ${material.id}
      group by material.id`;
    expect(current).toEqual({ balance: "0.000", total: "0.000" });
    await failure(
      await call(projectId, "adjustments", contractor, {
        targetTable: "stock_movements",
        targetId: "demo-stock-cement-correction",
        newValue: 0,
        reason: "Compensating movements are not original records",
      }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("exports one authoritative wage calculation as JSON, safe CSV and readable PDF", async () => {
    const worker = await newWorker(contractor, '=Crew, "A"', 90_000);
    await call(projectId, "attendance", contractor, {
      workDate: "2026-11-26",
      entries: [{ workerId: worker.id, halfDays: 1 }],
    });
    await call(projectId, "wage-payments", contractor, {
      workerId: worker.id,
      amountPaise: 100_000,
      kind: "wage",
      mode: "bank",
      paidOn: "2026-11-26",
    });
    const range = "from=2026-11-26&to=2026-11-26";
    const jsonResponse = await call(projectId, `wage-sheet?${range}&format=json`, owner);
    const jsonSheet = WageSheetResponse.parse(await jsonResponse.json());
    const row = jsonSheet.workers.find(({ workerId }) => workerId === worker.id);
    expect(row).toMatchObject({
      halfDays: 1,
      accruedPaise: 45_000,
      paidWagesPaise: 100_000,
      duePaise: -55_000,
    });

    const csvResponse = await call(projectId, `wage-sheet?${range}&format=csv`, owner);
    expect(csvResponse.headers.get("content-type")).toContain("text/csv");
    expect(csvResponse.headers.get("content-disposition")).toContain("attachment");
    const csv = await csvResponse.text();
    expect(csv).toContain(`"'=Crew, ""A"""`);
    expect(csv).toContain("45000");
    expect(csv).toContain("-55000");

    const pdfResponse = await call(projectId, `wage-sheet?${range}&format=pdf`, owner);
    expect(pdfResponse.headers.get("content-type")).toContain("application/pdf");
    expect(pdfResponse.headers.get("content-disposition")).toContain("attachment");
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const readable = Array.from(pdf.toString("latin1").matchAll(/<([0-9a-f]+)>/g), ([, hex]) =>
      Buffer.from(hex, "hex").toString("latin1"),
    ).join("");
    expect(readable).toContain("Slate Wage Sheet");
    expect(readable).toContain("INR");
  });

  it("rolls back attendance when the audit insert fails", async () => {
    const worker = await newWorker();
    const { sql, db } = getDatabase();
    await sql`create function slate_test_reject_labour_audit() returns trigger language plpgsql as $$
      begin
        if new.entity = 'attendance' then raise exception 'test audit failure'; end if;
        return new;
      end; $$`;
    try {
      await sql`create trigger slate_test_reject_labour_audit before insert on audit_log
        for each row execute function slate_test_reject_labour_audit()`;
      const day = "2026-11-27";
      await failure(
        await call(projectId, "attendance", contractor, {
          workDate: day,
          entries: [{ workerId: worker.id, halfDays: 2 }],
        }),
        500,
        "INTERNAL",
      );
      expect(
        await db
          .select()
          .from(attendance)
          .where(and(eq(attendance.workerId, worker.id), eq(attendance.workDate, day))),
      ).toHaveLength(0);
    } finally {
      await sql`drop trigger if exists slate_test_reject_labour_audit on audit_log`;
      await sql`drop function slate_test_reject_labour_audit()`;
    }
  });

  it("rolls a stock compensation back when its audit insertion fails", async () => {
    const material = await newMaterial();
    const delivery = DeliveryResponse.parse(
      await (
        await call(projectId, "deliveries", contractor, {
          materialId: material.id,
          qty: 20.5,
          unitCostPaise: 4_150,
          supplier: "Audit rollback yard",
          challanNo: crypto.randomUUID(),
          occurredOn: "2026-11-25",
        })
      ).json(),
    );
    const { sql } = getDatabase();
    await sql`create function slate_test_reject_adjustment_audit() returns trigger language plpgsql as $$
      begin
        if new.entity = 'adjustment' and new.payload ? 'targetTable' then
          raise exception 'test adjustment audit failure';
        end if;
        return new;
      end; $$`;
    try {
      await sql`create trigger slate_test_reject_adjustment_audit before insert on audit_log
        for each row execute function slate_test_reject_adjustment_audit()`;
      await failure(
        await call(projectId, "adjustments", contractor, {
          targetTable: "stock_movements",
          targetId: delivery.id,
          newValue: 18.5,
          reason: "Audit failure must roll back stock",
        }),
        500,
        "INTERNAL",
      );
    } finally {
      await sql`drop trigger if exists slate_test_reject_adjustment_audit on audit_log`;
      await sql`drop function slate_test_reject_adjustment_audit()`;
    }
    const [state] = await sql`select m.stock_qty::text as balance,
      count(s.id)::int as movement_count,
      count(c.id)::int as correction_count
      from materials m
      left join stock_movements s on s.material_id = m.id and s.project_id = m.project_id
      left join adjustments c on c.target_id = ${delivery.id} and c.project_id = m.project_id
      where m.id = ${material.id}
      group by m.id`;
    expect(state).toEqual({ balance: "20.500", movement_count: 1, correction_count: 0 });
  });

  it("rejects a report whose exact aggregate exceeds the JSON integer contract", async () => {
    const worker = await newWorker(contractor, "Aggregate overflow fixture", 90_000);
    const maxPaise = Number.MAX_SAFE_INTEGER;
    const date = "2026-11-28";
    for (const [index, kind] of ["wage", "advance"].entries()) {
      const payment = await call(projectId, "wage-payments", contractor, {
        workerId: worker.id,
        amountPaise: maxPaise,
        kind,
        mode: "bank",
        paidOn: date,
        reference: `overflow-${index}`,
      });
      expect(payment.status).toBe(201);
    }
    await failure(
      await call(projectId, `wage-sheet?from=${date}&to=${date}`, owner),
      409,
      "CONFLICT",
    );
  });
});
