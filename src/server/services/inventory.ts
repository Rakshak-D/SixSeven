import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { materials, workers } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { Qty } from "@/shared/schemas/common";
import type { CreateMaterialInput, MaterialResponse } from "@/shared/schemas/materials";
import type { CreateWorkerInput, WorkerResponse } from "@/shared/schemas/workers";
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
  return db
    .select(workerFields)
    .from(workers)
    .where(eq(workers.projectId, projectId))
    .orderBy(asc(workers.name), asc(workers.id));
}
