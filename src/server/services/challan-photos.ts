import { and, eq } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { deliveryChallanPhotos, stockMovements } from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import { ChallanPhotoResponse } from "@/shared/schemas/deliveries";
import { PhotoMime } from "@/shared/schemas/progress";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { persistValidatedPhotos, readStoredPhoto, validateImageUpload } from "./photo-storage";
import { requireProjectAccess } from "./projects";

async function requireDelivery(db: Db | Transaction, projectId: string, deliveryId: string) {
  const [delivery] = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.projectId, projectId),
        eq(stockMovements.id, deliveryId),
        eq(stockMovements.type, "delivery"),
      ),
    );
  if (!delivery) throw new ApiError(404, ErrorCode.NOT_FOUND, "Delivery not found");
}

export async function attachChallanPhoto(
  db: Db,
  actor: Actor,
  projectId: string,
  deliveryId: string,
  file: File,
) {
  await requireProjectAccess(db, actor, projectId, ["contractor"]);
  await requireDelivery(db, projectId, deliveryId);
  const stored = await persistValidatedPhotos([await validateImageUpload(file)]);
  try {
    const photo = stored.photos[0];
    return await db.transaction(async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["contractor"]);
      await requireDelivery(tx, projectId, deliveryId);
      const [inserted] = await tx
        .insert(deliveryChallanPhotos)
        .values({ ...photo, projectId, deliveryId, createdBy: actor.userId })
        .onConflictDoNothing({ target: deliveryChallanPhotos.deliveryId })
        .returning({ createdAt: deliveryChallanPhotos.createdAt });
      if (!inserted)
        throw new ApiError(409, ErrorCode.CONFLICT, "This delivery already has a challan photo");
      await recordAudit(tx, {
        projectId,
        actorId: actor.userId,
        action: "updated",
        entity: "deliveryChallan",
        entityId: deliveryId,
      });
      return ChallanPhotoResponse.parse({
        deliveryId,
        mime: photo.mime,
        sizeBytes: photo.sizeBytes,
        createdAt: inserted.createdAt.toISOString(),
        url: `/api/v1/projects/${projectId}/deliveries/${deliveryId}/challan-photo`,
      });
    });
  } catch (error) {
    await stored.cleanup();
    throw error;
  }
}

export async function getChallanPhoto(db: Db, actor: Actor, projectId: string, deliveryId: string) {
  await requireProjectAccess(db, actor, projectId);
  const [photo] = await db
    .select()
    .from(deliveryChallanPhotos)
    .where(
      and(
        eq(deliveryChallanPhotos.projectId, projectId),
        eq(deliveryChallanPhotos.deliveryId, deliveryId),
      ),
    );
  if (!photo) throw new ApiError(404, ErrorCode.NOT_FOUND, "Challan photo not found");
  const bytes = await readStoredPhoto(photo.storageKey);
  if (!bytes) throw new ApiError(404, ErrorCode.NOT_FOUND, "Challan photo not found");
  if (bytes.byteLength !== photo.sizeBytes)
    throw new Error("Stored photo size does not match metadata");
  return { bytes, mime: PhotoMime.parse(photo.mime) };
}
