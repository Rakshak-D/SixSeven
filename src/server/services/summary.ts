import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { expenses, materials, projects, stockMovements } from "@/db/schema";
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
        lowStockQty: sql<string>`${materials.lowStockQty}::text`,
        balance: sql<string>`${materials.stockQty}::text`,
        usedQty: hasElapsedRange
          ? sql<string>`coalesce((
          select sum(coalesce((
            select a.new_value from adjustments a
            where a.project_id = sm.project_id and a.target_table = 'stock_movements'
              and a.target_id = sm.id
            order by a.sequence_no desc limit 1
          ), abs(sm.qty)::numeric))
          from stock_movements sm
          where sm.project_id = ${projectId} and sm.material_id = ${materials.id}
            and sm.type = 'usage' and sm.occurred_on >= ${from}::date
            and sm.occurred_on <= ${to}::date
        ), 0)::text`
          : sql<string>`0`,
        overTolerance: hasElapsedRange
          ? sql<boolean>`coalesce((
          select sum(coalesce((
            select a.new_value from adjustments a
            where a.project_id = sm.project_id and a.target_table = 'stock_movements'
              and a.target_id = sm.id
            order by a.sequence_no desc limit 1
          ), abs(sm.qty)::numeric))
          from stock_movements sm
          where sm.project_id = ${projectId} and sm.material_id = ${materials.id}
            and sm.type = 'usage' and sm.occurred_on >= ${from}::date
            and sm.occurred_on <= ${to}::date
        ), 0) > ${materials.plannedQty}::numeric * (100 + ${materials.tolerancePct}::numeric) / 100`
          : sql<boolean>`false`,
      })
      .from(materials)
      .where(eq(materials.projectId, projectId))
      .orderBy(materials.name, materials.id);

    const deliveryRows = hasElapsedRange
      ? await tx
          .select({
            occurredOn: stockMovements.occurredOn,
            amount: sql<string>`round(coalesce((
              select a.new_value from adjustments a
              where a.project_id = ${stockMovements.projectId}
                and a.target_table = 'stock_movements' and a.target_id = ${stockMovements.id}
              order by a.sequence_no desc limit 1
            ), ${stockMovements.qty}::numeric) * ${stockMovements.unitCostPaise}::numeric, 0)::text`,
          })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.projectId, projectId),
              eq(stockMovements.type, "delivery"),
              gte(stockMovements.occurredOn, from),
              lte(stockMovements.occurredOn, to),
            ),
          )
      : [];

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
      const amount = BigInt(row.amount);
      total.materials += amount;
      (spendByWeek.get(mondayOf(row.occurredOn)) ?? zeroSpend()).materials += amount;
    }
    for (const row of expenseRows) {
      const amount = BigInt(row.amountPaise);
      total.other += amount;
      (spendByWeek.get(mondayOf(row.occurredOn)) ?? zeroSpend()).other += amount;
    }
    for (const row of laborRows) {
      const amount = accruedPaise(BigInt(row.halfDays), BigInt(row.ratePaise));
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
      materialVariance: materialRows.map((row) => ({
        materialId: row.id,
        name: row.name,
        unit: row.unit,
        plannedQty: checkedQty(row.plannedQty, "planned quantity"),
        usedQty: checkedQty(row.usedQty, "used quantity"),
        tolerancePct: row.tolerancePct,
        overTolerance: row.overTolerance,
      })),
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
