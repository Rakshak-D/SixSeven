/**
 * Development fixtures for the approval chain (src/shared/schemas/change-requests.ts, requests 20
 * and 23). The live routes are not built yet. Nothing changes until the owner accepts, every step
 * needs a note and is only ever appended.
 */
import { todayIst } from "@/lib/dates";
import { AttendanceRosterResponse } from "@/shared/schemas/attendance";
import {
  ChangeRequest,
  ChangeRequestResponse,
  ChangeRequestsResponse,
  CreateChangeRequestInput,
  DecideChangeRequestInput,
  MedicalExpenseFields,
  ReopenChangeRequestInput,
  VoteChangeRequestInput,
} from "@/shared/schemas/change-requests";
import type { Role } from "@/shared/schemas/common";
import { PhotoFile } from "@/shared/schemas/progress";
import { allow, findChecklistItem, world } from "./routes";
import { MockError, type MockRoute, mockId, parseBody } from "./types";
import { type DemoWorld, demoPeople } from "./world";

const now = () => new Date().toISOString();
const conflict = (message: string) => new MockError(409, "CONFLICT", message);
const anyone: Role[] = ["owner", "contractor", "engineer"];

function event(kind: ChangeRequest["events"][number]["kind"], role: Role, note: string) {
  return { kind, role, note, byUserId: demoPeople[role].id, at: now() };
}

/** Finds a request in whichever demo project holds it, and the caller's role there. */
function find(requestId: string, roles: Role[]) {
  const projectId = requestId.split("-cr")[0];
  const w = world(projectId);
  const request = w.changeRequests.find((r) => r.id === requestId);
  if (!request) throw new MockError(404, "NOT_FOUND", "Change request not found");
  return { w, request, role: allow(projectId, roles) };
}

type WithoutNote<T> = T extends unknown ? Omit<T, "note"> : never;
type Asked = WithoutNote<CreateChangeRequestInput>;

/** Checks the target exists and can still take this change. Used when asking and when accepting. */
function checkTarget(w: DemoWorld, input: Asked) {
  if (input.kind === "checklist_add") {
    const list = w.checklists.find((c) => c.id === input.payload.checklistId);
    if (!list) throw new MockError(404, "NOT_FOUND", "Checklist not found");
    if (list.items.length >= 40) throw conflict("A checklist holds at most 40 items");
  } else if (input.kind === "attendance_fix") {
    const row = w.attendance.find((a) => a.id === input.targetId);
    if (!row) throw new MockError(404, "NOT_FOUND", "Attendance entry not found");
    const { newValue, payFullDay } = input.payload;
    if (row.effectiveHalfDays === newValue && !payFullDay)
      throw conflict("That is already the value");
  } else {
    const { item } = findChecklistItem(input.targetId);
    if (item.removedAt || item.verificationStatus === "waiting")
      throw conflict("This task can't be changed now");
    if (input.kind === "checklist_rename" && item.task === input.payload.task)
      throw conflict("That is already the name");
  }
}

/** The one moment a record changes: the owner said yes. */
function apply(w: DemoWorld, r: ChangeRequest, note: string) {
  if (r.kind === "medical_expense") return;
  checkTarget(w, r);
  if (r.kind === "attendance_fix") {
    const row = w.attendance.find((a) => a.id === r.targetId);
    if (!row) return;
    const paid = r.payload.payFullDay ? 2 : r.payload.newValue;
    w.adjustments.push({
      id: mockId(w.projectId, "adj"),
      targetId: r.targetId,
      targetTable: "attendance",
      oldValue: row.effectiveHalfDays,
      newValue: paid,
      reason: `Approved by the owner: ${r.events[0].note}`,
      actorId: r.authorId,
      createdAt: now(),
    });
    row.effectiveHalfDays = paid;
    return;
  }
  const history = {
    actorId: r.authorId,
    createdAt: now(),
    note,
    previous: null as string | null,
    next: null as string | null,
    progressId: null,
  };
  if (r.kind === "checklist_add") {
    const id = mockId(w.projectId, "ci");
    w.checklists
      .find((c) => c.id === r.payload.checklistId)
      ?.items.push({
        id,
        phase: r.payload.phase,
        task: r.payload.task,
        materials: r.payload.materials,
        status: "pending",
        verificationStatus: "todo",
        removedAt: null,
        history: [{ ...history, id: `${id}-ev1`, kind: "added", next: r.payload.task }],
      });
    return;
  }
  const { item } = findChecklistItem(r.targetId);
  const entry = { ...history, id: `${item.id}-ev${item.history.length + 1}`, previous: item.task };
  if (r.kind === "checklist_rename") {
    item.history.push({ ...entry, kind: "renamed", next: r.payload.task });
    item.task = r.payload.task;
  } else {
    item.history.push({ ...entry, kind: "removed" });
    item.removedAt = now();
  }
}

function add(w: DemoWorld, role: "engineer" | "contractor", note: string, body: object) {
  const request = ChangeRequest.parse({
    ...body,
    id: mockId(w.projectId, "cr"),
    projectId: w.projectId,
    authorId: demoPeople[role].id,
    authorRole: role,
    status: role === "engineer" ? "pending_contractor" : "pending_owner",
    events: [event("created", role, note)],
  });
  w.changeRequests.unshift(request);
  return request;
}

export const changeRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/projects/:id/attendance/roster",
    respond: ({ params }) => {
      allow(params.id, anyone);
      const w = world(params.id);
      return AttendanceRosterResponse.parse(
        w.attendance.map((a) => ({
          id: a.id,
          workerId: a.workerId,
          workerName: w.workers.find((x) => x.id === a.workerId)?.name ?? "Worker",
          workDate: a.workDate,
          effectiveHalfDays: a.effectiveHalfDays,
        })),
      );
    },
  },
  {
    method: "GET",
    path: "/projects/:id/change-requests",
    respond: ({ params, query }) => {
      const role = allow(params.id, anyone);
      const wanted = query.get("status");
      return ChangeRequestsResponse.parse(
        world(params.id).changeRequests.filter(
          (r) =>
            (!wanted || r.status === wanted) &&
            // Medical records are private to the author, the contractor and the owner.
            (r.kind !== "medical_expense" || role !== "engineer" || r.authorRole === "engineer"),
        ),
      );
    },
  },
  {
    method: "POST",
    path: "/projects/:id/change-requests",
    respond: ({ params, body }) => {
      const input = parseBody(CreateChangeRequestInput, body);
      const role = allow(
        params.id,
        input.kind === "attendance_fix" ? ["engineer", "contractor"] : ["engineer"],
      ) as "engineer" | "contractor";
      const w = world(params.id);
      checkTarget(w, input);
      const target = "targetId" in input ? input.targetId : undefined;
      const waiting = w.changeRequests.some(
        (r) =>
          (r.status === "pending_contractor" || r.status === "pending_owner") &&
          "targetId" in r &&
          r.targetId === target,
      );
      if (target && waiting) throw conflict("A change to this is already waiting");
      const { note, ...rest } = input;
      return ChangeRequestResponse.parse(add(w, role, note, rest));
    },
  },
  {
    method: "POST",
    path: "/projects/:id/medical-expenses",
    respond: ({ params, body }) => {
      const role = allow(params.id, ["engineer", "contractor"]);
      if (!(body instanceof FormData)) throw new MockError(400, "VALIDATION_ERROR", "Send a form");
      const input = parseBody(MedicalExpenseFields, {
        workerId: body.get("workerId") ?? "",
        billPaise: Number(body.get("billPaise")),
        incidentOn: body.get("incidentOn") ?? "",
        note: body.get("note") ?? "",
      });
      const photos = body.getAll("billPhotos").map((f) => parseBody(PhotoFile, f));
      if (photos.length < 1 || photos.length > 3)
        throw new MockError(400, "VALIDATION_ERROR", "Add 1 to 3 photos of the bill");
      const w = world(params.id);
      if (!w.workers.some((x) => x.id === input.workerId))
        throw new MockError(404, "NOT_FOUND", "Worker not found");
      const { note, ...fields } = input;
      const stamp = mockId(w.projectId, "bill");
      return ChangeRequestResponse.parse(
        add(w, role, note, {
          kind: "medical_expense",
          payPaise: null,
          payload: {
            ...fields,
            billPhotos: photos.map((file, i) => ({
              id: `${stamp}-${i + 1}`,
              mime: file.type,
              sizeBytes: file.size,
              takenOn: todayIst(),
              // Demo uploads are not stored, so this URL has no file behind it.
              url: `/api/v1/projects/${w.projectId}/photos/${stamp}-${i + 1}`,
            })),
          },
        }),
      );
    },
  },
  {
    method: "POST",
    path: "/change-requests/:id/vote",
    respond: ({ params, body }) => {
      const { request } = find(params.id, ["contractor"]);
      const { approve, note } = parseBody(VoteChangeRequestInput, body);
      if (request.status !== "pending_contractor") throw conflict("This is not waiting for a vote");
      request.status = approve ? "pending_owner" : "rejected_contractor";
      request.events.push(
        event(approve ? "contractor_approved" : "contractor_rejected", "contractor", note),
      );
      return ChangeRequestResponse.parse(request);
    },
  },
  {
    method: "POST",
    path: "/change-requests/:id/reopen",
    respond: ({ params, body }) => {
      const { request, role } = find(params.id, ["engineer", "contractor"]);
      const { note } = parseBody(ReopenChangeRequestInput, body);
      if (request.authorId !== demoPeople[role].id)
        throw new MockError(403, "FORBIDDEN", "Only the person who asked can reopen it");
      if (request.status !== "rejected_contractor")
        throw conflict("Only a contractor's rejection can be reopened");
      request.status = "pending_contractor";
      request.events.push(event("reopened", role, note));
      return ChangeRequestResponse.parse(request);
    },
  },
  {
    method: "POST",
    path: "/change-requests/:id/decision",
    respond: ({ params, body }) => {
      const { w, request } = find(params.id, ["owner"]);
      const input = parseBody(DecideChangeRequestInput, body);
      if (request.status !== "pending_owner") throw conflict("This is not waiting for the owner");
      const pay = input.accept ? input.payPaise : undefined;
      if (request.kind === "medical_expense") {
        if (input.accept && (!pay || pay > request.payload.billPaise))
          throw new MockError(400, "VALIDATION_ERROR", "Pay between ₹0.01 and the bill amount");
        if (input.accept) request.payPaise = pay as number;
      } else if (pay !== undefined) {
        throw new MockError(400, "VALIDATION_ERROR", "Only a medical expense takes a payment");
      }
      if (input.accept) apply(w, request, input.note);
      request.status = input.accept ? "accepted" : "rejected_owner";
      request.events.push(
        event(input.accept ? "owner_accepted" : "owner_rejected", "owner", input.note),
      );
      return ChangeRequestResponse.parse(request);
    },
  },
];
