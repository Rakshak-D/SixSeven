import { describe, expect, it } from "vitest";
import { addDays, todayIst } from "@/lib/dates";
import { demoRoutes } from "./routes";
import { MockError, type MockRoute } from "./types";

function call(method: MockRoute["method"], path: string, body?: unknown) {
  const [pathname, search = ""] = path.split("?");
  const parts = pathname.split("/");
  for (const route of demoRoutes) {
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
