import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db, Transaction } from "@/db/client";
import { checklistDrafts, checklistEvents, checklistItems, checklistRecords } from "@/db/schema";
import { generateAiChecklist } from "@/server/ai/checklist";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import {
  type AddChecklistItemInput,
  ChecklistDraft,
  type ChecklistSource,
  type ReviewChecklistItemInput,
  type SaveChecklistInput,
  VerifiedChecklistItemResponse,
} from "@/shared/schemas/checklist";
import { recordAudit } from "./audit";
import { writeProgressWithPhotos } from "./progress";
import { requireProjectAccess } from "./projects";

type Item = typeof checklistItems.$inferSelect;
type Event = typeof checklistEvents.$inferInsert;
type Role = "contractor" | "engineer";

const template = ChecklistDraft.parse({
  items: [
    { phase: "foundation", task: "Check footing layout before work begins", materials: [] },
    { phase: "plinth", task: "Record plinth level and damp-proof course", materials: [] },
    { phase: "walls", task: "Check wall alignment and openings", materials: [] },
    { phase: "slab", task: "Record slab inspection before the pour", materials: [] },
    { phase: "plumbing", task: "Record plumbing pressure test", materials: [] },
    { phase: "electrical", task: "Check conduit routes against the plan", materials: [] },
    { phase: "plaster", task: "Inspect plaster finish and curing", materials: [] },
    { phase: "flooring", task: "Check floor levels and finish", materials: [] },
    { phase: "finishing", task: "Record final snag list", materials: [] },
  ],
});

const notFound = () => new ApiError(404, ErrorCode.NOT_FOUND, "Checklist resource not found");
const conflict = (message: string) => new ApiError(409, ErrorCode.CONFLICT, message);

export async function generateDraft(
  db: Db,
  actor: Actor,
  projectId: string,
  source: z.infer<typeof ChecklistSource>,
  input?: { houseType?: string; floors?: number; rooms?: number },
) {
  await requireProjectAccess(db, actor, projectId, ["engineer"]);
  const draftId = crypto.randomUUID();
  await db.insert(checklistDrafts).values({ id: draftId, projectId, createdBy: actor.userId });

  if (source === "ai") {
    const aiResult = await generateAiChecklist({
      houseType: input?.houseType,
      floors: input?.floors,
      rooms: input?.rooms,
    });
    if (aiResult?.source === "ai" && aiResult.draft.items.length > 0) {
      return {
        draftId,
        source: "ai" as const,
        fallbackReason: null,
        draft: aiResult.draft,
      };
    }
  }

  return {
    draftId,
    source: "template" as const,
    fallbackReason: source === "ai" ? ("unavailable" as const) : null,
    draft: template,
  };
}
function serializeItem(item: Item, history: (typeof checklistEvents.$inferSelect)[]) {
  const { id, phase, task, materials, state, removedAt } = item;
  const status = state === "todo" ? "pending" : state === "done" ? "done" : "inProgress";
  return VerifiedChecklistItemResponse.parse({
    id,
    phase,
    task,
    materials,
    status,
    verificationStatus: state,
    removedAt: removedAt?.toISOString() ?? null,
    history: history.map(({ id, kind, actorId, createdAt, note, previous, next, progressId }) => ({
      id,
      kind,
      actorId,
      createdAt: createdAt.toISOString(),
      note,
      previous,
      next,
      progressId,
    })),
  });
}

async function itemWithHistory(tx: Transaction, item: Item) {
  const history = await tx
    .select()
    .from(checklistEvents)
    .where(and(eq(checklistEvents.projectId, item.projectId), eq(checklistEvents.itemId, item.id)))
    .orderBy(asc(checklistEvents.sequence));
  return serializeItem(item, history);
}

function serializeRecord(
  record: typeof checklistRecords.$inferSelect,
  items: ReturnType<typeof serializeItem>[],
) {
  return {
    id: record.id,
    title: record.title,
    source: "template" as const,
    createdAt: record.createdAt.toISOString(),
    items,
  };
}

export async function saveChecklist(
  db: Db,
  actor: Actor,
  projectId: string,
  input: SaveChecklistInput,
) {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["engineer"]);
    const [draft] = await tx
      .select()
      .from(checklistDrafts)
      .where(
        and(
          eq(checklistDrafts.id, input.draftId),
          eq(checklistDrafts.projectId, projectId),
          eq(checklistDrafts.createdBy, actor.userId),
        ),
      );
    if (!draft) throw notFound();
    const id = crypto.randomUUID();
    const [record] = await tx
      .insert(checklistRecords)
      .values({
        id,
        projectId,
        draftId: draft.id,
        title: input.title,
        createdBy: actor.userId,
      })
      .onConflictDoNothing({ target: checklistRecords.draftId })
      .returning();
    if (!record) throw conflict("Checklist draft has already been saved");
    const items = await tx
      .insert(checklistItems)
      .values(
        input.items.map((item, position) => ({
          ...item,
          position,
          projectId,
          checklistId: id,
          id: crypto.randomUUID(),
        })),
      )
      .returning();
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "checklist",
      entityId: id,
    });
    return serializeRecord(
      record,
      items.sort((a, b) => a.position - b.position).map((item) => serializeItem(item, [])),
    );
  });
}

export async function listChecklists(db: Db, actor: Actor, projectId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId);
    const records = await tx
      .select()
      .from(checklistRecords)
      .where(eq(checklistRecords.projectId, projectId))
      .orderBy(desc(checklistRecords.createdAt), desc(checklistRecords.id));
    const items = await tx
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.projectId, projectId))
      .orderBy(asc(checklistItems.position));
    const events = await tx
      .select()
      .from(checklistEvents)
      .where(eq(checklistEvents.projectId, projectId))
      .orderBy(asc(checklistEvents.sequence));
    const histories = Map.groupBy(events, (event) => event.itemId);
    const byRecord = Map.groupBy(items, (item) => item.checklistId);
    return records.map((record) =>
      serializeRecord(
        record,
        (byRecord.get(record.id) ?? []).map((item) =>
          serializeItem(item, histories.get(item.id) ?? []),
        ),
      ),
    );
  });
}

export async function accessItem(db: Db | Transaction, actor: Actor, id: string, role: Role) {
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id));
  if (!item) throw notFound();
  await requireProjectAccess(db, actor, item.projectId, [role]);
  return item;
}

async function appendEvent(
  tx: Transaction,
  actor: Actor,
  item: Item,
  data: Pick<Event, "kind" | "note" | "previous" | "next" | "progressId">,
) {
  const { projectId, id } = item;
  await tx
    .insert(checklistEvents)
    .values({ ...data, id: crypto.randomUUID(), projectId, itemId: id, actorId: actor.userId });
  const action =
    data.kind === "added"
      ? "created"
      : data.kind === "accepted"
        ? "approved"
        : data.kind === "sent_back"
          ? "rejected"
          : "updated";
  await recordAudit(tx, {
    projectId,
    actorId: actor.userId,
    action,
    entity: "checklistItem",
    entityId: id,
  });
  return itemWithHistory(tx, item);
}

async function transition(
  tx: Transaction,
  actor: Actor,
  item: Item,
  from: Item["state"][],
  next: Item["state"],
  data: Pick<Event, "kind" | "note" | "progressId">,
) {
  const [updated] = await tx
    .update(checklistItems)
    .set({ state: next })
    .where(
      and(
        eq(checklistItems.id, item.id),
        eq(checklistItems.projectId, item.projectId),
        eq(checklistItems.state, item.state),
        inArray(checklistItems.state, from),
        isNull(checklistItems.removedAt),
      ),
    )
    .returning();
  if (!updated) throw conflict("Checklist item is not in the required state");
  return appendEvent(tx, actor, updated, { ...data, previous: item.state, next });
}

export function startItem(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) =>
    transition(tx, actor, await accessItem(tx, actor, id, "contractor"), ["todo"], "doing", {
      kind: "started",
    }),
  );
}

export async function submitItem(
  db: Db,
  actor: Actor,
  id: string,
  note: string,
  photos: File[],
  capturedAt: string[],
) {
  const item = await accessItem(db, actor, id, "contractor");
  if (item.removedAt || !["doing", "sent_back"].includes(item.state))
    throw conflict("Checklist item is not ready for submission");
  return writeProgressWithPhotos(
    db,
    actor,
    item.projectId,
    { note, photos, capturedAt, checklistItemId: id },
    async (tx, progress) => {
      const current = await accessItem(tx, actor, id, "contractor");
      return transition(tx, actor, current, ["doing", "sent_back"], "waiting", {
        kind: "submitted",
        note: progress.note,
        progressId: progress.id,
      });
    },
  );
}

export function reviewItem(
  db: Db,
  actor: Actor,
  id: string,
  input: z.infer<typeof ReviewChecklistItemInput>,
) {
  return db.transaction(async (tx) => {
    const item = await accessItem(tx, actor, id, "engineer");
    const [locked] = await tx
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.id, item.id))
      .for("update");
    if (!locked) throw notFound();
    const [submission] = await tx
      .select({ progressId: checklistEvents.progressId })
      .from(checklistEvents)
      .where(and(eq(checklistEvents.itemId, id), eq(checklistEvents.kind, "submitted")))
      .orderBy(desc(checklistEvents.sequence))
      .limit(1);
    if (submission?.progressId !== input.progressId)
      throw conflict("Review must identify the current submission");
    const accepted = input.decision === "accept";
    return transition(tx, actor, locked, ["waiting"], accepted ? "done" : "sent_back", {
      kind: accepted ? "accepted" : "sent_back",
      note: input.note,
    });
  });
}

export async function applyChecklistAdd(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  input: z.infer<typeof AddChecklistItemInput>,
) {
  const [record] = await tx
    .select({ id: checklistRecords.id })
    .from(checklistRecords)
    .where(
      and(eq(checklistRecords.projectId, projectId), eq(checklistRecords.id, input.checklistId)),
    )
    .for("update");
  if (!record) throw notFound();
  const [last] = await tx
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, record.id))
    .orderBy(desc(checklistItems.position))
    .limit(1);
  const position = (last?.position ?? -1) + 1;
  if (position >= 40) throw conflict("Checklist already has forty historical items");
  const { phase, task, materials, reason } = input;
  const [item] = await tx
    .insert(checklistItems)
    .values({
      id: crypto.randomUUID(),
      projectId,
      checklistId: record.id,
      position,
      phase,
      task,
      materials,
    })
    .returning();
  if (!item) throw new Error("Checklist item insert did not return a row");
  return appendEvent(tx, actor, item, { kind: "added", note: reason, next: task });
}

export async function applyChecklistEdit(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  id: string,
  reason: string,
  task?: string,
) {
  const [current] = await tx
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, id), eq(checklistItems.projectId, projectId)))
    .for("update");
  if (!current || current.removedAt || current.state === "waiting")
    throw conflict("Checklist item is removed or awaiting review");
  if (task === current.task) throw conflict("Checklist item already has that name");
  const [updated] = await tx
    .update(checklistItems)
    .set(task === undefined ? { removedAt: new Date() } : { task })
    .where(and(eq(checklistItems.id, id), eq(checklistItems.projectId, projectId)))
    .returning();
  if (!updated) throw notFound();
  return appendEvent(tx, actor, updated, {
    kind: task === undefined ? "removed" : "renamed",
    note: reason,
    previous: current.task,
    next: task,
  });
}
