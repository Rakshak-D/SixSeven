import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { materials, stockMovements } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import { PositiveQty, Qty, SignedQty } from "@/shared/schemas/common";
import type { CreateDeliveryInput, DeliveryResponse } from "@/shared/schemas/deliveries";
import { StockMovementResponse, type StockResponse } from "@/shared/schemas/stock";
import type { CreateUsageInput, UsageResponse } from "@/shared/schemas/usages";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

type Movement =
  | (CreateDeliveryInput & { type: "delivery" })
  | (CreateUsageInput & { type: "usage" | "adjustment" });
const MAX_STOCK = "99999999999.999";

const materialScope = (projectId: string, materialId: string) =>
  and(eq(materials.projectId, projectId), eq(materials.id, materialId));

async function requireMaterial(db: Db | Transaction, projectId: string, materialId: string) {
  const [material] = await db
    .select({ balance: materials.stockQty })
    .from(materials)
    .where(materialScope(projectId, materialId));
  if (!material) throw new ApiError(404, ErrorCode.NOT_FOUND, "Material not found");
  return material;
}

function isDuplicateChallan(error: unknown) {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (
      "code" in cause &&
      cause.code === "23505" &&
      "constraint_name" in cause &&
      cause.constraint_name === "stock_delivery_supplier_challan_unique"
    )
      return true;
  }
  return false;
}

/** Call within the caller's transaction after authorization. Adjustments supply a signed delta. */
export async function appendStockMovement(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  movement: Movement,
  id = crypto.randomUUID().toString(),
) {
  const { materialId, occurredOn, type, note } = movement;
  const qty =
    type === "adjustment" ? SignedQty.parse(movement.qty) : PositiveQty.parse(movement.qty);
  if (qty === 0)
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Movement quantity must be nonzero");

  await requireMaterial(tx, projectId, materialId);
  const delta = type === "usage" ? `-${qty}` : String(qty);
  const delivery =
    movement.type === "delivery"
      ? {
          supplier: movement.supplier,
          challanNo: movement.challanNo,
          unitCostPaise: movement.unitCostPaise,
        }
      : {};
  try {
    // Claim the normalized challan before updating the balance. Both writes roll back together.
    await tx.insert(stockMovements).values({
      id,
      projectId,
      materialId,
      type,
      qty: delta,
      occurredOn,
      note,
      createdBy: actor.userId,
      ...delivery,
    });
  } catch (error) {
    if (type === "delivery" && isDuplicateChallan(error)) {
      throw new ApiError(
        409,
        ErrorCode.DUPLICATE_CHALLAN,
        "This supplier challan is already recorded for the project",
      );
    }
    throw error;
  }

  const nextBalance = sql`${materials.stockQty} + ${delta}::numeric`;
  const [updated] = await tx
    .update(materials)
    .set({ stockQty: nextBalance })
    .where(
      and(
        materialScope(projectId, materialId),
        sql`(${nextBalance}) between 0 and ${MAX_STOCK}::numeric`,
      ),
    )
    .returning({ balance: materials.stockQty });
  if (!updated) {
    const observed = await requireMaterial(tx, projectId, materialId);
    if (type === "usage" || qty < 0) {
      throw new ApiError(409, ErrorCode.INSUFFICIENT_STOCK, "Insufficient stock", {
        materialId,
        balance: Qty.parse(Number(observed.balance)),
      });
    }
    throw new ApiError(
      409,
      ErrorCode.CONFLICT,
      "Resulting stock balance exceeds the supported range",
    );
  }

  await recordAudit(tx, {
    projectId,
    actorId: actor.userId,
    action: "created",
    entity: type,
    entityId: id,
  });
  return {
    id,
    materialId,
    occurredOn,
    note: note ?? null,
    qty,
    balance: Qty.parse(Number(updated.balance)),
  };
}

export async function recordDelivery(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateDeliveryInput,
): Promise<DeliveryResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const result = await appendStockMovement(tx, actor, projectId, { ...input, type: "delivery" });
    return {
      ...result,
      supplier: input.supplier,
      challanNo: input.challanNo,
      unitCostPaise: input.unitCostPaise,
    };
  });
}

export async function recordUsage(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateUsageInput,
): Promise<UsageResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    return appendStockMovement(tx, actor, projectId, { ...input, type: "usage" });
  });
}

export async function listStock(db: Db, actor: Actor, projectId: string): Promise<StockResponse> {
  await requireProjectAccess(db, actor, projectId);
  const rows = await db
    .select({
      materialId: materials.id,
      name: materials.name,
      unit: materials.unit,
      balance: materials.stockQty,
      lowStockQty: materials.lowStockQty,
      lowStock: sql<boolean>`${materials.stockQty} <= ${materials.lowStockQty}`,
    })
    .from(materials)
    .where(eq(materials.projectId, projectId))
    .orderBy(asc(materials.name), asc(materials.id));
  return rows.map((row) => ({
    ...row,
    balance: Qty.parse(Number(row.balance)),
    lowStockQty: Qty.parse(Number(row.lowStockQty)),
  }));
}

export async function listMovements(db: Db, actor: Actor, projectId: string, materialId?: string) {
  await requireProjectAccess(db, actor, projectId);
  if (materialId !== undefined) await requireMaterial(db, projectId, materialId);
  const rows = await db
    .select({
      id: stockMovements.id,
      materialId: stockMovements.materialId,
      occurredOn: stockMovements.occurredOn,
      createdAt: stockMovements.createdAt,
      note: stockMovements.note,
      type: stockMovements.type,
      qty: stockMovements.qty,
      supplier: stockMovements.supplier,
      challanNo: stockMovements.challanNo,
      unitCostPaise: stockMovements.unitCostPaise,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.projectId, projectId),
        materialId === undefined ? undefined : eq(stockMovements.materialId, materialId),
      ),
    )
    .orderBy(
      desc(stockMovements.occurredOn),
      desc(stockMovements.createdAt),
      desc(stockMovements.id),
    );
  return rows.map(({ supplier, challanNo, unitCostPaise, ...row }) =>
    StockMovementResponse.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      qty: Number(row.qty),
      ...(row.type === "delivery" && { supplier, challanNo, unitCostPaise }),
    }),
  );
}
