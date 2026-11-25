import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { materials, workers } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import { Qty } from "@/shared/schemas/common";
import type { CreateMaterialInput, MaterialResponse } from "@/shared/schemas/materials";
import type {
  CreateWorkerInput,
  DeactivateWorkerInput,
  WorkerResponse,
} from "@/shared/schemas/workers";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

const materialFields = {
  id: materials.id,
  name: materials.name,
  unit: materials.unit,
  plannedQty: materials.plannedQty,
  unitCostPaise: materials.unitCostPaise,
  tolerancePct: materials.tolerancePct,
  lowStockQty: materials.lowStockQty,
};

function materialResponse(
  row: Pick<typeof materials.$inferSelect, keyof typeof materialFields>,
): MaterialResponse {
  return {
    ...row,
    plannedQty: Qty.parse(Number(row.plannedQty)),
    lowStockQty: Qty.parse(Number(row.lowStockQty)),
  };
}

export async function createMaterial(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateMaterialInput,
) {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const [material] = await tx
      .insert(materials)
      .values({
        ...input,
        id: crypto.randomUUID(),
        projectId,
        plannedQty: String(input.plannedQty),
        lowStockQty: String(input.lowStockQty),
      })
      .returning(materialFields);
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "material",
      entityId: material.id,
    });
    return materialResponse(material);
  });
}

export async function listMaterials(db: Db, actor: Actor, projectId: string) {
  await requireProjectAccess(db, actor, projectId);
  const rows = await db
    .select(materialFields)
    .from(materials)
    .where(eq(materials.projectId, projectId))
    .orderBy(asc(materials.name), asc(materials.id));
  return rows.map(materialResponse);
}

const workerFields = {
  id: workers.id,
  name: workers.name,
  category: workers.category,
  dailyRatePaise: workers.dailyRatePaise,
  active: workers.active,
};

const workerLifecycleFields = {
  ...workerFields,
  removedReason: workers.removedReason,
  removedAt: workers.removedAt,
};

function workerResponse({
  removedReason,
  removedAt,
  ...worker
}: {
  id: string;
  name: string;
  category: string;
  dailyRatePaise: number;
  active: boolean;
  removedReason: string | null;
  removedAt: Date | null;
}): WorkerResponse {
  return removedReason !== null && removedAt !== null
    ? { ...worker, removedReason, removedOn: removedAt.toISOString() }
    : worker;
}

export async function createWorker(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateWorkerInput,
): Promise<WorkerResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const [worker] = await tx
      .insert(workers)
      .values({
        ...input,
        id: crypto.randomUUID(),
        projectId,
      })
      .returning(workerFields);
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "worker",
      entityId: worker.id,
    });
    return worker;
  });
}

export async function listWorkers(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<WorkerResponse[]> {
  await requireProjectAccess(db, actor, projectId, ["contractor", "owner"]);
  const rows = await db
    .select(workerLifecycleFields)
    .from(workers)
    .where(eq(workers.projectId, projectId))
    .orderBy(asc(workers.name), asc(workers.id));
  return rows.map(workerResponse);
}

export async function deactivateWorker(
  db: Db,
  actor: Actor,
  projectId: string,
  workerId: string,
  input: DeactivateWorkerInput,
): Promise<WorkerResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const target = and(eq(workers.projectId, projectId), eq(workers.id, workerId));
    const [worker] = await tx
      .update(workers)
      .set({ active: false, removedReason: input.reason, removedAt: sql`now()` })
      .where(and(target, eq(workers.active, true)))
      .returning(workerLifecycleFields);
    if (!worker) {
      const [existing] = await tx.select({ id: workers.id }).from(workers).where(target);
      if (!existing)
        throw new ApiError(404, ErrorCode.NOT_FOUND, "Worker not found in this project");
      throw new ApiError(409, ErrorCode.CONFLICT, "Worker is already inactive");
    }
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "updated",
      entity: "worker",
      entityId: worker.id,
    });
    return workerResponse(worker);
  });
}
