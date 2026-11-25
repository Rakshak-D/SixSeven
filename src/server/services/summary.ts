import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adjustments, expenses, materials, projects, stockMovements } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import { Qty } from "@/shared/schemas/common";
import { type SummaryResponse as Summary, SummaryResponse } from "@/shared/schemas/summary";
import { requireProjectAccess } from "./projects";
import { accruedPaise, loadEffectiveAttendance } from "./wage-calculations";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const IST_OFFSET_MS = 330 * 60 * 1000;

function safePaise(value: bigint, field: string) {
  if (value < BigInt(0) || value > MAX_SAFE) {
    throw new ApiError(409, ErrorCode.CONFLICT, `The ${field} total exceeds the supported range`);
  }
  return Number(value);
}

function todayInIst(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = utcDate(value);
  const dayFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayFromMonday);
  return dateText(date);
}

function eachWeek(start: string, end: string) {
  const first = mondayOf(start);
  const last = mondayOf(end);
  const weeks: string[] = [];
  for (let date = utcDate(first); date <= utcDate(last); date.setUTCDate(date.getUTCDate() + 7)) {
    weeks.push(dateText(date));
  }
  return weeks;
}

function elapsedDaysInclusive(start: string, today: string) {
  if (start > today) return BigInt(1);
  const days = Math.floor((utcDate(today).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
  return BigInt(Math.max(1, days));
}

function checkedQty(value: string, field: string) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error(`Database returned an invalid ${field}`);
  const milli =
    BigInt(match[1] ?? "0") * BigInt(1_000) + BigInt((match[2] ?? "").padEnd(3, "0") || "0");
  if (milli > BigInt("99999999999999")) {
    throw new ApiError(
      409,
      ErrorCode.CONFLICT,
      `The ${field} quantity exceeds the supported range`,
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Database returned an invalid ${field}`);
  if (BigInt(Math.round(parsed * 1_000)) !== milli || !Qty.safeParse(parsed).success) {
    throw new ApiError(
      409,
      ErrorCode.CONFLICT,
      `The ${field} quantity cannot be represented safely`,
    );
  }
  return parsed;
}

function quantityMilli(value: string) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error("Database returned an invalid stock quantity");
  return BigInt(match[1] ?? "0") * BigInt(1_000) + BigInt((match[2] ?? "").padEnd(3, "0") || "0");
}

function quantityMagnitudeMilli(value: string) {
  return quantityMilli(value.startsWith("-") ? value.slice(1) : value);
}

function quantityText(milli: bigint) {
  return `${milli / BigInt(1_000)}.${String(milli % BigInt(1_000)).padStart(3, "0")}`;
}

function decimalFraction(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("Database returned an invalid material tolerance");
  const fraction = match[2] ?? "";
  const denominator = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt(match[1] ?? "0") * denominator + BigInt(fraction || "0");
  return { numerator, denominator };
}

function deliveryLinePaise(quantityMilli: bigint, unitCostPaise: number) {
  const product = quantityMilli * BigInt(unitCostPaise);
  // Positive delivery amounts round half up, matching PostgreSQL round(numeric, 0).
  return (product + BigInt(500)) / BigInt(1_000);
}

type Spend = { materials: bigint; wages: bigint; other: bigint };

function zeroSpend(): Spend {
  return { materials: BigInt(0), wages: BigInt(0), other: BigInt(0) };
}

export async function getProjectSummary(
  db: Db,
  actor: Actor,
  projectId: string,
  now = new Date(),
): Promise<Summary> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    const access = await requireProjectAccess(tx, actor, projectId);
    const [project] = await tx
      .select({
        id: projects.id,
        startDate: projects.startDate,
        budgetPaise: projects.budgetPaise,
      })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new ApiError(404, ErrorCode.NOT_FOUND, "Project not found");

    const today = todayInIst(now);
    const hasElapsedRange = project.startDate <= today;
    const from = project.startDate;
    const to = hasElapsedRange ? today : from;

    const materialRows = await tx
      .select({
        id: materials.id,
        name: materials.name,
        unit: materials.unit,
        plannedQty: sql<string>`${materials.plannedQty}::text`,
        tolerancePct: materials.tolerancePct,
        toleranceValue: sql<string>`${materials.tolerancePct}::numeric::text`,
        lowStockQty: sql<string>`${materials.lowStockQty}::text`,
        balance: sql<string>`${materials.stockQty}::text`,
      })
      .from(materials)
      .where(eq(materials.projectId, projectId))
      .orderBy(materials.name, materials.id);

    const movementRows = hasElapsedRange
      ? await tx
          .select({
            id: stockMovements.id,
            materialId: stockMovements.materialId,
            type: stockMovements.type,
            qty: sql<string>`${stockMovements.qty}::text`,
            unitCostPaise: stockMovements.unitCostPaise,
            occurredOn: stockMovements.occurredOn,
          })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.projectId, projectId),
              inArray(stockMovements.type, ["delivery", "usage"]),
              gte(stockMovements.occurredOn, from),
              lte(stockMovements.occurredOn, to),
            ),
          )
      : [];

    const movementCorrections = movementRows.length
      ? await tx
          .select({ targetId: adjustments.targetId, newValue: adjustments.newValue })
          .from(adjustments)
          .where(
            and(
              eq(adjustments.projectId, projectId),
              eq(adjustments.targetTable, "stock_movements"),
              inArray(
                adjustments.targetId,
                movementRows.map((row) => row.id),
              ),
            ),
          )
          .orderBy(asc(adjustments.sequenceNo))
      : [];
    const effectiveMovementQty = new Map<string, string>();
    for (const correction of movementCorrections)
      effectiveMovementQty.set(correction.targetId, correction.newValue);

    const usedMilliByMaterial = new Map<string, bigint>();
    const deliveryRows: { occurredOn: string; amount: bigint }[] = [];
    for (const movement of movementRows) {
      const corrected = effectiveMovementQty.get(movement.id);
      const quantity =
        corrected !== undefined ? quantityMilli(corrected) : quantityMagnitudeMilli(movement.qty);
      if (movement.type === "usage") {
        usedMilliByMaterial.set(
          movement.materialId,
          (usedMilliByMaterial.get(movement.materialId) ?? BigInt(0)) + quantity,
        );
      } else {
        if (movement.unitCostPaise === null)
          throw new Error("Delivery movement is missing its recorded unit cost");
        deliveryRows.push({
          occurredOn: movement.occurredOn,
          amount: deliveryLinePaise(quantity, movement.unitCostPaise),
        });
      }
    }

    const expenseRows = hasElapsedRange
      ? await tx
          .select({ occurredOn: expenses.occurredOn, amountPaise: expenses.amountPaise })
          .from(expenses)
          .where(
            and(
              eq(expenses.projectId, projectId),
              gte(expenses.occurredOn, from),
              lte(expenses.occurredOn, to),
            ),
          )
      : [];

    const laborRows = hasElapsedRange ? await loadEffectiveAttendance(tx, projectId, from, to) : [];

    const spendByWeek = new Map<string, Spend>();
    const total = zeroSpend();
    for (const week of hasElapsedRange ? eachWeek(from, to) : [])
      spendByWeek.set(week, zeroSpend());

    for (const row of deliveryRows) {
      const amount = row.amount;
      total.materials += amount;
      (spendByWeek.get(mondayOf(row.occurredOn)) ?? zeroSpend()).materials += amount;
    }
    for (const row of expenseRows) {
      const amount = BigInt(row.amountPaise);
      total.other += amount;
      (spendByWeek.get(mondayOf(row.occurredOn)) ?? zeroSpend()).other += amount;
    }
    for (const row of laborRows) {
      const amount = accruedPaise(BigInt(row.paidHalfDays), BigInt(row.ratePaise));
      total.wages += amount;
      (spendByWeek.get(mondayOf(row.workDate)) ?? zeroSpend()).wages += amount;
    }

    const totalSpend = total.materials + total.wages + total.other;
    const elapsedDays = elapsedDaysInclusive(from, today);
    const spendPaise = safePaise(totalSpend, "total expenditure");
    const weeks = [...spendByWeek.entries()].map(([weekStart, spend]) =>
      access.role === "engineer"
        ? {
            weekStart,
            spendPaise: safePaise(
              spend.materials + spend.wages + spend.other,
              "weekly expenditure",
            ),
          }
        : {
            weekStart,
            materialsPaise: safePaise(spend.materials, "weekly material expenditure"),
            wagesPaise: safePaise(spend.wages, "weekly accrued labour"),
            otherPaise: safePaise(spend.other, "weekly other expenditure"),
          },
    );

    const common = {
      budgetPaise: safePaise(BigInt(project.budgetPaise), "project budget"),
      spendPaise,
      burnRatePaisePerDay: safePaise(totalSpend / elapsedDays, "average daily expenditure"),
      materialVariance: materialRows.map((row) => {
        const plannedMilli = quantityMilli(row.plannedQty);
        const usedMilli = usedMilliByMaterial.get(row.id) ?? BigInt(0);
        const tolerance = decimalFraction(row.toleranceValue);
        return {
          materialId: row.id,
          name: row.name,
          unit: row.unit,
          plannedQty: checkedQty(row.plannedQty, "planned quantity"),
          usedQty: checkedQty(quantityText(usedMilli), "used quantity"),
          tolerancePct: row.tolerancePct,
          overTolerance:
            usedMilli * BigInt(100) * tolerance.denominator >
            plannedMilli * (BigInt(100) * tolerance.denominator + tolerance.numerator),
        };
      }),
      stockAlerts: materialRows
        .filter((row) => quantityMilli(row.balance) <= quantityMilli(row.lowStockQty))
        .map((row) => ({
          materialId: row.id,
          name: row.name,
          balance: checkedQty(row.balance, "stock balance"),
          lowStockQty: checkedQty(row.lowStockQty, "low stock threshold"),
        })),
    };

    if (access.role === "engineer") {
      return SummaryResponse.parse({ ...common, role: access.role, spendByWeek: weeks });
    }
    const spendSplit = {
      materialsPaise: safePaise(total.materials, "material expenditure"),
      labourPaise: safePaise(total.wages, "accrued labour"),
      otherPaise: safePaise(total.other, "other expenditure"),
    };
    return SummaryResponse.parse({
      ...common,
      role: access.role,
      spendSplit,
      spendByWeek: weeks,
    });
  });
}
