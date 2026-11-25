import { and, desc, eq, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { adjustments, attendance, stockMovements, wagePayments } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import {
  type AdjustmentListQuery,
  type AdjustmentListResponse,
  AdjustmentResponse,
  type CreateAdjustmentInput,
} from "@/shared/schemas/adjustments";
import { Qty } from "@/shared/schemas/common";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";
import { appendStockMovement } from "./stock-ledger";

const MAX_STOCK_MILLI = BigInt("99999999999999");

function decimalToMilli(value: number | string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(String(value));
  if (!match)
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "Quantity must have at most three decimal places",
    );
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const absolute = BigInt(match[2]) * BigInt(1_000) + BigInt(fraction || "0");
  const result = match[1] === "-" ? -absolute : absolute;
  if ((result < BigInt(0) ? -result : result) > MAX_STOCK_MILLI) {
    throw new ApiError(409, ErrorCode.CONFLICT, "Quantity exceeds the supported stock range");
  }
  return result;
}

function milliToDecimal(value: bigint) {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(1_000)}.${String(absolute % BigInt(1_000)).padStart(3, "0")}`;
}

async function latestValue(
  tx: Transaction,
  projectId: string,
  targetTable: "stock_movements" | "attendance" | "wage_payments",
  targetId: string,
) {
  const [row] = await tx
    .select({ value: adjustments.newValue })
    .from(adjustments)
    .where(
      and(
        eq(adjustments.projectId, projectId),
        eq(adjustments.targetTable, targetTable),
        eq(adjustments.targetId, targetId),
      ),
    )
    .orderBy(desc(adjustments.sequenceNo))
    .limit(1);
  return row?.value;
}

export async function createAdjustment(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateAdjustmentInput,
) {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const id = crypto.randomUUID();
    let oldValue: number;
    let newValue: number;
    let createdAt: Date;

    if (input.targetTable === "stock_movements") {
      const [target] = await tx
        .select({
          id: stockMovements.id,
          materialId: stockMovements.materialId,
          type: stockMovements.type,
          qty: stockMovements.qty,
          occurredOn: stockMovements.occurredOn,
        })
        .from(stockMovements)
        .where(and(eq(stockMovements.projectId, projectId), eq(stockMovements.id, input.targetId)))
        .for("update");
      if (!target) throw new ApiError(404, ErrorCode.NOT_FOUND, "Stock movement not found");
      if (target.type === "adjustment") {
        throw new ApiError(
          400,
          ErrorCode.VALIDATION_ERROR,
          "A compensating stock movement cannot be corrected",
        );
      }
      const originalMagnitude = decimalToMilli(target.qty);
      const previous = decimalToMilli(
        (await latestValue(tx, projectId, "stock_movements", target.id)) ??
          milliToDecimal(originalMagnitude < BigInt(0) ? -originalMagnitude : originalMagnitude),
      );
      const replacement = decimalToMilli(Qty.parse(input.newValue));
      if (replacement === previous)
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          "Correction does not change the effective quantity",
        );
      const direction = target.type === "delivery" ? BigInt(1) : BigInt(-1);
      const delta = (replacement - previous) * direction;
      oldValue = Number(milliToDecimal(previous));
      newValue = Number(milliToDecimal(replacement));
      await appendStockMovement(
        tx,
        actor,
        projectId,
        {
          type: "adjustment",
          materialId: target.materialId,
          occurredOn: target.occurredOn,
          note: input.reason,
          quantityMilli: delta,
        },
        crypto.randomUUID(),
        { targetTable: input.targetTable, targetId: target.id },
      );
      const [inserted] = await tx
        .insert(adjustments)
        .values({
          id,
          projectId,
          targetTable: input.targetTable,
          targetId: target.id,
          oldValue: milliToDecimal(previous),
          newValue: milliToDecimal(replacement),
          reason: input.reason,
          actorId: actor.userId,
        })
        .returning({ createdAt: adjustments.createdAt });
      createdAt = inserted.createdAt;
    } else if (input.targetTable === "attendance") {
      const [target] = await tx
        .select({ id: attendance.id, halfDays: attendance.halfDays })
        .from(attendance)
        .where(and(eq(attendance.projectId, projectId), eq(attendance.id, input.targetId)))
        .for("update");
      if (!target) throw new ApiError(404, ErrorCode.NOT_FOUND, "Attendance record not found");
      const previous = Number(
        (await latestValue(tx, projectId, "attendance", target.id)) ?? String(target.halfDays),
      );
      if (input.newValue === previous)
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          "Correction does not change the effective attendance",
        );
      oldValue = previous;
      newValue = input.newValue;
      const [inserted] = await tx
        .insert(adjustments)
        .values({
          id,
          projectId,
          targetTable: input.targetTable,
          targetId: target.id,
          oldValue: String(previous),
          newValue: String(newValue),
          reason: input.reason,
          actorId: actor.userId,
        })
        .returning({ createdAt: adjustments.createdAt });
      createdAt = inserted.createdAt;
    } else {
      const [target] = await tx
        .select({ id: wagePayments.id, amountPaise: wagePayments.amountPaise })
        .from(wagePayments)
        .where(and(eq(wagePayments.projectId, projectId), eq(wagePayments.id, input.targetId)))
        .for("update");
      if (!target) throw new ApiError(404, ErrorCode.NOT_FOUND, "Wage payment not found");
      const previous = Number(
        (await latestValue(tx, projectId, "wage_payments", target.id)) ??
          String(target.amountPaise),
      );
      if (input.newValue === previous)
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          "Correction does not change the effective payment",
        );
      oldValue = previous;
      newValue = input.newValue;
      const [inserted] = await tx
        .insert(adjustments)
        .values({
          id,
          projectId,
          targetTable: input.targetTable,
          targetId: target.id,
          oldValue: String(previous),
          newValue: String(newValue),
          reason: input.reason,
          actorId: actor.userId,
        })
        .returning({ createdAt: adjustments.createdAt });
      createdAt = inserted.createdAt;
    }

    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "corrected",
      entity: "adjustment",
      entityId: id,
      payload: { targetTable: input.targetTable, targetId: input.targetId },
    });
    return AdjustmentResponse.parse({
      id,
      targetId: input.targetId,
      targetTable: input.targetTable,
      oldValue,
      newValue,
      reason: input.reason,
      actorId: actor.userId,
      createdAt: createdAt.toISOString(),
    });
  });
}

export async function listAdjustments(
  db: Db,
  actor: Actor,
  projectId: string,
  query: AdjustmentListQuery,
): Promise<AdjustmentListResponse> {
  await requireProjectAccess(db, actor, projectId, ["owner", "contractor"]);
  const rows = await db
    .select()
    .from(adjustments)
    .where(
      and(
        eq(adjustments.projectId, projectId),
        query.targetTable ? eq(adjustments.targetTable, query.targetTable) : undefined,
        query.targetId ? eq(adjustments.targetId, query.targetId) : undefined,
        query.from
          ? sql`(${adjustments.createdAt} at time zone 'Asia/Kolkata')::date >= ${query.from}::date`
          : undefined,
        query.to
          ? sql`(${adjustments.createdAt} at time zone 'Asia/Kolkata')::date <= ${query.to}::date`
          : undefined,
      ),
    )
    .orderBy(desc(adjustments.sequenceNo));

  return rows.map((row) =>
    AdjustmentResponse.parse({
      id: row.id,
      targetId: row.targetId,
      targetTable: row.targetTable,
      oldValue:
        row.targetTable === "stock_movements"
          ? Qty.parse(Number(row.oldValue))
          : row.targetTable === "attendance"
            ? Number(row.oldValue)
            : Number(row.oldValue),
      newValue:
        row.targetTable === "stock_movements"
          ? Qty.parse(Number(row.newValue))
          : Number(row.newValue),
      reason: row.reason,
      actorId: row.actorId,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}
