import { describe, expect, it } from "vitest";
import { addDays, todayIst } from "@/lib/dates";
import { demoRoutes } from "./routes";
import { MockError, type MockRoute } from "./types";
import { writeRoutes } from "./write-routes";

function call(method: MockRoute["method"], path: string, body?: unknown) {
  const [pathname, search = ""] = path.split("?");
  const parts = pathname.split("/");
  for (const route of [...demoRoutes, ...writeRoutes]) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/");
    if (pattern.length !== parts.length) continue;
    if (!pattern.every((seg, i) => seg.startsWith(":") || seg === parts[i])) continue;
    const params = Object.fromEntries(
      pattern.flatMap((seg, i) => (seg.startsWith(":") ? [[seg.slice(1), parts[i]]] : [])),
    );
    return route.respond({ params, query: new URLSearchParams(search), body });
  }
  throw new Error(`no mock for ${method} ${path}`);
}

const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    if (e instanceof MockError) return e.status;
    throw e;
  }
};

type Project = { id: string; role: string; budgetPaise: number; startDate: string };
const projects = call("GET", "/projects") as Project[];
const reads = [
  "materials",
  "workers",
  "stock",
  "movements",
  "attendance",
  "wage-payments",
  "adjustments",
  "summary",
  "wage-sheet",
  "timeline",
  "activity",
  "proposals",
  "checklists",
];
const ownerOrContractor = new Set([
  "workers",
  "attendance",
  "wage-payments",
  "adjustments",
  "wage-sheet",
]);

describe("demo mocks", () => {
  it("has one project per role, started in the past", () => {
    expect(projects.map((p) => p.role).sort()).toEqual(["contractor", "engineer", "owner"]);
    for (const p of projects) expect(p.startDate < todayIst()).toBe(true);
  });

  it("answers every read route within the contract and the role rules", () => {
    for (const p of projects) {
      for (const route of reads) {
        const expected = p.role === "engineer" && ownerOrContractor.has(route) ? 403 : 200;
        expect(
          status(() => call("GET", `/projects/${p.id}/${route}`)),
          `${p.role} ${route}`,
        ).toBe(expected);
      }
    }
  });

  it("keeps the numbers consistent", () => {
    const owner = projects.find((p) => p.role === "owner") as Project;
    const summary = call("GET", `/projects/${owner.id}/summary`) as {
      spendPaise: number;
      budgetPaise: number;
      spendSplit: { materialsPaise: number; labourPaise: number; otherPaise: number };
      spendByWeek: { materialsPaise: number; wagesPaise: number; otherPaise: number }[];
    };
    const split = summary.spendSplit;
    expect(split.materialsPaise + split.labourPaise + split.otherPaise).toBe(summary.spendPaise);
    const weekly = summary.spendByWeek.reduce(
      (s, w) => s + w.materialsPaise + w.wagesPaise + w.otherPaise,
      0,
    );
    expect(weekly).toBe(summary.spendPaise);
    const share = summary.spendPaise / summary.budgetPaise;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.62);
    const stock = call("GET", `/projects/${owner.id}/stock`) as { balance: number }[];
    for (const s of stock) expect(s.balance).toBeGreaterThanOrEqual(0);
    const sheet = call(
      "GET",
      `/projects/${owner.id}/wage-sheet?from=${addDays(todayIst(), -30)}&to=${todayIst()}`,
    ) as { totals: { accruedPaise: number } };
    expect(sheet.totals.accruedPaise).toBeGreaterThan(0);
  });

  it("lets only the owner decide a proposal, once", () => {
    const owner = projects.find((p) => p.role === "owner") as Project;
    const engineer = projects.find((p) => p.role === "engineer") as Project;
    const pending = (id: string) =>
      (call("GET", `/projects/${id}/proposals`) as { id: string; status: string }[]).find(
        (x) => x.status === "pending",
      ) as { id: string };
    expect(
      status(() =>
        call("POST", `/proposals/${pending(engineer.id).id}/decision`, { decision: "approve" }),
      ),
    ).toBe(403);
    const target = pending(owner.id).id;
    expect(
      (call("POST", `/proposals/${target}/decision`, { decision: "reject" }) as { status: string })
        .status,
    ).toBe("rejected");
    expect(
      status(() => call("POST", `/proposals/${target}/decision`, { decision: "approve" })),
    ).toBe(409);
  });

  it("refuses unknown projects", () => {
    expect(status(() => call("GET", "/projects/nope/stock"))).toBe(404);
  });
});

describe("contractor writes", () => {
  const contractor = projects.find((p) => p.role === "contractor") as Project;
  const owner = projects.find((p) => p.role === "owner") as Project;
  const base = `/projects/${contractor.id}`;
  const materials = () => call("GET", `${base}/materials`) as { id: string }[];
  const stockOf = (materialId: string) =>
    (call("GET", `${base}/stock`) as { materialId: string; balance: number }[]).find(
      (s) => s.materialId === materialId,
    )?.balance ?? -1;
  const today = todayIst();

  it("adds a delivery to stock and refuses the same challan twice", () => {
    const m = materials()[0].id;
    const before = stockOf(m);
    const body = {
      materialId: m,
      qty: 10,
      unitCostPaise: 43_000,
      supplier: "Test Traders",
      challanNo: "T-1",
      occurredOn: today,
    };
    expect((call("POST", `${base}/deliveries`, body) as { balance: number }).balance).toBe(
      before + 10,
    );
    expect(
      status(() => call("POST", `${base}/deliveries`, { ...body, supplier: " test traders " })),
    ).toBe(409);
    expect(status(() => call("POST", `/projects/${owner.id}/deliveries`, body))).toBe(403);
  });

  it("refuses usage over stock and says how much is left", () => {
    const m = materials()[1].id;
    const balance = stockOf(m);
    try {
      call("POST", `${base}/usages`, { materialId: m, qty: balance + 1, occurredOn: today });
      throw new Error("should refuse");
    } catch (e) {
      expect(e).toBeInstanceOf(MockError);
      expect((e as MockError).code).toBe("INSUFFICIENT_STOCK");
      expect((e as MockError).details).toEqual({ materialId: m, balance });
    }
    const used = call("POST", `${base}/usages`, { materialId: m, qty: 0.5, occurredOn: today }) as {
      balance: number;
    };
    expect(used.balance).toBeCloseTo(balance - 0.5, 3);
  });

  it("saves attendance once per worker and day", () => {
    const workers = call("GET", `${base}/workers`) as { id: string; active: boolean }[];
    const day = addDays(today, 1);
    const entries = workers.filter((w) => w.active).map((w) => ({ workerId: w.id, halfDays: 2 }));
    expect(
      (call("POST", `${base}/attendance`, { workDate: day, entries }) as { entries: unknown[] })
        .entries,
    ).toHaveLength(entries.length);
    expect(status(() => call("POST", `${base}/attendance`, { workDate: day, entries }))).toBe(409);
  });

  it("validates input like the contract", () => {
    expect(
      status(() =>
        call("POST", `${base}/usages`, {
          materialId: materials()[0].id,
          qty: -1,
          occurredOn: today,
        }),
      ),
    ).toBe(400);
  });

  it("fixes a delivery quantity, keeps history and refuses a no-op", () => {
    const m = materials()[0].id;
    const movement = (
      call("GET", `${base}/movements?materialId=${m}`) as {
        id: string;
        type: string;
        qty: number;
      }[]
    ).find((x) => x.type === "delivery") as { id: string; qty: number };
    const before = stockOf(m);
    const fix = call("POST", `${base}/adjustments`, {
      targetTable: "stock_movements",
      targetId: movement.id,
      newValue: movement.qty - 1,
      reason: "One bag was counted twice",
    }) as { oldValue: number; newValue: number };
    expect(fix.newValue).toBe(fix.oldValue - 1);
    expect(stockOf(m)).toBeCloseTo(before - 1, 3);
    expect(
      status(() =>
        call("POST", `${base}/adjustments`, {
          targetTable: "stock_movements",
          targetId: movement.id,
          newValue: fix.newValue,
          reason: "Same value again here",
        }),
      ),
    ).toBe(409);
  });
});
