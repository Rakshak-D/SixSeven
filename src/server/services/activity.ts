import { and, desc, eq, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import type { Db } from "@/db/client";
import { adjustments, auditLog } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { type ActivityResponse as Activity, ActivityResponse } from "@/shared/schemas/activity";
import { requireProjectAccess } from "./projects";

const visibleEntities = new Set([
  "project",
  "member",
  "material",
  "worker",
  "delivery",
  "expectedDelivery",
  "usage",
  "attendance",
  "wagePayment",
  "adjustment",
  "progress",
  "proposal",
  "checklist",
  "checklistItem",
]);
const visibleActions = new Set(["created", "updated", "corrected", "approved", "rejected"]);

export async function listProjectActivity(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Activity> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    const access = await requireProjectAccess(tx, actor, projectId);
    const rows = await tx
      .select({
        id: auditLog.id,
        actorId: user.id,
        actorName: user.name,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        correctionTarget: adjustments.targetTable,
      })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.actorId))
      .leftJoin(
        adjustments,
        and(
          eq(adjustments.projectId, auditLog.projectId),
          eq(adjustments.id, auditLog.entityId),
          eq(auditLog.entity, "adjustment"),
          eq(auditLog.action, "corrected"),
        ),
      )
      .where(eq(auditLog.projectId, projectId))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id));

    return ActivityResponse.parse(
      rows
        .filter((row) => visibleEntities.has(row.entity) && visibleActions.has(row.action))
        // appendStockMovement also audits a compensating adjustment movement. The correction row
        // below is the user-facing event; showing both creates a misleading duplicate.
        .filter((row) => !(row.entity === "adjustment" && row.action === "created"))
        .filter((row) => {
          if (access.role !== "engineer") return true;
          if (row.entity === "attendance" || row.entity === "wagePayment") return false;
          return !(
            row.entity === "adjustment" &&
            row.action === "corrected" &&
            (row.correctionTarget === "attendance" || row.correctionTarget === "wage_payments")
          );
        })
        .map((row) => ({
          id: row.id,
          actor: { id: row.actorId, name: row.actorName },
          action: row.action,
          entity: row.entity,
          entityId: row.entityId,
          createdAt: row.createdAt.toISOString(),
        })),
    );
  });
}
