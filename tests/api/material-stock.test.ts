import { readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/[...auth]/route";
import { getDatabase } from "@/db/client";
import { app } from "@/server/app";
import { ensurePhotoStorage } from "@/server/services/photo-storage";
import { appendStockMovement } from "@/server/services/stock-ledger";
import { ErrorResponse, InsufficientStockErrorResponse } from "@/shared/errors";
import { ActivityResponse } from "@/shared/schemas/activity";
import { DemoAccountEmail, SignInResponse } from "@/shared/schemas/auth";
import {
  ChallanPhotoResponse,
  DeliveryResponse,
  ExpectedDeliveriesResponse,
  ExpectedDeliveryResponse,
} from "@/shared/schemas/deliveries";
import {
  type CreateMaterialInput,
  MaterialResponse,
  MaterialsResponse,
} from "@/shared/schemas/materials";
import { StockMovementsResponse, StockResponse } from "@/shared/schemas/stock";
import { SupplierPaymentsOverview } from "@/shared/schemas/supplier-payments";
import { UsageResponse } from "@/shared/schemas/usages";
import { WorkerResponse, WorkersResponse } from "@/shared/schemas/workers";
import { testDatabase } from "./database-fixture";

const greenfield = "demo-greenfield";
const otherSite = "demo-isolated";
const materialInput = {
  name: "Concrete blocks",
  unit: "piece",
  plannedQty: 350,
  unitCostPaise: 6_500,
  tolerancePct: 5,
  lowStockQty: 30,
};
const workerInput = { name: "Synthetic Worker", category: "mason", dailyRatePaise: 90_000 };
const date = "2026-11-25";

async function signIn(email: string) {
  const password = process.env.SLATE_DEMO_PASSWORD;
  const origin = process.env.BETTER_AUTH_URL;
  if (!password || !origin) throw new Error("Seed the disposable database and set the auth origin");
  const response = await POST(
    new Request(new URL("/api/auth/sign-in/email", origin), {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(response.status).toBe(200);
  const { user } = SignInResponse.parse(await response.json());
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  expect(cookie).not.toBe("");
  return { cookie, userId: user.id };
}

let contractor: Awaited<ReturnType<typeof signIn>>;
let owner: Awaited<ReturnType<typeof signIn>>;
let engineer: Awaited<ReturnType<typeof signIn>>;
let outsider: Awaited<ReturnType<typeof signIn>>;
beforeAll(async () => {
  testDatabase();
  [contractor, owner, engineer, outsider] = await Promise.all([
    signIn(DemoAccountEmail.contractor),
    signIn(DemoAccountEmail.owner),
    signIn(DemoAccountEmail.engineer),
    signIn("isolated@demo.invalid"),
  ]);
});

async function call(
  projectId: string,
  resource: string,
  actor?: { cookie: string },
  body?: unknown,
) {
  return app.request(`/api/v1/projects/${projectId}/${resource}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(actor && { cookie: actor.cookie }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function failure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body: unknown = await response.json();
  expect(ErrorResponse.parse(body).error.code).toBe(code);
  return body;
}

async function material(
  projectId = greenfield,
  actor = contractor,
  input: CreateMaterialInput = materialInput,
) {
  const response = await call(projectId, "materials", actor, input);
  expect(response.status).toBe(201);
  return MaterialResponse.parse(await response.json());
}

function delivery(
  materialId: string,
  qty: number,
  supplier = "Synthetic Supplier",
  challanNo = crypto.randomUUID().toString(),
) {
  return { materialId, qty, supplier, challanNo, occurredOn: date, unitCostPaise: 6_500 };
}

function usage(materialId: string, qty: number) {
  return { materialId, qty, occurredOn: date };
}

async function deliver(
  input: ReturnType<typeof delivery>,
  projectId = greenfield,
  actor = contractor,
) {
  const response = await call(projectId, "deliveries", actor, input);
  expect(response.status).toBe(201);
  return DeliveryResponse.parse(await response.json());
}

async function stock(materialId: string, actor = contractor, projectId = greenfield) {
  const response = await call(projectId, "stock", actor);
  expect(response.status).toBe(200);
  const row = StockResponse.parse(await response.json()).find(
    (item) => item.materialId === materialId,
  );
  if (!row) throw new Error("Missing stock entry");
  return row;
}

async function ledger(materialId: string) {
  const { sql } = getDatabase();
  const [current] = await sql`
    select m.stock_qty::text as balance,
      coalesce(sum(s.qty), 0)::numeric(14, 3)::text as total,
      count(s.id)::int as movements,
      count(s.id) filter (where s.type = 'usage')::int as usages,
      count(a.id)::int as audits
    from materials m
    left join stock_movements s on s.material_id = m.id and s.project_id = m.project_id
    left join audit_log a on a.project_id = s.project_id and a.entity_id = s.id and a.entity = s.type::text
    where m.id = ${materialId}
    group by m.id
  `;
  expect(current.balance).toBe(current.total);
  expect(current.audits).toBe(current.movements);
  return current;
}

async function raceWhileStockIsLocked(
  materialId: string,
  requests: [() => Promise<Response>, () => Promise<Response>],
) {
  const { sql } = getDatabase();
  let pending: Promise<Response[]> | undefined;
  try {
    await sql.begin(async (lock) => {
      await lock`select id from materials where id = ${materialId} for no key update`;
      pending = Promise.all(requests.map((request) => request()));
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        const [result] = await sql`select count(*)::int as blocked from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
          and (query like 'update "materials" set "stock_qty"%' or query like 'insert into "stock_movements"%')`;
        if (result.blocked === 2) return;
        await delay(25);
      }
      throw new Error(
        "Expected two independent PostgreSQL connections waiting on stock or challan locks",
      );
    });
  } finally {
    // Release the row lock before waiting for the API promises, including when the assertion fails.
    await pending;
  }
  if (!pending) throw new Error("Concurrent requests did not start");
  return pending;
}

describe("project membership and contracts", () => {
  const operations = [
    ["materials", materialInput],
    ["materials", undefined],
    ["workers", workerInput],
    ["workers", undefined],
    ["deliveries", delivery("demo-cement", 1)],
    ["usages", usage("demo-cement", 1)],
    ["stock", undefined],
    ["movements", undefined],
  ] as const;

  it.each(
    operations,
  )("rejects unauthenticated and out-of-project %s operations", async (resource, body) => {
    await failure(await call(greenfield, resource, undefined, body), 401, "UNAUTHENTICATED");
    await failure(await call(greenfield, resource, outsider, body), 404, "NOT_FOUND");
  });

  it("requires contractors for all four writes and restricts worker wage rates", async () => {
    const [before] = await getDatabase()
      .sql`select count(*)::int as entries from audit_log where project_id = ${greenfield}`;
    for (const actor of [owner, engineer]) {
      for (const [resource, body] of operations.filter(([, body]) => body !== undefined)) {
        await failure(await call(greenfield, resource, actor, body), 403, "FORBIDDEN");
      }
      for (const resource of ["materials", "stock", "movements"]) {
        const response = await call(greenfield, resource, actor);
        expect(response.status).toBe(200);
        expect(JSON.stringify(await response.json())).not.toContain("dailyRatePaise");
      }
    }
    const denied = await failure(await call(greenfield, "workers", engineer), 403, "FORBIDDEN");
    expect(JSON.stringify(denied)).not.toContain("dailyRatePaise");
    expect(
      await getDatabase()
        .sql`select count(*)::int as entries from audit_log where project_id = ${greenfield}`,
    ).toEqual([before]);
    const response = await call(greenfield, "workers", contractor, workerInput);
    expect(response.status).toBe(201);
    const worker = WorkerResponse.parse(await response.json());
    expect(worker).toMatchObject({ ...workerInput, active: true });
    expect(
      WorkersResponse.parse(await (await call(greenfield, "workers", owner)).json()),
    ).toContainEqual(worker);
    const events = await getDatabase()
      .sql`select actor_id from audit_log where entity = 'worker' and entity_id = ${worker.id}`;
    expect(events).toEqual([{ actor_id: contractor.userId }]);
    await failure(
      await call(greenfield, "workers", contractor, { ...workerInput, dailyRatePaise: 901 }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("projects material fields and rejects caller-supplied stock", async () => {
    await failure(
      await call(greenfield, "materials", contractor, { ...materialInput, stockQty: 999 }),
      400,
      "VALIDATION_ERROR",
    );
    const created = await material();
    expect(
      MaterialsResponse.parse(await (await call(greenfield, "materials", engineer)).json()),
    ).toContainEqual(created);
    expect(await stock(created.id, owner)).toMatchObject({ balance: 0, lowStock: true });
    expect(await ledger(created.id)).toMatchObject({ balance: "0.000", movements: 0, audits: 0 });
    const events = await getDatabase()
      .sql`select actor_id from audit_log where entity = 'material' and entity_id = ${created.id}`;
    expect(events).toEqual([{ actor_id: contractor.userId }]);
  });

  it("rejects cross-project material IDs for writes and history filters", async () => {
    const external = await material(otherSite, outsider);
    await failure(
      await call(greenfield, "deliveries", contractor, delivery(external.id, 1)),
      404,
      "NOT_FOUND",
    );
    await failure(
      await call(greenfield, "usages", contractor, usage(external.id, 1)),
      404,
      "NOT_FOUND",
    );
    await failure(
      await call(greenfield, `movements?materialId=${external.id}`, contractor),
      404,
      "NOT_FOUND",
    );
    expect(await ledger(external.id)).toMatchObject({ balance: "0.000", movements: 0, audits: 0 });
  });
});

describe("stock ledger", () => {
  it("only releases verified mock supplier bills within order, mandate and weekly caps", async () => {
    const item = await material();
    const name = `Synthetic supplier ${crypto.randomUUID()}`;
    const gstin = `99${crypto.randomUUID().replaceAll("-", "").slice(0, 13).toUpperCase()}`;
    const path = `/projects/${greenfield}`;
    const read = async (actor = owner) => {
      const result = await apiMock("GET", `${path}/supplier-payments`, actor);
      expect(result.status).toBe(200);
      return SupplierPaymentsOverview.parse(await result.json());
    };
    const apiMock = (method: string, route: string, actor: { cookie: string }, body?: unknown) =>
      app.request(`/api/v1${route}`, {
        method,
        headers: {
          cookie: actor.cookie,
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const configure = {
      name,
      gstin,
      account: "100000000042",
      note: "Synthetic supplier for mock tests",
    };
    await failure(await apiMock("GET", `${path}/supplier-payments`, contractor), 403, "FORBIDDEN");
    await failure(
      await apiMock("POST", `${path}/suppliers`, contractor, configure),
      403,
      "FORBIDDEN",
    );
    expect((await apiMock("POST", `${path}/suppliers`, owner, configure)).status).toBe(201);
    const details = (await read()).suppliers.find((row) => row.name === name);
    expect(details).toMatchObject({ accountLast4: "0042", approved: false });
    expect(details).not.toHaveProperty("account");
    if (!details) throw new Error("Synthetic supplier was not identified");
    const id = details.id;
    expect(
      (
        await apiMock("POST", `/suppliers/${id}/approve`, owner, {
          note: "Approved synthetic supplier",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await apiMock("POST", `${path}/orders`, owner, {
          supplierId: id,
          materialId: item.id,
          qty: 10,
          maxUnitPricePaise: 6_500,
          note: "Approve synthetic order",
        })
      ).status,
    ).toBe(201);
    const mandate = {
      enabled: true,
      paused: false,
      perBillCapPaise: 6_500,
      perWeekCapPaise: 6_500,
      note: "Enable one bill weekly",
    };
    expect((await apiMock("PUT", `/suppliers/${id}/autopay`, owner, mandate)).status).toBe(200);
    const [first, second] = await Promise.all([
      deliver(delivery(item.id, 1, name)),
      deliver(delivery(item.id, 1, name)),
    ]);
    const verify = (id: string) =>
      apiMock("POST", `${path}/deliveries/${id}/verify`, engineer, {
        note: "Checked material on arrival",
      });
    expect(
      await Promise.all([verify(first.id), verify(second.id)]).then((rows) =>
        rows.map(({ status }) => status),
      ),
    ).toEqual([200, 200]);
    const paid = (await read()).payments.filter((row) => row.supplierName === name);
    expect(paid.map((row) => row.status).sort()).toEqual(["paid", "pending"]);
    const pending = paid.find((row) => row.status === "pending");
    expect(pending?.heldBecause).toMatch(/weekly/);
    expect(paid.find((row) => row.status === "paid")).toMatchObject({
      provider: "mock",
      amountPaise: 6_500,
      paidBy: "autopay",
    });
    await failure(
      await apiMock("POST", `/supplier-payments/${pending?.id}/decision`, owner, {
        approve: true,
        note: "Try weekly cap",
      }),
      409,
      "CONFLICT",
    );
    await failure(
      await apiMock("POST", `/supplier-payments/${pending?.id}/decision`, contractor, {
        approve: true,
        note: "Unauthorized payment",
      }),
      403,
      "FORBIDDEN",
    );
    expect(
      (await apiMock("PUT", `/suppliers/${id}/autopay`, owner, { ...mandate, enabled: false }))
        .status,
    ).toBe(200);
    expect(
      (
        await apiMock("POST", `/suppliers/${id}/bank-change`, owner, {
          account: "100000000043",
          note: "Synthetic bank change",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await apiMock("POST", `/suppliers/${id}/bank-change/approve`, owner, {
          note: "Start cooldown",
        })
      ).status,
    ).toBe(200);
    await failure(
      await apiMock("POST", "/payments/approve", owner, {
        ids: [pending?.id],
        note: "Try during cooldown",
      }),
      409,
      "CONFLICT",
    );
    expect((await read()).suppliers.find((row) => row.id === id)?.bankChange).toMatchObject({
      accountLast4: "0043",
      effectiveAt: expect.any(String),
    });
    const { sql } = getDatabase();
    await sql`update suppliers set bank_effective_at = now() - interval '1 second' where id = ${id}`;
    const approve = () =>
      apiMock("POST", "/payments/approve", owner, {
        ids: [pending?.id],
        note: "Manual approval after cooldown",
      });
    expect((await Promise.all([approve(), approve()])).map(({ status }) => status).sort()).toEqual([
      200, 409,
    ]);
    expect((await read()).orders.find((row) => row.supplierId === id)?.remainingQty).toBe(8);
    const activity = ActivityResponse.parse(
      await (await call(greenfield, "activity", contractor)).json(),
    );
    expect(activity.some(({ entity }) => entity.startsWith("supplier"))).toBe(false);
    const ownerSummary = await (await call(greenfield, "summary", owner)).json();
    expect(ownerSummary.fraudFlags).toContainEqual(
      expect.objectContaining({ kind: "new_supplier", refId: id }),
    );
    const contractorSummary = await (await call(greenfield, "summary", contractor)).json();
    expect(contractorSummary).not.toHaveProperty("fraudFlags");
  });
  it("binds verified bag codes to one project and material and consumes them once", async () => {
    const item = await material(greenfield, contractor, {
      ...materialInput,
      unit: "bag",
      tracksBags: true,
    });
    const different = await material(greenfield, contractor, {
      ...materialInput,
      unit: "bag",
      tracksBags: true,
    });
    const deliveryRow = await deliver(delivery(item.id, 2));
    const rejectedQty = await call(greenfield, "deliveries", contractor, delivery(item.id, 0.5));
    await failure(rejectedQty, 400, "VALIDATION_ERROR");
    const verify = (actor: { cookie: string }, id: string, codes: string[]) =>
      app.request(`/api/v1/deliveries/${id}/bag-codes`, {
        method: "POST",
        headers: { cookie: actor.cookie, "content-type": "application/json" },
        body: JSON.stringify({ codes }),
      });
    const codes = [crypto.randomUUID(), crypto.randomUUID()];
    await failure(await verify(outsider, deliveryRow.id, codes), 404, "NOT_FOUND");
    await failure(await verify(contractor, deliveryRow.id, codes), 403, "FORBIDDEN");
    await failure(await verify(engineer, deliveryRow.id, [codes[0]]), 400, "VALIDATION_ERROR");
    expect((await verify(engineer, deliveryRow.id, codes)).status).toBe(200);
    const duplicate = await deliver(delivery(item.id, 1));
    await failure(await verify(engineer, duplicate.id, [codes[0]]), 409, "CONFLICT");
    const use = (id: string, bagCodes: string[]) =>
      call(greenfield, "usages", contractor, {
        ...usage(id, 1),
        bagCodes,
      });
    await failure(await use(item.id, []), 400, "VALIDATION_ERROR");
    await failure(await use(item.id, [crypto.randomUUID()]), 409, "BAG_CODE_UNKNOWN");
    await failure(await use(different.id, [codes[0]]), 409, "BAG_CODE_WRONG_MATERIAL");
    const concurrent = await Promise.all([use(item.id, [codes[0]]), use(item.id, [codes[0]])]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);
    const denied = concurrent.find(({ status }) => status === 409);
    expect(ErrorResponse.parse(await denied?.json()).error.code).toBe("BAG_CODE_USED");
    expect((await stock(item.id)).balance).toBe(2);
    const bulk = await material();
    await deliver(delivery(bulk.id, 1.5));
    expect((await call(greenfield, "usages", contractor, usage(bulk.id, 0.5))).status).toBe(201);
    const queue = await call(greenfield, "deliveries-to-verify", engineer);
    expect(queue.status).toBe(200);
    expect(await queue.json()).toContainEqual(
      expect.objectContaining({ deliveryId: duplicate.id, tracksBags: true }),
    );
  });
  it("records expected delivery acceptance once and keeps rejected arrivals out of stock", async () => {
    const item = await material();
    const schedule = async () => {
      const result = await call(greenfield, "expected-deliveries", engineer, {
        materialId: item.id,
        qty: 10,
        supplier: "Synthetic scheduled supplier",
        expectedOn: date,
      });
      expect(result.status).toBe(201);
      return ExpectedDeliveryResponse.parse(await result.json());
    };
    const first = await schedule();
    const accept = (actor: { cookie: string }, body: unknown) =>
      app.request(`/api/v1/expected-deliveries/${first.id}/accept`, {
        method: "POST",
        headers: { cookie: actor.cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const actual = delivery(item.id, 8.5);
    await failure(await accept(outsider, actual), 404, "NOT_FOUND");
    await failure(await accept(engineer, actual), 403, "FORBIDDEN");
    await failure(
      await accept(contractor, { ...actual, materialId: "demo-cement" }),
      400,
      "VALIDATION_ERROR",
    );
    const attempts = await Promise.all([accept(contractor, actual), accept(contractor, actual)]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    const [accepted] = attempts.filter(({ ok }) => ok);
    const persisted = DeliveryResponse.parse(await accepted.json());
    expect(persisted.balance).toBe(8.5);
    const second = await schedule();
    const reject = await app.request(`/api/v1/expected-deliveries/${second.id}/reject`, {
      method: "POST",
      headers: { cookie: contractor.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Supplier arrived with damaged packages",
        newDate: "2026-11-26",
      }),
    });
    expect(reject.status).toBe(200);
    expect(ExpectedDeliveryResponse.parse(await reject.json())).toMatchObject({
      status: "rejected",
      rejectionReason: "Supplier arrived with damaged packages",
      rescheduledOn: "2026-11-26",
    });
    expect(await ledger(item.id)).toMatchObject({ balance: "8.500", movements: 1 });
    const pending = await call(greenfield, "expected-deliveries", owner);
    const rescheduled = ExpectedDeliveriesResponse.parse(await pending.json()).filter(
      (row) => row.materialId === item.id,
    );
    expect(rescheduled).toMatchObject([{ status: "pending", expectedOn: "2026-11-26" }]);
    const history = await call(greenfield, "expected-deliveries?status=all", owner);
    expect(ExpectedDeliveriesResponse.parse(await history.json())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: "accepted", deliveryId: persisted.id }),
        expect.objectContaining({ id: second.id, status: "rejected" }),
      ]),
    );
    const activity = ActivityResponse.parse(
      await (await call(greenfield, "activity", owner)).json(),
    );
    expect(activity).toContainEqual(
      expect.objectContaining({
        entity: "expectedDelivery",
        action: "rejected",
        entityId: second.id,
      }),
    );
  });

  it("protects challan images and cleans a rejected duplicate upload", async () => {
    const item = await material();
    const stored = await deliver(delivery(item.id, 1));
    const resource = `deliveries/${stored.id}/challan-photo`;
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    const upload = (
      bytes: Uint8Array<ArrayBuffer>,
      actor: { cookie: string },
      projectId = greenfield,
    ) => {
      const form = new FormData();
      form.set("photo", new File([bytes], "challan.png", { type: "image/png" }));
      return app.request(`/api/v1/projects/${projectId}/${resource}`, {
        method: "POST",
        headers: { cookie: actor.cookie },
        body: form,
      });
    };
    await failure(await call(greenfield, resource), 401, "UNAUTHENTICATED");
    await failure(await upload(Uint8Array.from(png), owner), 403, "FORBIDDEN");
    await failure(await upload(Uint8Array.from(png), outsider, otherSite), 404, "NOT_FOUND");
    await failure(await upload(Uint8Array.of(1, 2, 3), contractor), 400, "VALIDATION_ERROR");
    const uploaded = await upload(Uint8Array.from(png), contractor);
    expect(uploaded.status).toBe(201);
    const photo = ChallanPhotoResponse.parse(await uploaded.json());
    expect(photo).toMatchObject({
      deliveryId: stored.id,
      mime: "image/png",
      sizeBytes: png.length,
    });
    const served = await app.request(photo.url, { headers: { cookie: owner.cookie } });
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(png);
    await failure(await call(otherSite, resource, outsider), 404, "NOT_FOUND");
    const { root } = await ensurePhotoStorage();
    const files = (await readdir(root)).sort();
    await failure(await upload(Uint8Array.from(png), contractor), 409, "CONFLICT");
    expect((await readdir(root)).sort()).toEqual(files);
    expect(await ledger(item.id)).toMatchObject({ balance: "1.000", movements: 1 });
  });
  it("uses exact fractional quantities, flags the threshold inclusively and depletes to zero", async () => {
    const created = await material();
    expect((await deliver(delivery(created.id, 30.125))).balance).toBe(30.125);
    expect((await stock(created.id)).lowStock).toBe(false);
    const first = await call(greenfield, "usages", contractor, usage(created.id, 0.125));
    expect(first.status).toBe(201);
    expect(UsageResponse.parse(await first.json())).toMatchObject({ qty: 0.125, balance: 30 });
    expect((await stock(created.id)).lowStock).toBe(true);
    const rejected = await failure(
      await call(greenfield, "usages", contractor, usage(created.id, 30.001)),
      409,
      "INSUFFICIENT_STOCK",
    );
    expect(InsufficientStockErrorResponse.parse(rejected).error.details).toEqual({
      materialId: created.id,
      balance: 30,
    });
    expect(await ledger(created.id)).toMatchObject({ balance: "30.000", movements: 2 });
    const final = await call(greenfield, "usages", contractor, usage(created.id, 30));
    expect(final.status).toBe(201);
    expect(UsageResponse.parse(await final.json())).toMatchObject({ qty: 30, balance: 0 });
    const history = StockMovementsResponse.parse(
      await (await call(greenfield, `movements?materialId=${created.id}`, engineer)).json(),
    );
    expect(history).toHaveLength(3);
    expect(history.filter((row) => row.type === "usage").map((row) => row.qty)).toEqual(
      expect.arrayContaining([-30, -0.125]),
    );
    expect(history.find((row) => row.type === "delivery")).toMatchObject({
      qty: 30.125,
      supplier: "Synthetic Supplier",
      unitCostPaise: 6_500,
    });
    expect(await ledger(created.id)).toMatchObject({
      balance: "0.000",
      movements: 3,
      usages: 2,
      audits: 3,
    });
  });

  it("rejects invalid inputs and explicitly rejects a valid delivery that would overflow", async () => {
    const created = await material();
    for (const qty of [0, -1, 0.0001, 100_000_000_000, "1", null]) {
      await failure(
        await call(greenfield, "deliveries", contractor, { ...delivery(created.id, 1), qty }),
        400,
        "VALIDATION_ERROR",
      );
      await failure(
        await call(greenfield, "usages", contractor, { ...usage(created.id, 1), qty }),
        400,
        "VALIDATION_ERROR",
      );
    }
    await failure(
      await call(greenfield, "deliveries", contractor, {
        ...delivery(created.id, 1),
        unitCostPaise: -1,
      }),
      400,
      "VALIDATION_ERROR",
    );
    await failure(
      await call(greenfield, "deliveries", contractor, {
        ...delivery(created.id, 1),
        occurredOn: "2026-02-30",
      }),
      400,
      "VALIDATION_ERROR",
    );
    expect(await ledger(created.id)).toMatchObject({ balance: "0.000", movements: 0 });
    const maximum = delivery(created.id, 99_999_999_999.999);
    expect((await deliver(maximum)).balance).toBe(maximum.qty);
    await failure(
      await call(greenfield, "deliveries", contractor, delivery(created.id, 0.001)),
      409,
      "CONFLICT",
    );
    await failure(
      await call(greenfield, "deliveries", contractor, maximum),
      409,
      "DUPLICATE_CHALLAN",
    );
    expect(await ledger(created.id)).toMatchObject({
      balance: "99999999999.999",
      movements: 1,
      audits: 1,
    });
  });

  it("serializes concurrent withdrawals on separate PostgreSQL connections", async () => {
    const created = await material();
    await deliver(delivery(created.id, 100));
    const consume = () => call(greenfield, "usages", contractor, usage(created.id, 70));
    const responses = await raceWhileStockIsLocked(created.id, [consume, consume]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    for (const response of responses) {
      if (response.status === 201)
        expect(UsageResponse.parse(await response.json())).toMatchObject({ balance: 30, qty: 70 });
      else
        expect(InsufficientStockErrorResponse.parse(await response.json()).error.details).toEqual({
          materialId: created.id,
          balance: 30,
        });
    }
    expect(await ledger(created.id)).toMatchObject({
      balance: "30.000",
      movements: 2,
      usages: 1,
      audits: 2,
    });
  }, 10_000);

  it("accepts one concurrent normalized challan per project, including across materials", async () => {
    const target = await material();
    const peer = await material();
    const external = await material(otherSite, outsider);
    const challan = crypto.randomUUID();
    const input = delivery(target.id, 10.125, "Synthetic Supply", challan);
    const normalized = delivery(
      target.id,
      10.125,
      " synthetic supply ",
      ` ${challan.toUpperCase()} `,
    );
    const post = (body: typeof input) => () => call(greenfield, "deliveries", contractor, body);
    const responses = await raceWhileStockIsLocked(target.id, [post(input), post(normalized)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    for (const response of responses) {
      if (response.status === 201)
        expect(DeliveryResponse.parse(await response.json()).balance).toBe(10.125);
      else await failure(response, 409, "DUPLICATE_CHALLAN");
    }
    expect(await ledger(target.id)).toMatchObject({ balance: "10.125", movements: 1, audits: 1 });
    await failure(
      await call(greenfield, "deliveries", contractor, { ...input, materialId: peer.id }),
      409,
      "DUPLICATE_CHALLAN",
    );
    expect(await ledger(peer.id)).toMatchObject({ balance: "0.000", movements: 0 });
    expect(
      (await deliver({ ...normalized, materialId: external.id }, otherSite, outsider)).balance,
    ).toBe(10.125);
  }, 10_000);

  it("rolls back on an audit failure and does not mislabel an unrelated uniqueness violation", async () => {
    const created = await material();
    await deliver(delivery(created.id, 12.5));
    const before = await ledger(created.id);
    const { sql } = getDatabase();
    await sql`create function slate_test_stock_audit_failure() returns trigger language plpgsql as $$
      begin raise unique_violation using constraint = 'audit_log_pkey'; end; $$`;
    try {
      await sql`create trigger slate_test_stock_audit_failure before insert on audit_log
        for each row when (new.entity in ('usage','delivery')) execute function slate_test_stock_audit_failure()`;
      await failure(
        await call(greenfield, "usages", contractor, usage(created.id, 2.5)),
        500,
        "INTERNAL",
      );
      const laterDelivery = delivery(created.id, 1);
      await failure(
        await call(greenfield, "deliveries", contractor, laterDelivery),
        500,
        "INTERNAL",
      );
      expect(await ledger(created.id)).toEqual(before);
      await sql`drop trigger slate_test_stock_audit_failure on audit_log`;
      expect((await deliver(laterDelivery)).balance).toBe(13.5);
    } finally {
      await sql`drop trigger if exists slate_test_stock_audit_failure on audit_log`;
      await sql`drop function slate_test_stock_audit_failure()`;
    }
  });

  it("projects adjustment movements and breaks equal timestamps by descending ID", async () => {
    const created = await material();
    const base = crypto.randomUUID();
    await getDatabase().db.transaction(async (tx) => {
      await appendStockMovement(
        tx,
        contractor,
        greenfield,
        { ...usage(created.id, 1.25), type: "adjustment" },
        `${base}-a`,
      );
      await appendStockMovement(
        tx,
        contractor,
        greenfield,
        { ...usage(created.id, -0.25), type: "adjustment" },
        `${base}-b`,
      );
      await appendStockMovement(
        tx,
        contractor,
        greenfield,
        { ...usage(created.id, 1), occurredOn: "2026-11-24", type: "adjustment" },
        `${base}-c`,
      );
    });
    const history = StockMovementsResponse.parse(
      await (await call(greenfield, `movements?materialId=${created.id}`, owner)).json(),
    );
    expect(history.map(({ id, qty, type }) => ({ id, qty, type }))).toEqual([
      { id: `${base}-b`, qty: -0.25, type: "adjustment" },
      { id: `${base}-a`, qty: 1.25, type: "adjustment" },
      { id: `${base}-c`, qty: 1, type: "adjustment" },
    ]);
    expect(await ledger(created.id)).toMatchObject({ balance: "2.000", movements: 3, audits: 3 });
    const { sql } = getDatabase();
    await expect(sql`truncate table stock_movements`).rejects.toMatchObject({ code: "0A000" });
    // Include the foreign key dependents to exercise the append-only trigger itself.
    await expect(
      sql.begin(async (tx) => {
        await tx`truncate table stock_movements, delivery_challan_photos, expected_deliveries, delivery_verifications, material_bag_codes, supplier_payments`;
        throw new Error("Stock movement truncation unexpectedly succeeded");
      }),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      sql.begin(async (tx) => {
        await tx`truncate table audit_log`;
        throw new Error("Audit log truncation unexpectedly succeeded");
      }),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("preserves seeded unit, fractional and low-stock examples", async () => {
    for (const [id, unit, balance, lowStock, movements] of [
      ["demo-cement", "bag", 14, true, 3],
      ["demo-sand", "tonne", 9.25, false, 2],
      ["demo-steel", "kg", 525, false, 2],
    ] as const) {
      expect(await stock(id)).toMatchObject({ unit, balance, lowStock });
      expect(await ledger(id)).toMatchObject({ movements, usages: 1, audits: movements });
    }
  });

  it("publishes all eight operations in OpenAPI", async () => {
    const response = await app.request("/api/v1/doc");
    expect(response.status).toBe(200);
    const { paths } = await response.json();
    for (const [resource, body] of operationsForOpenApi) {
      expect(paths[`/api/v1/projects/{id}/${resource}`]).toHaveProperty(body);
    }
  });
});

const operationsForOpenApi = [
  ["materials", "get"],
  ["materials", "post"],
  ["workers", "get"],
  ["workers", "post"],
  ["deliveries", "post"],
  ["usages", "post"],
  ["stock", "get"],
  ["movements", "get"],
];
