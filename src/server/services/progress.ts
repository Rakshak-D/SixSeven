import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { checklistItems, progressPhotos, progressUpdates } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import type {
  ProgressResponse as Progress,
  TimelineResponse as Timeline,
} from "@/shared/schemas/progress";
import {
  CreateProgressInput,
  PhotoMime,
  ProgressResponse,
  TimelineResponse,
} from "@/shared/schemas/progress";
import { recordAudit } from "./audit";
import { persistValidatedPhotos, readStoredPhoto, validateImageUpload } from "./photo-storage";
import { requireProjectAccess } from "./projects";

const IST_OFFSET_MS = 330 * 60 * 1000;

function istDate(value: Date) {
  return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function publicPhoto(
  projectId: string,
  photo: {
    id: string;
    mime: string;
    sizeBytes: number;
    takenOn: string;
  },
) {
  return {
    id: photo.id,
    mime: PhotoMime.parse(photo.mime),
    sizeBytes: photo.sizeBytes,
    takenOn: photo.takenOn,
    url: `/api/v1/projects/${projectId}/photos/${photo.id}`,
  };
}

export async function writeProgressWithPhotos<T>(
  db: Db,
  actor: Actor,
  projectId: string,
  rawInput: CreateProgressInput,
  finish: (tx: Transaction, progress: Progress) => Promise<T>,
): Promise<T> {
  await requireProjectAccess(db, actor, projectId, ["contractor", "engineer"]);
  const input = CreateProgressInput.parse(rawInput);
  const validated: Awaited<ReturnType<typeof validateImageUpload>>[] = [];
  for (const file of input.photos) validated.push(await validateImageUpload(file));
  const stored = await persistValidatedPhotos(validated);
  const takenOn = istDate(new Date());
  try {
    return await db.transaction(async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["contractor", "engineer"]);
      if (input.checklistItemId) {
        const [item] = await tx
          .select({ id: checklistItems.id })
          .from(checklistItems)
          .where(
            and(
              eq(checklistItems.projectId, projectId),
              eq(checklistItems.id, input.checklistItemId),
              sql`${checklistItems.removedAt} is null`,
            ),
          )
          .for("update");
        if (!item) throw new ApiError(404, ErrorCode.NOT_FOUND, "Checklist item not found");
      }
      const progressId = crypto.randomUUID();
      const [update] = await tx
        .insert(progressUpdates)
        .values({
          id: progressId,
          projectId,
          note: input.note,
          checklistItemId: input.checklistItemId ?? null,
          createdBy: actor.userId,
        })
        .returning({ id: progressUpdates.id, createdAt: progressUpdates.createdAt });
      if (!update) throw new Error("Progress insert returned no row");

      const photoRows = await tx
        .insert(progressPhotos)
        .values(
          stored.photos.map((photo) => ({
            id: crypto.randomUUID(),
            projectId,
            progressId,
            mime: photo.mime,
            sizeBytes: photo.sizeBytes,
            takenOn,
            storageKey: photo.storageKey,
          })),
        )
        .returning({
          id: progressPhotos.id,
          mime: progressPhotos.mime,
          sizeBytes: progressPhotos.sizeBytes,
          takenOn: progressPhotos.takenOn,
        });

      await recordAudit(tx, {
        projectId,
        actorId: actor.userId,
        action: "created",
        entity: "progress",
        entityId: progressId,
      });

      return finish(
        tx,
        ProgressResponse.parse({
          id: update.id,
          note: input.note,
          checklistItemId: input.checklistItemId ?? null,
          createdAt: update.createdAt.toISOString(),
          photos: photoRows.map((photo) => publicPhoto(projectId, photo)),
        }),
      );
    });
  } catch (error) {
    try {
      await stored.cleanup();
    } catch {
      console.error("[api] unable to clean staged progress photos after a failed database write");
    }
    throw error;
  }
}

export function createProgressUpdate(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateProgressInput,
) {
  return writeProgressWithPhotos(db, actor, projectId, input, async (_tx, progress) => progress);
}

export async function getProjectTimeline(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Timeline> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId);
    const updates = await tx
      .select({
        id: progressUpdates.id,
        note: progressUpdates.note,
        checklistItemId: progressUpdates.checklistItemId,
        createdAt: progressUpdates.createdAt,
      })
      .from(progressUpdates)
      .where(eq(progressUpdates.projectId, projectId))
      .orderBy(desc(progressUpdates.createdAt), desc(progressUpdates.id));

    const photos = updates.length
      ? await tx
          .select({
            id: progressPhotos.id,
            progressId: progressPhotos.progressId,
            mime: progressPhotos.mime,
            sizeBytes: progressPhotos.sizeBytes,
            takenOn: progressPhotos.takenOn,
          })
          .from(progressPhotos)
          .where(
            and(
              eq(progressPhotos.projectId, projectId),
              inArray(
                progressPhotos.progressId,
                updates.map(({ id }) => id),
              ),
            ),
          )
          .orderBy(progressPhotos.progressId, progressPhotos.id)
      : [];
    const photosByProgress = new Map<string, typeof photos>();
    for (const photo of photos) {
      const current = photosByProgress.get(photo.progressId) ?? [];
      current.push(photo);
      photosByProgress.set(photo.progressId, current);
    }

    const groups = new Map<string, { date: string; updates: Progress[] }>();
    for (const update of updates) {
      const date = istDate(update.createdAt);
      const group = groups.get(date) ?? { date, updates: [] };
      group.updates.push(
        ProgressResponse.parse({
          id: update.id,
          note: update.note,
          checklistItemId: update.checklistItemId,
          createdAt: update.createdAt.toISOString(),
          photos: (photosByProgress.get(update.id) ?? []).map((photo) =>
            publicPhoto(projectId, photo),
          ),
        }),
      );
      groups.set(date, group);
    }
    return TimelineResponse.parse([...groups.values()]);
  });
}

export async function getProjectPhoto(db: Db, actor: Actor, projectId: string, photoId: string) {
  const photo = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId);
    const [row] = await tx
      .select({
        id: progressPhotos.id,
        mime: progressPhotos.mime,
        sizeBytes: progressPhotos.sizeBytes,
        storageKey: progressPhotos.storageKey,
      })
      .from(progressPhotos)
      .where(and(eq(progressPhotos.projectId, projectId), eq(progressPhotos.id, photoId)));
    return row;
  });
  if (!photo) throw new ApiError(404, ErrorCode.NOT_FOUND, "Photo not found");
  const bytes = await readStoredPhoto(photo.storageKey);
  if (!bytes) throw new ApiError(404, ErrorCode.NOT_FOUND, "Photo not found");
  if (bytes.byteLength !== photo.sizeBytes)
    throw new Error("Stored photo size does not match metadata");
  return { id: photo.id, mime: PhotoMime.parse(photo.mime), bytes };
}
