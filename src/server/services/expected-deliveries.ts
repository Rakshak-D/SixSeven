import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { expectedDeliveries, materials, projectMembers } from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import {
  type CreateDeliveryInput,
  type CreateExpectedDeliveryInput,
  type ExpectedDeliveriesQuery,
  ExpectedDeliveryResponse,
  type RejectExpectedDeliveryInput,
} from "@/shared/schemas/deliveries";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";
import { appendStockMovement } from "./stock-ledger";

function response(row: typeof expectedDeliveries.$inferSelect) {
  const { projectId: _, createdBy: _createdBy, decidedBy: _decidedBy, ...fields } = row;
  return ExpectedDeliveryResponse.parse({
    ...fields,
    qty: Number(fields.qty),
    createdAt: fields.createdAt.toISOString(),
    decidedAt: fields.decidedAt?.toISOString() ?? null,
  });
}

async function insertSchedule(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  input: CreateExpectedDeliveryInput,
) {
  const [row] = await tx
    .insert(expectedDeliveries)
    .values({
      ...input,
      id: crypto.randomUUID(),
      projectId,
      qty: String(input.qty),
      createdBy: actor.userId,
    })
    .returning();
  await recordAudit(tx, {
    projectId,
    actorId: actor.userId,
    action: "created",
    entity: "expectedDelivery",
    entityId: row.id,
  });
  return row;
}

export async function scheduleDelivery(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateExpectedDeliveryInput,
) {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor", "engineer"]);
    const [material] = await tx
      .select({ id: materials.id })
      .from(materials)
      .where(and(eq(materials.projectId, projectId), eq(materials.id, input.materialId)));
    if (!material) throw new ApiError(404, ErrorCode.NOT_FOUND, "Material not found");
    return response(await insertSchedule(tx, actor, projectId, input));
  });
}

export async function listExpectedDeliveries(
  db: Db,
  actor: Actor,
  projectId: string,
  query: ExpectedDeliveriesQuery,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId);
    const rows = await tx
      .select()
      .from(expectedDeliveries)
      .where(
        and(
          eq(expectedDeliveries.projectId, projectId),
          query.status === "all"
            ? undefined
            : eq(expectedDeliveries.status, query.status ?? "pending"),
        ),
      )
      .orderBy(asc(expectedDeliveries.expectedOn), asc(expectedDeliveries.id));
    return rows.map(response);
  });
}

async function lockPending(tx: Transaction, actor: Actor, id: string) {
  const [match] = await tx
    .select({ schedule: expectedDeliveries, role: projectMembers.role })
    .from(expectedDeliveries)
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, expectedDeliveries.projectId),
        eq(projectMembers.userId, actor.userId),
        isNull(projectMembers.removedAt),
      ),
    )
    .where(eq(expectedDeliveries.id, id))
    .for("update", { of: expectedDeliveries });
  if (!match) throw new ApiError(404, ErrorCode.NOT_FOUND, "Expected delivery not found");
  if (match.role !== "contractor")
    throw new ApiError(403, ErrorCode.FORBIDDEN, "Only a contractor can decide arrival");
  if (match.schedule.status !== "pending")
    throw new ApiError(409, ErrorCode.CONFLICT, "Expected delivery has already been decided");
  return match.schedule;
}

export async function acceptExpectedDelivery(
  db: Db,
  actor: Actor,
  id: string,
  input: CreateDeliveryInput,
) {
  return db.transaction(async (tx) => {
    const schedule = await lockPending(tx, actor, id);
    if (input.materialId !== schedule.materialId) {
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "The delivered material must match the schedule",
      );
    }
    const { projectId } = schedule;
    const movement = await appendStockMovement(tx, actor, projectId, {
      ...input,
      type: "delivery",
    });
    await tx
      .update(expectedDeliveries)
      .set({
        status: "accepted",
        deliveryId: movement.id,
        decidedBy: actor.userId,
        decidedAt: sql`now()`,
      })
      .where(eq(expectedDeliveries.id, id));
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "approved",
      entity: "expectedDelivery",
      entityId: id,
      payload: { deliveryId: movement.id },
    });
    return {
      ...movement,
      supplier: input.supplier,
      unitCostPaise: input.unitCostPaise,
      challanNo: input.challanNo,
    };
  });
}

export async function rejectExpectedDelivery(
  db: Db,
  actor: Actor,
  id: string,
  input: RejectExpectedDeliveryInput,
) {
  return db.transaction(async (tx) => {
    const schedule = await lockPending(tx, actor, id);
    const { projectId } = schedule;
    if (input.newDate && input.newDate <= schedule.expectedOn) {
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Reschedule to a date after the original expected date",
      );
    }
    const [rejected] = await tx
      .update(expectedDeliveries)
      .set({
        status: "rejected",
        rejectionReason: input.reason,
        rescheduledOn: input.newDate ?? null,
        decidedBy: actor.userId,
        decidedAt: sql`now()`,
      })
      .where(eq(expectedDeliveries.id, id))
      .returning();
    const replacement = input.newDate
      ? await insertSchedule(tx, actor, projectId, {
          materialId: schedule.materialId,
          qty: Number(schedule.qty),
          supplier: schedule.supplier,
          expectedOn: input.newDate,
          note: schedule.note ?? undefined,
        })
      : null;
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "rejected",
      entity: "expectedDelivery",
      entityId: id,
      payload: { reason: input.reason, ...(replacement && { replacementId: replacement.id }) },
    });
    return response(rejected);
  });
}
