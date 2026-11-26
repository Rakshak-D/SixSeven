import type { AdjustmentListResponse } from "@/shared/schemas/adjustments";
import type { MaterialsResponse } from "@/shared/schemas/materials";
import type { StockMovementsResponse } from "@/shared/schemas/stock";
import type { WagePaymentListResponse } from "@/shared/schemas/wages";
import type { WorkersResponse } from "@/shared/schemas/workers";
import { addDays } from "./dates";
import { formatQty } from "./format";

export type SpendKind = "materials" | "wages";

export type Spend = {
  id: string;
  kind: SpendKind;
  title: string;
  detail: string;
  date: string;
  amountPaise: number;
  /** The latest fix's reason when a fix changed this record; the original stays in the log. */
  fixReason: string | null;
};

const modeLabel = { cash: "Cash", upi: "UPI", bank: "Bank", cheque: "Cheque" } as const;

/** Money that left the project: material deliveries (quantity × unit cost) and wage payments. */
export function buildSpends(input: {
  movements?: StockMovementsResponse;
  materials?: MaterialsResponse;
  payments?: WagePaymentListResponse;
  workers?: WorkersResponse;
  adjustments?: AdjustmentListResponse;
}): Spend[] {
  const fixedQty = new Map<string, number>();
  const reasons = new Map<string, string>();
  const oldestFirst = [...(input.adjustments ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  for (const a of oldestFirst) {
    if (a.targetTable === "stock_movements") fixedQty.set(a.targetId, a.newValue);
    reasons.set(a.targetId, a.reason);
  }
  const spends: Spend[] = [];
  for (const m of input.movements ?? []) {
    if (m.type !== "delivery") continue;
    const material = input.materials?.find((x) => x.id === m.materialId);
    const qty = fixedQty.get(m.id) ?? m.qty;
    spends.push({
      id: m.id,
      kind: "materials",
      title: material
        ? `${material.name} · ${formatQty(qty)} ${material.unit}`
        : "Material delivery",
      detail: [m.supplier, `challan ${m.challanNo}`, m.note].filter(Boolean).join(" · "),
      date: m.occurredOn,
      amountPaise: Math.round(qty * m.unitCostPaise),
      fixReason: reasons.get(m.id) ?? null,
    });
  }
  for (const p of input.payments ?? []) {
    const worker = input.workers?.find((w) => w.id === p.workerId);
    spends.push({
      id: p.id,
      kind: "wages",
      title: `${p.kind === "advance" ? "Advance" : "Wages"} · ${worker?.name ?? "worker"}`,
      detail: [modeLabel[p.mode], p.note, p.reference].filter(Boolean).join(" · "),
      date: p.paidOn,
      amountPaise: p.effectiveAmountPaise,
      // The engineer cannot read fixes, so a changed amount still says it was fixed.
      fixReason:
        reasons.get(p.id) ?? (p.effectiveAmountPaise !== p.amountPaise ? "amount changed" : null),
    });
  }
  return spends.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.amountPaise - a.amountPaise,
  );
}

export type SpendFilter = {
  kind: "all" | SpendKind;
  window: "today" | "7d" | "30d" | "all";
  /** Whole rupees; empty means no limit. */
  min: string;
  max: string;
};

export const defaultSpendFilter: SpendFilter = { kind: "all", window: "30d", min: "", max: "" };

export const windowLabel: Record<SpendFilter["window"], string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "Whole project",
};

export const kindLabel: Record<SpendFilter["kind"], string> = {
  all: "Everything",
  materials: "Materials",
  wages: "Wages and advances",
};

const rupees = (text: string) => {
  const n = Number.parseInt(text.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? null : n * 100;
};

export function applySpendFilter(spends: Spend[], f: SpendFilter, today: string): Spend[] {
  const since = { today: today, "7d": addDays(today, -6), "30d": addDays(today, -29), all: "" }[
    f.window
  ];
  const min = rupees(f.min);
  const max = rupees(f.max);
  return spends.filter(
    (s) =>
      (f.kind === "all" || s.kind === f.kind) &&
      s.date >= since &&
      (min === null || s.amountPaise >= min) &&
      (max === null || s.amountPaise <= max),
  );
}

export type SpendLine =
  | Spend
  | { id: string; kind: "wageDay"; date: string; amountPaise: number; rows: Spend[] };

/** Folds each day's wage payments into one line (payments are grouped by date); materials stay one per delivery. */
export function foldWagesByDay(spends: Spend[]): SpendLine[] {
  const lines: SpendLine[] = [];
  const days = new Map<string, Extract<SpendLine, { kind: "wageDay" }>>();
  for (const s of spends) {
    if (s.kind !== "wages") {
      lines.push(s);
      continue;
    }
    let day = days.get(s.date);
    if (!day) {
      day = { id: `wages-${s.date}`, kind: "wageDay", date: s.date, amountPaise: 0, rows: [] };
      days.set(s.date, day);
      lines.push(day);
    }
    day.rows.push(s);
    day.amountPaise += s.amountPaise;
  }
  return lines.map((l) => (l.kind === "wageDay" && l.rows.length === 1 ? l.rows[0] : l));
}
