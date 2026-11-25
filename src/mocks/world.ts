/**
 * Development fixtures: a whole demo project simulated day by day, so every mocked route answers
 * from the same records and the numbers agree across screens (stock never goes below zero, wages
 * follow attendance, the summary adds up). Dates are relative to today, so the demo never goes stale.
 * Every route response built from this is parsed with the shared contract in ./routes.ts.
 */
import { addDays, daysBetween, istTimestamp, mondayOf, todayIst, weekday } from "@/lib/dates";
import type { ActivityResponse } from "@/shared/schemas/activity";
import type { AdjustmentResponse } from "@/shared/schemas/adjustments";
import type { AttendanceRecord } from "@/shared/schemas/attendance";
import type { ChecklistResponse } from "@/shared/schemas/checklist";
import type { MaterialResponse } from "@/shared/schemas/materials";
import type { ProgressResponse } from "@/shared/schemas/progress";
import type { ProposalResponse } from "@/shared/schemas/proposals";
import type { StockMovementResponse } from "@/shared/schemas/stock";
import type { WagePaymentRecord } from "@/shared/schemas/wages";
import type { WorkerResponse } from "@/shared/schemas/workers";

type Activity = ActivityResponse[number];
type Movement = StockMovementResponse;

export const demoPeople = {
  owner: { id: "u-ananya", name: "Ananya Rao" },
  contractor: { id: "u-ravi", name: "Ravi Kumar" },
  engineer: { id: "u-vikram", name: "Vikram Shetty" },
} as const;

export type DemoWorld = {
  projectId: string;
  today: string;
  start: string;
  budgetPaise: number;
  materials: MaterialResponse[];
  workers: WorkerResponse[];
  /** Oldest first. */
  movements: Movement[];
  attendance: AttendanceRecord[];
  payments: WagePaymentRecord[];
  adjustments: AdjustmentResponse[];
  proposals: ProposalResponse[];
  checklists: ChecklistResponse[];
  progress: ProgressResponse[];
  /** Newest first. */
  activity: Activity[];
  /** Effective quantity per movement id after corrections. */
  effectiveQty: Map<string, number>;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number, dp: number) => Math.round(value * 10 ** dp) / 10 ** dp;

const materialSpecs = [
  {
    key: "cement",
    name: "Cement OPC 53",
    unit: "bags",
    planned: 900,
    cost: 43_000,
    tol: 5,
    low: 50,
    perDay: 6.5,
    batch: 120,
    dp: 0,
    supplier: "Shree Traders",
    challan: "ST",
    holdLast: 16,
  },
  {
    key: "steel",
    name: "Steel TMT Fe500",
    unit: "t",
    planned: 18,
    cost: 6_200_000,
    tol: 3,
    low: 1,
    perDay: 0.13,
    batch: 2.5,
    dp: 2,
    supplier: "Jindal Steel Dealer",
    challan: "JS",
    holdLast: 0,
  },
  {
    key: "sand",
    name: "M-sand",
    unit: "loads",
    planned: 60,
    cost: 700_000,
    tol: 8,
    low: 3,
    perDay: 0.8,
    batch: 8,
    dp: 1,
    supplier: "Balaji Sand Supplies",
    challan: "BS",
    holdLast: 0,
  },
  {
    key: "bricks",
    name: "Red bricks",
    unit: "pieces",
    planned: 60_000,
    cost: 900,
    tol: 5,
    low: 3_000,
    perDay: 480,
    batch: 6_000,
    dp: 0,
    supplier: "Lakshmi Brick Kiln",
    challan: "LK",
    holdLast: 0,
  },
  {
    key: "aggregate",
    name: "Aggregate 20 mm",
    unit: "m³",
    planned: 120,
    cost: 180_000,
    tol: 5,
    low: 10,
    perDay: 0.9,
    batch: 12,
    dp: 1,
    supplier: "Om Sai Aggregates",
    challan: "OS",
    holdLast: 0,
  },
] as const;

const workerPool = [
  ["Suresh", "Mason", 90_000],
  ["Manjunath", "Mason", 90_000],
  ["Ramesh", "Mason", 88_000],
  ["Lakshmi", "Helper", 60_000],
  ["Geetha", "Helper", 60_000],
  ["Imran", "Bar bender", 80_000],
  ["Venkatesh", "Carpenter", 85_000],
  ["Prakash", "Helper", 62_000],
  ["Anil", "Helper", 60_000],
  ["Kavya", "Helper", 60_000],
  ["Mahesh", "Mason", 90_000],
  ["Raju", "Helper", 58_000],
  ["Shankar", "Bar bender", 80_000],
  ["Devi", "Helper", 60_000],
  ["Naveen", "Carpenter", 85_000],
  ["Sunita", "Helper", 60_000],
  ["Arun", "Mason", 92_000],
  ["Pooja", "Helper", 60_000],
  ["Kiran", "Electrician", 95_000],
  ["Farooq", "Plumber", 95_000],
  ["Mohan", "Helper", 58_000],
  ["Rekha", "Helper", 60_000],
] as const;

const modes = ["upi", "cash", "bank"] as const;

const checklistItems = [
  ["foundation", "Excavation and PCC", ["Cement OPC 53", "Aggregate 20 mm"]],
  ["foundation", "Footings and columns to plinth", ["Steel TMT Fe500", "Cement OPC 53"]],
  ["plinth", "Plinth beam and damp-proof course", ["Cement OPC 53", "M-sand"]],
  ["walls", "Ground floor brickwork", ["Red bricks", "M-sand"]],
  ["slab", "Roof slab L1", ["Steel TMT Fe500", "Cement OPC 53"]],
  ["walls", "First floor brickwork", ["Red bricks", "M-sand"]],
  ["slab", "Roof slab L2", ["Steel TMT Fe500", "Aggregate 20 mm"]],
  ["electrical", "Conduits in slab L2", []],
  ["plumbing", "Concealed plumbing, ground floor", []],
  ["plaster", "Internal plaster, ground floor", ["Cement OPC 53", "M-sand"]],
  ["flooring", "Flooring, ground floor", []],
  ["finishing", "Painting and fixtures", []],
] as const;

const progressNotes = [
  "Shuttering for slab L2 is up on the east side",
  "Column casting at grid C4 finished",
  "First floor brickwork reached lintel level",
  "Steel for slab L2 laid and checked",
  "Conduits placed before the slab pour",
  "Curing slab L1, day 7",
  "Brickwork on the north wall finished",
  "Sump excavation started",
];

/** Build one demo project. `scale` sizes the crew and material use; `spentShare` sets the budget. */
export function buildWorld(
  projectId: string,
  seed: number,
  days: number,
  scale: number,
  spentShare: number,
): DemoWorld {
  const random = rng(seed);
  const today = todayIst();
  const start = addDays(today, -days);
  const isWorkDay = (date: string) => weekday(date) !== 0;
  const createdOn = (date: string, hour: number, minute = 0) => istTimestamp(date, hour, minute);

  const materials: MaterialResponse[] = materialSpecs.map((m, i) => ({
    id: `${projectId}-m${i + 1}`,
    name: m.name,
    unit: m.unit,
    plannedQty: round(m.planned * scale, m.dp),
    unitCostPaise: m.cost,
    tolerancePct: m.tol,
    lowStockQty: round(m.low * scale, m.dp),
  }));

  const crew = Math.min(workerPool.length, Math.round(14 * scale));
  const workers: WorkerResponse[] = workerPool.slice(0, crew).map(([name, category, rate], i) => ({
    id: `${projectId}-w${i + 1}`,
    name,
    category,
    dailyRatePaise: rate,
    active: name !== "Raju",
  }));
  const leftOnDay = Math.floor(days * 0.6);

  const movements: Movement[] = [];
  const activity: Activity[] = [];
  const balance = materialSpecs.map(() => 0);
  let mv = 0;
  let challanNo = 4400;
  const contractor = demoPeople.contractor;

  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    materialSpecs.forEach((spec, i) => {
      const material = materials[i];
      const daily = spec.perDay * scale;
      const holding = spec.holdLast > 0 && d > days - spec.holdLast;
      if (!holding && balance[i] < Math.max(daily * 3, material.lowStockQty * 1.8) && d < days) {
        const qty = round(spec.batch * scale * (0.9 + random() * 0.2), spec.dp);
        balance[i] = round(balance[i] + qty, 3);
        const id = `${projectId}-mv${++mv}`;
        challanNo += 1 + Math.floor(random() * 7);
        movements.push({
          id,
          materialId: material.id,
          occurredOn: date,
          createdAt: createdOn(date, 10, 5 + i * 7),
          note: null,
          type: "delivery",
          qty,
          supplier: spec.supplier,
          challanNo: `${spec.challan}-${challanNo}`,
          unitCostPaise: spec.cost,
        });
        activity.push({
          id: `${id}-a`,
          actor: contractor,
          action: "created",
          entity: "delivery",
          entityId: id,
          createdAt: createdOn(date, 10, 5 + i * 7),
        });
      }
      if (isWorkDay(date) && d > 0) {
        const want = round(daily * (0.6 + random() * 0.8), spec.dp);
        const qty = round(Math.min(want, balance[i]), spec.dp);
        if (qty > 0) {
          balance[i] = round(balance[i] - qty, 3);
          const id = `${projectId}-mv${++mv}`;
          movements.push({
            id,
            materialId: material.id,
            occurredOn: date,
            createdAt: createdOn(date, 13, 10 + i * 5),
            note: null,
            type: "usage",
            qty: -qty,
          });
          activity.push({
            id: `${id}-a`,
            actor: contractor,
            action: "created",
            entity: "usage",
            entityId: id,
            createdAt: createdOn(date, 13, 10 + i * 5),
          });
        }
      }
    });
  }

  // Attendance: every work day, every worker on the crew that day.
  const attendance: AttendanceRecord[] = [];
  let at = 0;
  for (let d = 1; d <= days; d++) {
    const date = addDays(start, d);
    if (!isWorkDay(date)) continue;
    let first: string | null = null;
    workers.forEach((w) => {
      if (!w.active && d >= leftOnDay) return;
      const roll = random();
      const halfDays = roll < 0.85 ? 2 : roll < 0.93 ? 1 : 0;
      const id = `${projectId}-at${++at}`;
      first ??= id;
      attendance.push({
        id,
        workerId: w.id,
        workDate: date,
        halfDays,
        effectiveHalfDays: halfDays,
        ratePaise: w.dailyRatePaise,
        createdAt: createdOn(date, 18, 30),
      });
    });
    if (first)
      activity.push({
        id: `${first}-a`,
        actor: contractor,
        action: "created",
        entity: "attendance",
        entityId: first,
        createdAt: createdOn(date, 18, 30),
      });
  }

  // Wage payments every Saturday for the week's work, plus a few advances.
  const payments: WagePaymentRecord[] = [];
  let pay = 0;
  const lastPaid = new Map<string, string>();
  for (let d = 1; d <= days; d++) {
    const date = addDays(start, d);
    if (weekday(date) === 3 && random() < 0.35) {
      const w = workers[Math.floor(random() * workers.length)];
      const id = `${projectId}-pay${++pay}`;
      const amount = 100_000 + Math.floor(random() * 4) * 50_000;
      payments.push({
        id,
        workerId: w.id,
        amountPaise: amount,
        effectiveAmountPaise: amount,
        kind: "advance",
        mode: "cash",
        paidOn: date,
        reference: null,
        createdAt: createdOn(date, 17, 0),
      });
      activity.push({
        id: `${id}-a`,
        actor: contractor,
        action: "created",
        entity: "wagePayment",
        entityId: id,
        createdAt: createdOn(date, 17, 0),
      });
    }
    if (weekday(date) !== 6) continue;
    workers.forEach((w, i) => {
      const from = lastPaid.get(w.id) ?? start;
      const halfDays = attendance
        .filter((a) => a.workerId === w.id && a.workDate > from && a.workDate <= date)
        .reduce((sum, a) => sum + a.halfDays, 0);
      if (halfDays === 0) return;
      lastPaid.set(w.id, date);
      const mode = modes[i % modes.length];
      const id = `${projectId}-pay${++pay}`;
      const amount = (halfDays * w.dailyRatePaise) / 2;
      const reference =
        mode === "upi"
          ? String(400_000_000_000 + Math.floor(random() * 99_999_999_999))
          : mode === "bank"
            ? `HDFC00${Math.floor(10_000 + random() * 89_999)}`
            : null;
      payments.push({
        id,
        workerId: w.id,
        amountPaise: amount,
        effectiveAmountPaise: amount,
        kind: "wage",
        mode,
        paidOn: date,
        reference,
        createdAt: createdOn(date, 18, 45),
      });
      activity.push({
        id: `${id}-a`,
        actor: contractor,
        action: "created",
        entity: "wagePayment",
        entityId: id,
        createdAt: createdOn(date, 18, 45),
      });
    });
  }

  // Corrections: append-only records; originals stay, effective values change.
  const adjustments: AdjustmentResponse[] = [];
  const effectiveQty = new Map<string, number>();
  const fixDay = addDays(today, -6);
  const halfDay = attendance.find((a) => a.workDate >= fixDay && a.halfDays === 1);
  if (halfDay) {
    halfDay.effectiveHalfDays = 2;
    adjustments.push({
      id: `${projectId}-adj1`,
      targetTable: "attendance",
      targetId: halfDay.id,
      reason: "Worked the full day; marked half by mistake",
      oldValue: 1,
      newValue: 2,
      actorId: contractor.id,
      createdAt: createdOn(addDays(halfDay.workDate, 1), 9, 20),
    });
  }
  const cementDelivery = [...movements]
    .reverse()
    .find((m) => m.type === "delivery" && m.materialId === materials[0].id);
  if (cementDelivery && cementDelivery.type === "delivery") {
    const fixed = cementDelivery.qty - 2;
    effectiveQty.set(cementDelivery.id, fixed);
    const at2 = createdOn(cementDelivery.occurredOn, 16, 40);
    adjustments.push({
      id: `${projectId}-adj2`,
      targetTable: "stock_movements",
      targetId: cementDelivery.id,
      reason: "Two bags torn on arrival, returned to the supplier",
      oldValue: cementDelivery.qty,
      newValue: fixed,
      actorId: contractor.id,
      createdAt: at2,
    });
    movements.push({
      id: `${projectId}-mv${++mv}`,
      materialId: cementDelivery.materialId,
      occurredOn: cementDelivery.occurredOn,
      createdAt: at2,
      note: "Correction of the delivery quantity",
      type: "adjustment",
      qty: -2,
    });
  }
  const wrongPay = payments.filter((p) => p.kind === "wage").at(-8);
  if (wrongPay) {
    const corrected = wrongPay.amountPaise - 30_000;
    adjustments.push({
      id: `${projectId}-adj3`,
      targetTable: "wage_payments",
      targetId: wrongPay.id,
      reason: "Typed the amount wrong; the worker was paid ₹300 less",
      oldValue: wrongPay.amountPaise,
      newValue: corrected,
      actorId: contractor.id,
      createdAt: createdOn(addDays(wrongPay.paidOn, 1), 10, 0),
    });
    wrongPay.effectiveAmountPaise = corrected;
  }
  for (const a of adjustments)
    activity.push({
      id: `${a.id}-a`,
      actor: contractor,
      action: "corrected",
      entity: "adjustment",
      entityId: a.id,
      createdAt: a.createdAt,
    });

  const proposals: ProposalResponse[] = [
    {
      id: `${projectId}-pr1`,
      title: "Add an underground sump",
      description:
        "A 6,000-litre sump near the gate so the tank fills from the municipal line overnight.",
      costImpactPaise: 8_500_000,
      createdAt: createdOn(addDays(today, -3), 11, 0),
      status: "pending",
      decidedAt: null,
    },
    {
      id: `${projectId}-pr2`,
      title: "Switch to AAC blocks on the first floor",
      description: "Lighter walls on L2; fewer bricks and less plaster. Saves money and two weeks.",
      costImpactPaise: -4_000_000,
      createdAt: createdOn(addDays(today, -1), 15, 30),
      status: "pending",
      decidedAt: null,
    },
    {
      id: `${projectId}-pr3`,
      title: "Extra column at grid C4",
      description: "The structural check asked for one more column under the long span.",
      costImpactPaise: 2_200_000,
      createdAt: createdOn(addDays(today, -19), 10, 0),
      status: "approved",
      decidedAt: createdOn(addDays(today, -18), 20, 15),
    },
  ];
  const engineer = demoPeople.engineer;
  for (const p of proposals) {
    activity.push({
      id: `${p.id}-a`,
      actor: engineer,
      action: "created",
      entity: "proposal",
      entityId: p.id,
      createdAt: p.createdAt,
    });
    if (p.status !== "pending")
      activity.push({
        id: `${p.id}-d`,
        actor: demoPeople.owner,
        action: p.status,
        entity: "proposal",
        entityId: p.id,
        createdAt: p.decidedAt,
      });
  }

  const doneShare = Math.min(1, days / 140);
  const items = checklistItems.map(([phase, task, used], i) => {
    const position = i / checklistItems.length;
    const status: "done" | "inProgress" | "pending" =
      position < doneShare * 0.55 ? "done" : position < doneShare * 0.7 ? "inProgress" : "pending";
    const materials: string[] = [...used];
    return { id: `${projectId}-ci${i + 1}`, phase, task, materials, status };
  });
  const checklists: ChecklistResponse[] = [
    {
      id: `${projectId}-cl1`,
      title: "Build plan",
      source: "template",
      createdAt: createdOn(addDays(start, 2), 11, 0),
      items: items.map((it) => ({ ...it })),
    },
  ];
  items
    .filter((it) => it.status !== "pending")
    .forEach((it, i) => {
      activity.push({
        id: `${it.id}-a`,
        actor: engineer,
        action: "updated",
        entity: "checklistItem",
        entityId: it.id,
        createdAt: createdOn(addDays(today, -2 - i * 6), 17, 10),
      });
    });

  const progress: ProgressResponse[] = progressNotes.map((note, i) => {
    const date = addDays(today, -i * 3 - (i > 0 ? 1 : 0));
    const id = `${projectId}-pg${i + 1}`;
    const photos = Array.from({ length: 1 + (i % 2) }, (_, k) => ({
      id: `${id}-ph${k + 1}`,
      mime: "image/jpeg" as const,
      sizeBytes: 840_000 + k * 120_000,
      takenOn: date,
      url: `/api/v1/projects/${projectId}/photos/${id}-ph${k + 1}`,
    }));
    const by = i % 3 === 0 ? contractor : engineer;
    const createdAt = createdOn(date, 16, 10 + i);
    activity.push({
      id: `${id}-a`,
      actor: by,
      action: "created",
      entity: "progress",
      entityId: id,
      createdAt,
    });
    return { id, note, checklistItemId: i === 0 ? items[6].id : null, createdAt, photos };
  });

  activity.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const world: DemoWorld = {
    projectId,
    today,
    start,
    budgetPaise: 0,
    materials,
    workers,
    movements,
    attendance,
    payments,
    adjustments,
    proposals,
    checklists,
    progress,
    activity,
    effectiveQty,
  };
  const spent = spendTotals(world);
  world.budgetPaise =
    Math.round((spent.materialsPaise + spent.labourPaise) / spentShare / 10_000_000) * 10_000_000;
  return world;
}

/** Effective quantity of a movement after corrections. */
export function qtyOf(world: DemoWorld, m: Movement): number {
  return world.effectiveQty.get(m.id) ?? m.qty;
}

export function deliveryCost(world: DemoWorld, m: Movement): number {
  return m.type === "delivery" ? Math.round(qtyOf(world, m) * m.unitCostPaise) : 0;
}

export function accruedOf(a: AttendanceRecord): number {
  return (a.effectiveHalfDays * a.ratePaise) / 2;
}

export function spendTotals(world: DemoWorld, from?: string, to?: string) {
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const materialsPaise = world.movements
    .filter((m) => inRange(m.occurredOn))
    .reduce((sum, m) => sum + deliveryCost(world, m), 0);
  const labourPaise = world.attendance
    .filter((a) => inRange(a.workDate))
    .reduce((sum, a) => sum + accruedOf(a), 0);
  return { materialsPaise, labourPaise, otherPaise: 0 };
}

/** Monday-start IST weeks from the project start to today. */
export function weekStarts(world: DemoWorld): string[] {
  const weeks: string[] = [];
  for (let w = mondayOf(world.start); w <= world.today; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

export function balanceOf(world: DemoWorld, materialId: string): number {
  return round(
    world.movements
      .filter((m) => m.materialId === materialId)
      // Movements are append-only: a fix adds its own signed movement, so the balance is the plain
      // sum. The corrected quantity (qtyOf) is for cost only.
      .reduce((sum, m) => sum + m.qty, 0),
    3,
  );
}

export function elapsedDays(world: DemoWorld): number {
  return Math.max(1, daysBetween(world.start, world.today) + 1);
}
