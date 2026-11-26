import { and, asc, desc, eq } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { checklistEvents, checklistItems, checklistSteelPhotos } from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import { SteelProofPhotos } from "@/shared/schemas/checklist";
import { PhotoMime } from "@/shared/schemas/progress";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { captureTimes } from "./capture-times";
import { persistValidatedPhotos, readStoredPhoto, validateImageUpload } from "./photo-storage";
import { requireProjectAccess } from "./projects";

const missing = () => new ApiError(404, ErrorCode.NOT_FOUND, "Checklist evidence not found");
const conflict = (message: string) => new ApiError(409, ErrorCode.CONFLICT, message);

async function accessibleItem(db: Db | Transaction, actor: Actor, id: string, engineer = false) {
  const [row] = await db.select().from(checklistItems).where(eq(checklistItems.id, id));
  if (!row) throw missing();
  await requireProjectAccess(db, actor, row.projectId, engineer ? ["engineer"] : undefined);
  return row;
}

function publicPhotos(rows: (typeof checklistSteelPhotos.$inferSelect)[]) {
  return SteelProofPhotos.parse(
    rows.map(({ id, itemId, progressId, mime, sizeBytes, capturedAt, receivedAt }) => ({
      id,
      progressId,
      mime,
      sizeBytes,
      capturedAt: capturedAt.toISOString(),
      receivedAt: receivedAt.toISOString(),
      takenOn: new Date(capturedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10),
      url: `/api/v1/checklist-items/${itemId}/steel-proof/${id}`,
    })),
  );
}

export async function uploadSteelProof(
  db: Db,
  actor: Actor,
  itemId: string,
  input: { progressId: string; note: string; photos: File[]; capturedAt: string[] },
) {
  await accessibleItem(db, actor, itemId, true);
  const receivedAt = new Date();
  const captures = captureTimes(input.capturedAt, input.photos.length, receivedAt);
  const validated = [];
  for (const file of input.photos) validated.push(await validateImageUpload(file));
  const stored = await persistValidatedPhotos(validated);
  try {
    return await db.transaction(async (tx) => {
      const access = await accessibleItem(tx, actor, itemId, true);
      const { projectId } = access;
      const [item] = await tx
        .select()
        .from(checklistItems)
        .where(and(eq(checklistItems.projectId, projectId), eq(checklistItems.id, itemId)))
        .for("update");
      if (!item || !item.requiresSteelProof || item.removedAt || item.state !== "waiting")
        throw conflict("Steel evidence requires a flagged item with a pending review");
      const [submission] = await tx
        .select({ progressId: checklistEvents.progressId })
        .from(checklistEvents)
        .where(
          and(
            eq(checklistEvents.projectId, projectId),
            eq(checklistEvents.itemId, itemId),
            eq(checklistEvents.kind, "submitted"),
          ),
        )
        .orderBy(desc(checklistEvents.sequence))
        .limit(1);
      if (submission?.progressId !== input.progressId)
        throw conflict("Steel evidence must reference the current contractor submission");
      const [existing] = await tx
        .select({ id: checklistSteelPhotos.id })
        .from(checklistSteelPhotos)
        .where(
          and(
            eq(checklistSteelPhotos.projectId, projectId),
            eq(checklistSteelPhotos.itemId, itemId),
            eq(checklistSteelPhotos.progressId, input.progressId),
          ),
        )
        .limit(1);
      if (existing) throw conflict("The current submission already has steel evidence");
      const photos = await tx
        .insert(checklistSteelPhotos)
        .values(
          stored.photos.map((photo, i) => ({
            ...photo,
            id: crypto.randomUUID(),
            projectId,
            itemId,
            progressId: input.progressId,
            capturedAt: captures[i],
            receivedAt,
            createdBy: actor.userId,
          })),
        )
        .returning();
      await recordAudit(tx, {
        projectId,
        actorId: actor.userId,
        action: "updated",
        entity: "checklistItem",
        entityId: itemId,
        payload: { verification: "steel_markings", progressId: input.progressId, note: input.note },
      });
      return publicPhotos(photos);
    });
  } catch (error) {
    await stored.cleanup();
    throw error;
  }
}

export async function listSteelProof(db: Db, actor: Actor, itemId: string) {
  return db.transaction(
    async (tx) => {
      const { projectId } = await accessibleItem(tx, actor, itemId);
      const rows = await tx
        .select()
        .from(checklistSteelPhotos)
        .where(
          and(
            eq(checklistSteelPhotos.projectId, projectId),
            eq(checklistSteelPhotos.itemId, itemId),
          ),
        )
        .orderBy(asc(checklistSteelPhotos.capturedAt), asc(checklistSteelPhotos.id));
      return publicPhotos(rows);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getSteelProofPhoto(db: Db, actor: Actor, itemId: string, photoId: string) {
  const row = await db.transaction(
    async (tx) => {
      const { projectId } = await accessibleItem(tx, actor, itemId);
      const [photo] = await tx
        .select()
        .from(checklistSteelPhotos)
        .where(
          and(
            eq(checklistSteelPhotos.projectId, projectId),
            eq(checklistSteelPhotos.itemId, itemId),
            eq(checklistSteelPhotos.id, photoId),
          ),
        );
      if (!photo) throw missing();
      return photo;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const bytes = await readStoredPhoto(row.storageKey);
  if (!bytes) throw missing();
  if (bytes.byteLength !== row.sizeBytes)
    throw new Error("Stored steel photo size does not match metadata");
  return { bytes, mime: PhotoMime.parse(row.mime) };
}
