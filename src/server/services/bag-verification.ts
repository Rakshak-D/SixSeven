import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import {
  adjustments,
  deliveryVerifications,
  materialBagCodes,
  materials,
  projectMembers,
  stockMovements,
} from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import {
  DeliveryVerificationQueue,
  DeliveryVerificationResponse,
} from "@/shared/schemas/deliveries";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

const notFound = () => new ApiError(404, ErrorCode.NOT_FOUND, "Delivery not found");
const quantityError = () =>
  new ApiError(400, ErrorCode.VALIDATION_ERROR, "Provide one unique bag code per whole bag");

async function lockDeliveryForVerification(
  tx: Transaction,
  actor: Actor,
  id: string,
  projectId?: string,
) {
  const [row] = await tx
    .select({
      projectId: stockMovements.projectId,
      materialId: stockMovements.materialId,
      qty: stockMovements.qty,
      tracksBags: materials.tracksBags,
      role: projectMembers.role,
    })
    .from(stockMovements)
    .innerJoin(
      materials,
      and(
        eq(materials.projectId, stockMovements.projectId),
        eq(materials.id, stockMovements.materialId),
      ),
    )
    .innerJoin(
      projectMembers,
      and(
        eq(projectMembers.projectId, stockMovements.projectId),
        eq(projectMembers.userId, actor.userId),
      ),
    )
    .where(
      and(
        eq(stockMovements.id, id),
        eq(stockMovements.type, "delivery"),
        projectId ? eq(stockMovements.projectId, projectId) : undefined,
      ),
    )
    .for("update", { of: stockMovements });
  if (!row) throw notFound();
  if (row.role !== "engineer")
    throw new ApiError(403, ErrorCode.FORBIDDEN, "Only the project engineer can verify delivery");
  return row;
}

export async function verifyDelivery(
  db: Db,
  actor: Actor,
  id: string,
  note: string,
  codes: string[],
  projectId?: string,
) {
  return db.transaction(async (tx) => {
    const delivery = await lockDeliveryForVerification(tx, actor, id, projectId);
    const [latest] = await tx
      .select({ qty: adjustments.newValue })
      .from(adjustments)
      .where(
        and(
          eq(adjustments.projectId, delivery.projectId),
          eq(adjustments.targetId, id),
          eq(adjustments.targetTable, "stock_movements"),
        ),
      )
      .orderBy(desc(adjustments.sequenceNo))
      .limit(1);
    const verifiedQty = latest?.qty ?? delivery.qty;
    if (Number(verifiedQty) <= 0)
      throw new ApiError(409, ErrorCode.CONFLICT, "A reversed delivery cannot be verified");
    if (delivery.tracksBags ? codes.length !== Number(verifiedQty) : codes.length > 0)
      throw quantityError();
    const [verification] = await tx
      .insert(deliveryVerifications)
      .values({
        projectId: delivery.projectId,
        deliveryId: id,
        verifiedBy: actor.userId,
        note,
        bagCodeCount: codes.length,
        verifiedQty,
      })
      .onConflictDoNothing({ target: deliveryVerifications.deliveryId })
      .returning();
    if (!verification) throw new ApiError(409, ErrorCode.CONFLICT, "Delivery was already verified");
    if (codes.length) {
      const rows = await tx
        .insert(materialBagCodes)
        .values(
          [...codes].sort().map((code) => ({
            projectId: delivery.projectId,
            code,
            deliveryId: id,
            materialId: delivery.materialId,
          })),
        )
        .onConflictDoNothing({ target: [materialBagCodes.projectId, materialBagCodes.code] })
        .returning({ code: materialBagCodes.code });
      if (rows.length !== codes.length)
        throw new ApiError(
          409,
          ErrorCode.CONFLICT,
          "A bag code is already registered in this project",
        );
    }
    await recordAudit(tx, {
      projectId: delivery.projectId,
      actorId: actor.userId,
      action: "updated",
      entity: "deliveryVerification",
      entityId: id,
      payload: { verification: true, bagCodeCount: codes.length },
    });
    return DeliveryVerificationResponse.parse({
      ok: true,
      deliveryId: id,
      verifiedBy: actor.userId,
      verifiedAt: verification.verifiedAt.toISOString(),
      bagCodeCount: codes.length,
    });
  });
}

export async function listVerificationQueue(db: Db, actor: Actor, projectId: string) {
  return db.transaction(
    async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["engineer"]);
      const qty = sql<string>`coalesce((
      select ${adjustments.newValue} from ${adjustments}
      where ${adjustments.projectId} = ${stockMovements.projectId} and
        ${adjustments.targetId} = ${stockMovements.id} and ${adjustments.targetTable} = 'stock_movements'
      order by ${adjustments.sequenceNo} desc limit 1
    ), ${stockMovements.qty})`;
      const rows = await tx
        .select({
          deliveryId: stockMovements.id,
          materialName: materials.name,
          unit: materials.unit,
          qty,
          supplier: stockMovements.supplier,
          challanNo: stockMovements.challanNo,
          occurredOn: stockMovements.occurredOn,
          tracksBags: materials.tracksBags,
        })
        .from(stockMovements)
        .innerJoin(
          materials,
          and(
            eq(materials.projectId, stockMovements.projectId),
            eq(materials.id, stockMovements.materialId),
          ),
        )
        .leftJoin(
          deliveryVerifications,
          and(
            eq(deliveryVerifications.projectId, stockMovements.projectId),
            eq(deliveryVerifications.deliveryId, stockMovements.id),
          ),
        )
        .where(
          and(
            eq(stockMovements.projectId, projectId),
            eq(stockMovements.type, "delivery"),
            isNull(deliveryVerifications.deliveryId),
            sql`${qty} > 0`,
          ),
        )
        .orderBy(desc(stockMovements.occurredOn), asc(stockMovements.id));
      return DeliveryVerificationQueue.parse(rows.map((row) => ({ ...row, qty: Number(row.qty) })));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function claimBagCodes(
  tx: Transaction,
  projectId: string,
  materialId: string,
  qty: number,
  tracked: boolean,
  codes: string[],
) {
  if (!tracked) {
    if (codes.length) throw quantityError();
    return;
  }
  if (!codes.length || codes.length !== qty) throw quantityError();
  const rows = await tx
    .select()
    .from(materialBagCodes)
    .where(and(eq(materialBagCodes.projectId, projectId), inArray(materialBagCodes.code, codes)))
    .orderBy(asc(materialBagCodes.code))
    .for("update");
  if (rows.length !== codes.length)
    throw new ApiError(
      409,
      ErrorCode.BAG_CODE_UNKNOWN,
      "A bag code is not registered in this project",
    );
  if (rows.some((row) => row.materialId !== materialId))
    throw new ApiError(
      409,
      ErrorCode.BAG_CODE_WRONG_MATERIAL,
      "A bag code belongs to a different material",
    );
  if (rows.some((row) => row.consumedBy))
    throw new ApiError(409, ErrorCode.BAG_CODE_USED, "A bag code was already consumed");
}

export async function consumeBagCodes(
  tx: Transaction,
  projectId: string,
  usageId: string,
  codes: string[],
) {
  if (codes.length)
    await tx
      .update(materialBagCodes)
      .set({ consumedBy: usageId, consumedAt: sql`now()` })
      .where(and(eq(materialBagCodes.projectId, projectId), inArray(materialBagCodes.code, codes)));
}
