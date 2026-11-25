import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import {
  adjustments,
  attendance,
  changeRequestEvents,
  changeRequests,
  checklistEvents,
  checklistItems,
  checklistRecords,
} from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import {
  ChangeRequest,
  type ChangeRequestEvent,
  type ChangeRequestStatus,
  type ChangeRequestsQuery,
  CreateChangeRequestInput,
  type DecideChangeRequestInput,
  type MedicalExpenseFields,
  type ReopenChangeRequestInput,
  type VoteChangeRequestInput,
} from "@/shared/schemas/change-requests";
import { ChecklistChangeReason } from "@/shared/schemas/checklist";
import type { Role } from "@/shared/schemas/common";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { applyAdjustment } from "./adjustments";
import { recordAudit } from "./audit";
import { captureTimes } from "./capture-times";
import { applyChecklistAdd, applyChecklistEdit } from "./checklists";
import {
  insertMedicalClaim,
  medicalClaimView,
  reimburseMedicalClaim,
  requireClaimWorker,
} from "./medical-claims";
import { persistValidatedPhotos, validateImageUpload } from "./photo-storage";
import { requireProjectAccess } from "./projects";

type Row = typeof changeRequests.$inferSelect;
type Event = typeof changeRequestEvents.$inferSelect;
const conflict = (message: string) => new ApiError(409, ErrorCode.CONFLICT, message);
const forbidden = () =>
  new ApiError(403, ErrorCode.FORBIDDEN, "Your role cannot perform this operation");
const notFound = () => new ApiError(404, ErrorCode.NOT_FOUND, "Change request or target not found");
const sensitiveKinds = ["attendance_fix", "medical_expense"];

async function present(tx: Transaction, row: Row, events: Event[]) {
  const medical =
    row.kind === "medical_expense" ? await medicalClaimView(tx, row.projectId, row.id) : null;
  return ChangeRequest.parse({
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    ...(row.targetId !== null && { targetId: row.targetId }),
    payload: row.payload,
    ...medical,
    authorId: row.authorId,
    authorRole: row.authorRole,
    status: row.status,
    events: events.map((event) => ({
      kind: event.kind,
      byUserId: event.actorId,
      role: event.actorRole,
      note: event.note,
      at: event.createdAt.toISOString(),
    })),
  });
}

async function history(tx: Transaction, projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, Event[]>();
  const rows = await tx
    .select()
    .from(changeRequestEvents)
    .where(
      and(
        eq(changeRequestEvents.projectId, projectId),
        inArray(changeRequestEvents.requestId, ids),
      ),
    )
    .orderBy(asc(changeRequestEvents.sequence));
  const grouped = new Map<string, Event[]>();
  for (const row of rows) {
    const events = grouped.get(row.requestId) ?? [];
    events.push(row);
    grouped.set(row.requestId, events);
  }
  return grouped;
}

async function append(
  tx: Transaction,
  row: Row,
  actor: Actor,
  role: Role,
  kind: ChangeRequestEvent["kind"],
  note: string,
) {
  await tx.insert(changeRequestEvents).values({
    projectId: row.projectId,
    requestId: row.id,
    actorId: actor.userId,
    actorRole: role,
    kind,
    note,
  });
  await recordAudit(tx, {
    projectId: row.projectId,
    actorId: actor.userId,
    action: kind,
    entity: "changeRequest",
    entityId: row.id,
  });
  return present(tx, row, (await history(tx, row.projectId, [row.id])).get(row.id) ?? []);
}

export async function createMedicalExpense(
  db: Db,
  actor: Actor,
  projectId: string,
  input: MedicalExpenseFields,
  files: File[],
  captures: string[],
  receivedAt: Date,
) {
  await requireProjectAccess(db, actor, projectId, ["engineer", "contractor"]);
  const taken = captureTimes(captures, files.length, receivedAt);
  const validated = [];
  for (const file of files) validated.push(await validateImageUpload(file));
  const stored = await persistValidatedPhotos(validated);
  try {
    return await db.transaction(async (tx) => {
      const { role } = await requireProjectAccess(tx, actor, projectId, ["engineer", "contractor"]);
      await requireClaimWorker(tx, projectId, input.workerId);
      const [row] = await tx
        .insert(changeRequests)
        .values({
          id: crypto.randomUUID(),
          projectId,
          kind: "medical_expense",
          payload: {},
          authorId: actor.userId,
          authorRole: role,
          status: role === "engineer" ? "pending_contractor" : "pending_owner",
        })
        .returning();
      await insertMedicalClaim(tx, projectId, row.id, input, stored.photos, taken, receivedAt);
      return append(tx, row, actor, role, "created", input.note);
    });
  } catch (error) {
    await stored.cleanup();
    throw error;
  }
}

export async function attendanceChangeState(tx: Transaction, projectId: string, id: string) {
  const [target] = await tx
    .select({ halfDays: attendance.halfDays })
    .from(attendance)
    .where(and(eq(attendance.projectId, projectId), eq(attendance.id, id)))
    .for("update");
  if (!target) throw notFound();
  const [lastAdjustment] = await tx
    .select({ value: adjustments.newValue, sequence: adjustments.sequenceNo })
    .from(adjustments)
    .where(
      and(
        eq(adjustments.projectId, projectId),
        eq(adjustments.targetTable, "attendance"),
        eq(adjustments.targetId, id),
      ),
    )
    .orderBy(desc(adjustments.sequenceNo))
    .limit(1);
  const [lastApproval] = await tx
    .select({ payload: changeRequests.payload, sequence: changeRequestEvents.sequence })
    .from(changeRequests)
    .innerJoin(
      changeRequestEvents,
      and(
        eq(changeRequestEvents.projectId, projectId),
        eq(changeRequestEvents.requestId, changeRequests.id),
        eq(changeRequestEvents.kind, "owner_accepted"),
      ),
    )
    .where(
      and(
        eq(changeRequests.projectId, projectId),
        eq(changeRequests.kind, "attendance_fix"),
        eq(changeRequests.targetId, id),
      ),
    )
    .orderBy(desc(changeRequestEvents.sequence))
    .limit(1);
  return {
    actual: lastAdjustment ? Number(lastAdjustment.value) : target.halfDays,
    payFullDay:
      (lastApproval?.payload as { payFullDay?: boolean } | undefined)?.payFullDay === true,
    version: `${lastAdjustment?.sequence ?? 0}:${lastApproval?.sequence ?? 0}`,
  };
}

async function targetVersion(tx: Transaction, projectId: string, input: CreateChangeRequestInput) {
  if (input.kind === "attendance_fix") {
    const current = await attendanceChangeState(tx, projectId, input.targetId);
    if (
      current.actual === input.payload.newValue &&
      current.payFullDay === input.payload.payFullDay
    ) {
      throw conflict("This change does not alter attendance or paid entitlement");
    }
    return current.version;
  }
  if (input.kind === "checklist_add") {
    const [record] = await tx
      .select({ id: checklistRecords.id })
      .from(checklistRecords)
      .where(
        and(
          eq(checklistRecords.projectId, projectId),
          eq(checklistRecords.id, input.payload.checklistId),
        ),
      );
    if (!record) throw notFound();
    return null;
  }
  const [item] = await tx
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.projectId, projectId), eq(checklistItems.id, input.targetId)))
    .for("update");
  if (!item) throw notFound();
  if (item.removedAt || item.state === "waiting")
    throw conflict("Item is removed or awaiting proof review");
  if (input.kind === "checklist_rename" && input.payload.task === item.task)
    throw conflict("Item already has this name");
  const [event] = await tx
    .select({ sequence: checklistEvents.sequence })
    .from(checklistEvents)
    .where(and(eq(checklistEvents.projectId, projectId), eq(checklistEvents.itemId, item.id)))
    .orderBy(desc(checklistEvents.sequence))
    .limit(1);
  return String(event?.sequence ?? 0);
}

export async function createChangeRequest(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateChangeRequestInput,
) {
  return db.transaction(async (tx) => {
    const { role } = await requireProjectAccess(tx, actor, projectId);
    if (role !== "engineer" && !(role === "contractor" && input.kind === "attendance_fix"))
      throw forbidden();
    const reason = ChecklistChangeReason.safeParse(input.note);
    if (!reason.success)
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Change reason must be at least ten characters",
      );
    const version = await targetVersion(tx, projectId, input);
    const [row] = await tx
      .insert(changeRequests)
      .values({
        id: crypto.randomUUID(),
        projectId,
        kind: input.kind,
        payload: input.payload,
        targetId: "targetId" in input ? input.targetId : null,
        targetVersion: version,
        authorId: actor.userId,
        authorRole: role,
        status: role === "engineer" ? "pending_contractor" : "pending_owner",
      })
      .returning();
    return append(tx, row, actor, role, "created", reason.data);
  });
}

export async function listChangeRequests(
  db: Db,
  actor: Actor,
  projectId: string,
  query: ChangeRequestsQuery,
) {
  return db.transaction(
    async (tx) => {
      const { role } = await requireProjectAccess(tx, actor, projectId);
      const rows = await tx
        .select()
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.projectId, projectId),
            query.status ? eq(changeRequests.status, query.status) : undefined,
            role === "engineer"
              ? or(
                  eq(changeRequests.authorId, actor.userId),
                  inArray(changeRequests.kind, [
                    "checklist_add",
                    "checklist_rename",
                    "checklist_remove",
                  ]),
                )
              : undefined,
          ),
        )
        .orderBy(desc(changeRequests.createdAt), desc(changeRequests.id));
      const grouped = await history(
        tx,
        projectId,
        rows.map(({ id }) => id),
      );
      return Promise.all(rows.map((row) => present(tx, row, grouped.get(row.id) ?? [])));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function lock(tx: Transaction, actor: Actor, id: string) {
  const [row] = await tx
    .select()
    .from(changeRequests)
    .where(eq(changeRequests.id, id))
    .for("update");
  if (!row) throw notFound();
  const { role } = await requireProjectAccess(tx, actor, row.projectId);
  if (role === "engineer" && row.authorId !== actor.userId && sensitiveKinds.includes(row.kind))
    throw notFound();
  return { row, role };
}

async function transition(
  tx: Transaction,
  row: Row,
  actor: Actor,
  role: Role,
  status: ChangeRequestStatus,
  kind: ChangeRequestEvent["kind"],
  note: string,
) {
  const [updated] = await tx
    .update(changeRequests)
    .set({ status })
    .where(and(eq(changeRequests.id, row.id), eq(changeRequests.status, row.status)))
    .returning();
  if (!updated) throw conflict("Change request has already advanced");
  return append(tx, updated, actor, role, kind, note);
}

export async function voteChangeRequest(
  db: Db,
  actor: Actor,
  id: string,
  input: VoteChangeRequestInput,
) {
  return db.transaction(async (tx) => {
    const { row, role } = await lock(tx, actor, id);
    if (role !== "contractor") throw forbidden();
    if (row.status !== "pending_contractor") throw conflict("A contractor vote is not pending");
    return transition(
      tx,
      row,
      actor,
      role,
      input.approve ? "pending_owner" : "rejected_contractor",
      input.approve ? "contractor_approved" : "contractor_rejected",
      input.note,
    );
  });
}

export async function reopenChangeRequest(
  db: Db,
  actor: Actor,
  id: string,
  input: ReopenChangeRequestInput,
) {
  return db.transaction(async (tx) => {
    const { row, role } = await lock(tx, actor, id);
    if (row.authorId !== actor.userId) throw forbidden();
    if (row.status !== "rejected_contractor")
      throw conflict("Only a contractor rejection can be reopened");
    return transition(tx, row, actor, role, "pending_contractor", "reopened", input.note);
  });
}

export async function decideChangeRequest(
  db: Db,
  actor: Actor,
  id: string,
  decision: DecideChangeRequestInput,
) {
  return db.transaction(async (tx) => {
    const { row, role } = await lock(tx, actor, id);
    if (role !== "owner") throw forbidden();
    if (row.status !== "pending_owner") throw conflict("An owner decision is not pending");
    if (!decision.accept)
      return transition(tx, row, actor, role, "rejected_owner", "owner_rejected", decision.note);
    if (row.kind === "medical_expense") {
      await reimburseMedicalClaim(tx, actor, row.projectId, row.id, decision.payPaise);
      return transition(tx, row, actor, role, "accepted", "owner_accepted", decision.note);
    }
    if (decision.payPaise !== undefined)
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Only a medical expense takes a reimbursement amount",
      );
    const events = (await history(tx, row.projectId, [id])).get(id) ?? [];
    const input = CreateChangeRequestInput.parse({
      kind: row.kind,
      payload: row.payload,
      note: events[0]?.note,
      ...(row.targetId !== null && { targetId: row.targetId }),
    });
    if ((await targetVersion(tx, row.projectId, input)) !== row.targetVersion)
      throw conflict("Target changed after submission");
    const { projectId } = row;
    if (input.kind === "checklist_add") {
      await applyChecklistAdd(tx, actor, projectId, { ...input.payload, reason: input.note });
    } else if (input.kind === "checklist_rename") {
      await applyChecklistEdit(
        tx,
        actor,
        projectId,
        input.targetId,
        input.note,
        input.payload.task,
      );
    } else if (input.kind === "checklist_remove") {
      await applyChecklistEdit(tx, actor, projectId, input.targetId, input.note);
    } else {
      const current = await attendanceChangeState(tx, projectId, input.targetId);
      if (current.actual !== input.payload.newValue)
        await applyAdjustment(tx, actor, projectId, {
          targetTable: "attendance",
          targetId: input.targetId,
          newValue: input.payload.newValue,
          reason: input.note,
        });
    }
    return transition(tx, row, actor, role, "accepted", "owner_accepted", decision.note);
  });
}
