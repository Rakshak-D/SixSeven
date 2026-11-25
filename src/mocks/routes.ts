import { addDays } from "@/lib/dates";
import { ActivityResponse } from "@/shared/schemas/activity";
import { AdjustmentListResponse } from "@/shared/schemas/adjustments";
import { AttendanceListResponse } from "@/shared/schemas/attendance";
import {
  ReviewChecklistItemInput,
  VerifiedChecklistItemResponse,
  VerifiedChecklistsResponse,
} from "@/shared/schemas/checklist";
import type { Role } from "@/shared/schemas/common";
import { MaterialsResponse } from "@/shared/schemas/materials";
import { TimelineResponse } from "@/shared/schemas/progress";
import { ProjectResponse, ProjectsResponse } from "@/shared/schemas/projects";
import {
  DecideProposalInput,
  ProposalResponse,
  ProposalsResponse,
} from "@/shared/schemas/proposals";
import { StockMovementsResponse, StockResponse } from "@/shared/schemas/stock";
import { SummaryResponse } from "@/shared/schemas/summary";
import { WagePaymentListResponse, WageSheetResponse } from "@/shared/schemas/wages";
import { WorkersResponse } from "@/shared/schemas/workers";
import { seedChangeRequests } from "./change-seed";
import { MockError, type MockRoute, parseBody } from "./types";
import {
  accruedOf,
  balanceOf,
  buildWorld,
  type DemoWorld,
  demoPeople,
  elapsedDays,
  spendTotals,
  weekStarts,
} from "./world";

type DemoProjectConfig = {
  id: string;
  name: string;
  location: string;
  role: Role;
  seed: number;
  days: number;
  scale: number;
  /** Share of the budget spent so far; sets the budget. */
  share: number;
};

/**
 * A project started or joined during this session: no history yet. Its dates for sums start no
 * later than today, so a project that starts next month still has a current week.
 */
export function addDemoProject(input: {
  id: string;
  name: string;
  location: string;
  role: Role;
  startDate: string;
  budgetPaise: number;
}) {
  const empty = buildWorld(input.id, 1, 1, 1, 0.5);
  const w: DemoWorld = {
    ...empty,
    start: input.startDate < empty.today ? input.startDate : empty.today,
    budgetPaise: input.budgetPaise,
    workers: [],
    movements: [],
    attendance: [],
    payments: [],
    adjustments: [],
    proposals: [],
    checklists: [],
    progress: [],
    activity: [],
    materials: [],
    effectiveQty: new Map(),
  };
  demoProjectConfigs.push({ ...input, seed: 1, days: 1, scale: 1, share: 0.5 });
  configuredStarts.set(input.id, input.startDate);
  worlds.set(input.id, w);
}
const configuredStarts = new Map<string, string>();

/** One demo project per role, so switching project switches the role. */
const demoProjectConfigs: DemoProjectConfig[] = [
  {
    id: "demo-greenfield",
    name: "Greenfield Home",
    location: "Whitefield, Bengaluru",
    role: "owner",
    seed: 7,
    days: 99,
    scale: 1,
    share: 0.56,
  },
  {
    id: "demo-lakeview",
    name: "Lakeview Duplex",
    location: "Hebbal, Bengaluru",
    role: "contractor",
    seed: 11,
    days: 79,
    scale: 1.4,
    share: 0.41,
  },
  {
    id: "demo-hillside",
    name: "Hillside Villa",
    location: "Mysuru",
    role: "engineer",
    seed: 23,
    days: 147,
    scale: 1.6,
    share: 0.83,
  },
];

const worlds = new Map<string, DemoWorld>();

export function world(projectId: string): DemoWorld {
  const config = demoProjectConfigs.find((c) => c.id === projectId);
  if (!config) throw new MockError(404, "NOT_FOUND", "Project not found");
  let w = worlds.get(projectId);
  if (!w) {
    w = buildWorld(config.id, config.seed, config.days, config.scale, config.share);
    seedChangeRequests(w);
    worlds.set(projectId, w);
  }
  return w;
}

function roleIn(projectId: string): Role {
  const config = demoProjectConfigs.find((c) => c.id === projectId);
  if (!config) throw new MockError(404, "NOT_FOUND", "Project not found");
  return config.role;
}

export function allow<R extends Role>(projectId: string, roles: R[]): R {
  const role = roleIn(projectId);
  if (!(roles as Role[]).includes(role)) {
    throw new MockError(403, "FORBIDDEN", "Your role in this project can't see this");
  }
  return role as R;
}

export function project(projectId: string) {
  const c = demoProjectConfigs.find((p) => p.id === projectId);
  if (!c) throw new MockError(404, "NOT_FOUND", "Project not found");
  const w = world(c.id);
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    startDate: configuredStarts.get(c.id) ?? w.start,
    budgetPaise: w.budgetPaise,
    role: c.role,
  };
}

const newestFirst = <T>(items: T[], key: (item: T) => string) =>
  [...items].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));

function dateRange(query: URLSearchParams) {
  const from = query.get("from") ?? undefined;
  const to = query.get("to") ?? undefined;
  return (date: string) => (!from || date >= from) && (!to || date <= to);
}

/** IST calendar date of a UTC timestamp. */
const istDate = (timestamp: string) =>
  new Date(Date.parse(timestamp) + 5.5 * 3_600_000).toISOString().slice(0, 10);

function summary(projectId: string) {
  const w = world(projectId);
  const role = roleIn(projectId);
  const spent = spendTotals(w);
  const spendPaise = spent.materialsPaise + spent.labourPaise + spent.otherPaise;
  const materialVariance = w.materials.map((m) => {
    const usedQty =
      Math.round(
        -w.movements
          .filter((mv) => mv.materialId === m.id && mv.type === "usage")
          .reduce((s, mv) => s + mv.qty, 0) * 1000,
      ) / 1000;
    return {
      materialId: m.id,
      name: m.name,
      unit: m.unit,
      plannedQty: m.plannedQty,
      usedQty,
      tolerancePct: m.tolerancePct,
      overTolerance: usedQty > m.plannedQty * (1 + m.tolerancePct / 100),
    };
  });
  const stockAlerts = w.materials
    .map((m) => ({
      materialId: m.id,
      name: m.name,
      balance: balanceOf(w, m.id),
      lowStockQty: m.lowStockQty,
    }))
    .filter((a) => a.balance <= a.lowStockQty);
  const weeks = weekStarts(w).map((weekStart) => ({
    weekStart,
    ...spendTotals(w, weekStart, addDays(weekStart, 6)),
  }));
  const base = {
    budgetPaise: w.budgetPaise,
    spendPaise,
    burnRatePaisePerDay: Math.floor(spendPaise / elapsedDays(w)),
    materialVariance,
    stockAlerts,
  };
  if (role === "engineer") {
    return SummaryResponse.parse({
      ...base,
      role,
      spendByWeek: weeks.map((x) => ({
        weekStart: x.weekStart,
        spendPaise: x.materialsPaise + x.labourPaise + x.otherPaise,
      })),
    });
  }
  return SummaryResponse.parse({
    ...base,
    role,
    spendSplit: spent,
    spendByWeek: weeks.map((x) => ({
      weekStart: x.weekStart,
      materialsPaise: x.materialsPaise,
      wagesPaise: x.labourPaise,
      otherPaise: x.otherPaise,
    })),
  });
}

function wageSheet(projectId: string, query: URLSearchParams) {
  const w = world(projectId);
  const from = query.get("from") ?? w.start;
  const to = query.get("to") ?? w.today;
  if (from > to)
    throw new MockError(400, "VALIDATION_ERROR", "End date must be on or after start date");
  const inRange = (d: string) => d >= from && d <= to;
  const rows = w.workers
    .map((worker) => {
      const att = w.attendance.filter((a) => a.workerId === worker.id && inRange(a.workDate));
      const pays = w.payments.filter((p) => p.workerId === worker.id && inRange(p.paidOn));
      const accruedPaise = att.reduce((s, a) => s + accruedOf(a), 0);
      const paidWagesPaise = pays
        .filter((p) => p.kind === "wage")
        .reduce((s, p) => s + p.effectiveAmountPaise, 0);
      const advancesPaise = pays
        .filter((p) => p.kind === "advance")
        .reduce((s, p) => s + p.effectiveAmountPaise, 0);
      return {
        workerId: worker.id,
        name: worker.name,
        halfDays: att.reduce((s, a) => s + a.effectiveHalfDays, 0),
        accruedPaise,
        paidWagesPaise,
        advancesPaise,
        duePaise: accruedPaise - paidWagesPaise - advancesPaise,
      };
    })
    .filter((r) => r.halfDays > 0 || r.paidWagesPaise > 0 || r.advancesPaise > 0);
  const sum = (k: "accruedPaise" | "paidWagesPaise" | "advancesPaise" | "duePaise") =>
    rows.reduce((s, r) => s + r[k], 0);
  return WageSheetResponse.parse({
    from,
    to,
    workers: rows,
    totals: {
      accruedPaise: sum("accruedPaise"),
      paidWagesPaise: sum("paidWagesPaise"),
      advancesPaise: sum("advancesPaise"),
      duePaise: sum("duePaise"),
    },
  });
}

function findProposal(proposalId: string) {
  for (const c of demoProjectConfigs) {
    const w = world(c.id);
    const index = w.proposals.findIndex((p) => p.id === proposalId);
    if (index >= 0) return { w, index, projectId: c.id };
  }
  throw new MockError(404, "NOT_FOUND", "Proposal not found");
}

export function findChecklistItem(itemId: string) {
  for (const c of demoProjectConfigs) {
    const w = world(c.id);
    for (const list of w.checklists) {
      const item = list.items.find((i) => i.id === itemId);
      if (item) return { w, item, projectId: c.id };
    }
  }
  throw new MockError(404, "NOT_FOUND", "Checklist item not found");
}

export const demoRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/projects",
    respond: () => ProjectsResponse.parse(demoProjectConfigs.map((c) => project(c.id))),
  },
  {
    method: "GET",
    path: "/projects/:id",
    respond: ({ params }) => ProjectResponse.parse(project(params.id)),
  },
  {
    method: "GET",
    path: "/projects/:id/materials",
    respond: ({ params }) => MaterialsResponse.parse(world(params.id).materials),
  },
  {
    method: "GET",
    path: "/projects/:id/workers",
    respond: ({ params }) => {
      allow(params.id, ["owner", "contractor"]);
      return WorkersResponse.parse(world(params.id).workers);
    },
  },
  {
    method: "GET",
    path: "/projects/:id/stock",
    respond: ({ params }) => {
      const w = world(params.id);
      return StockResponse.parse(
        w.materials.map((m) => {
          const balance = balanceOf(w, m.id);
          return {
            materialId: m.id,
            name: m.name,
            unit: m.unit,
            balance,
            lowStockQty: m.lowStockQty,
            lowStock: balance <= m.lowStockQty,
          };
        }),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/movements",
    respond: ({ params, query }) => {
      const w = world(params.id);
      const materialId = query.get("materialId");
      if (materialId && !w.materials.some((m) => m.id === materialId))
        throw new MockError(404, "NOT_FOUND", "Material not found");
      const list = w.movements.filter((m) => !materialId || m.materialId === materialId);
      return StockMovementsResponse.parse(
        newestFirst(list, (m) => `${m.occurredOn}${m.createdAt}${m.id.padStart(40)}`),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/attendance",
    respond: ({ params, query }) => {
      allow(params.id, ["owner", "contractor"]);
      const inRange = dateRange(query);
      const workerId = query.get("workerId");
      const list = world(params.id).attendance.filter(
        (a) => inRange(a.workDate) && (!workerId || a.workerId === workerId),
      );
      return AttendanceListResponse.parse(
        newestFirst(list, (a) => `${a.workDate}${a.createdAt}${a.id.padStart(40)}`),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/wage-payments",
    respond: ({ params, query }) => {
      allow(params.id, ["owner", "contractor"]);
      const inRange = dateRange(query);
      const workerId = query.get("workerId");
      const list = world(params.id).payments.filter(
        (p) => inRange(p.paidOn) && (!workerId || p.workerId === workerId),
      );
      return WagePaymentListResponse.parse(
        newestFirst(list, (p) => `${p.paidOn}${p.createdAt}${p.id.padStart(40)}`),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/adjustments",
    respond: ({ params, query }) => {
      allow(params.id, ["owner", "contractor"]);
      const inRange = dateRange(query);
      const table = query.get("targetTable");
      const targetId = query.get("targetId");
      const list = world(params.id).adjustments.filter(
        (a) =>
          inRange(istDate(a.createdAt)) &&
          (!table || a.targetTable === table) &&
          (!targetId || a.targetId === targetId),
      );
      return AdjustmentListResponse.parse(newestFirst(list, (a) => a.createdAt));
    },
  },
  { method: "GET", path: "/projects/:id/summary", respond: ({ params }) => summary(params.id) },
  {
    method: "GET",
    path: "/projects/:id/wage-sheet",
    respond: ({ params, query }) => {
      allow(params.id, ["owner", "contractor"]);
      return wageSheet(params.id, query);
    },
  },
  {
    method: "GET",
    path: "/projects/:id/timeline",
    respond: ({ params }) => {
      const days = new Map<string, DemoWorld["progress"]>();
      for (const p of world(params.id).progress) {
        const day = istDate(p.createdAt);
        days.set(day, [...(days.get(day) ?? []), p]);
      }
      return TimelineResponse.parse(
        newestFirst(
          [...days].map(([date, updates]) => ({ date, updates })),
          (d) => d.date,
        ),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/activity",
    respond: ({ params }) => {
      const w = world(params.id);
      const paymentFixes = new Set(
        w.adjustments.filter((a) => a.targetTable === "wage_payments").map((a) => a.id),
      );
      const list =
        roleIn(params.id) === "engineer"
          ? w.activity.filter((a) => a.entity !== "wagePayment" && !paymentFixes.has(a.entityId))
          : w.activity;
      return ActivityResponse.parse(list.slice(0, 80));
    },
  },
  {
    method: "GET",
    path: "/projects/:id/proposals",
    respond: ({ params }) =>
      ProposalsResponse.parse(newestFirst(world(params.id).proposals, (p) => p.createdAt)),
  },
  {
    method: "POST",
    path: "/proposals/:id/decision",
    respond: ({ params, body }) => {
      const { w, index, projectId } = findProposal(params.id);
      allow(projectId, ["owner"]);
      const { decision } = DecideProposalInput.parse(body);
      const current = w.proposals[index];
      if (current.status !== "pending")
        throw new MockError(409, "CONFLICT", "This proposal was already decided");
      const decidedAt = new Date().toISOString();
      const next = ProposalResponse.parse({
        ...current,
        status: decision === "approve" ? "approved" : "rejected",
        decidedAt,
      });
      w.proposals[index] = next;
      w.activity.unshift({
        id: `${next.id}-d`,
        actor: demoPeople.owner,
        action: next.status === "approved" ? "approved" : "rejected",
        entity: "proposal",
        entityId: next.id,
        createdAt: decidedAt,
      });
      return next;
    },
  },
  {
    method: "GET",
    path: "/projects/:id/checklists",
    respond: ({ params }) => VerifiedChecklistsResponse.parse(world(params.id).checklists),
  },
  {
    method: "POST",
    path: "/checklist-items/:id/review",
    respond: ({ params, body }) => {
      const { w, item, projectId } = findChecklistItem(params.id);
      allow(projectId, ["engineer"]);
      const input = parseBody(ReviewChecklistItemInput, body);
      if (item.verificationStatus !== "waiting") {
        throw new MockError(409, "CONFLICT", "This task is not waiting for review");
      }
      const latest = [...item.history].reverse().find((e) => e.kind === "submitted");
      if (latest?.progressId !== input.progressId) {
        throw new MockError(
          409,
          "CONFLICT",
          "The contractor sent newer proof. Reload and review that",
        );
      }
      const accept = input.decision === "accept";
      item.verificationStatus = accept ? "done" : "sent_back";
      item.status = accept ? "done" : "inProgress";
      const createdAt = new Date().toISOString();
      item.history.push({
        id: `${item.id}-ev${item.history.length + 1}`,
        kind: accept ? "accepted" : "sent_back",
        actorId: demoPeople.engineer.id,
        createdAt,
        note: input.note ?? null,
        previous: null,
        next: null,
        progressId: input.progressId,
      });
      w.activity.unshift({
        id: `${item.id}-r${Date.now()}`,
        actor: demoPeople.engineer,
        action: accept ? "approved" : "rejected",
        entity: "checklistItem",
        entityId: item.id,
        createdAt,
      });
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
];
