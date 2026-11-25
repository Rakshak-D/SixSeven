/**
 * Development fixtures for photo progress and the task workflow: contractor starts a task and
 * submits proof, engineer adds, renames or removes items. They refuse what the API refuses.
 */
import { todayIst } from "@/lib/dates";
import {
  AddChecklistItemInput,
  RemoveChecklistItemInput,
  RenameChecklistItemInput,
  VerifiedChecklistItemResponse,
} from "@/shared/schemas/checklist";
import { CreateProgressInput, ProgressResponse } from "@/shared/schemas/progress";
import { allow, findChecklistItem, world } from "./routes";
import { MockError, type MockRoute, mockId, parseBody } from "./types";
import { type DemoWorld, demoPeople } from "./world";

const nextId = (w: DemoWorld, prefix: string) => mockId(w.projectId, prefix);

/** A multipart body as the API sees it: a note, an optional task link and repeated photos. */
function progressBody(body: unknown) {
  if (!(body instanceof FormData)) throw new MockError(400, "VALIDATION_ERROR", "Send a form");
  const link = body.get("checklistItemId");
  return {
    note: body.get("note") ?? undefined,
    photos: body.getAll("photos").filter((f): f is File => f instanceof File),
    ...(typeof link === "string" && link ? { checklistItemId: link } : {}),
  };
}

function addProgress(
  w: DemoWorld,
  input: ReturnType<typeof progressBody>,
  role: "contractor" | "engineer",
) {
  const checked = parseBody(CreateProgressInput, input);
  const id = nextId(w, "pg");
  const createdAt = new Date().toISOString();
  const progress = ProgressResponse.parse({
    id,
    note: checked.note,
    checklistItemId: checked.checklistItemId ?? null,
    createdAt,
    photos: checked.photos.map((file, i) => ({
      id: `${id}-ph${i + 1}`,
      mime: file.type,
      sizeBytes: file.size,
      takenOn: todayIst(),
      // Demo uploads are not stored, so this URL has no file behind it.
      url: `/api/v1/projects/${w.projectId}/photos/${id}-ph${i + 1}`,
    })),
  });
  w.progress.unshift(progress);
  w.activity.unshift({
    id: `${id}-a`,
    actor: demoPeople[role],
    action: "created",
    entity: "progress",
    entityId: id,
    createdAt,
  });
  return progress;
}

function pushEvent(
  item: DemoWorld["checklists"][number]["items"][number],
  kind: DemoWorld["checklists"][number]["items"][number]["history"][number]["kind"],
  actorId: string,
  extra: { note?: string; previous?: string; next?: string; progressId?: string } = {},
) {
  item.history.push({
    id: `${item.id}-ev${item.history.length + 1}`,
    kind,
    actorId,
    createdAt: new Date().toISOString(),
    note: extra.note ?? null,
    previous: extra.previous ?? null,
    next: extra.next ?? null,
    progressId: extra.progressId ?? null,
  });
}

export const checklistRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/projects/:id/progress",
    respond: ({ params, body }) => {
      const role = allow(params.id, ["contractor", "engineer"]);
      return addProgress(world(params.id), progressBody(body), role);
    },
  },
  {
    method: "POST",
    path: "/checklist-items/:id/start",
    respond: ({ params }) => {
      const { w, item, projectId } = findChecklistItem(params.id);
      allow(projectId, ["contractor"]);
      if (item.removedAt || item.verificationStatus !== "todo") {
        throw new MockError(409, "CONFLICT", "This task can't be started now");
      }
      item.verificationStatus = "doing";
      item.status = "inProgress";
      pushEvent(item, "started", demoPeople.contractor.id);
      w.activity.unshift({
        id: `${item.id}-s${Date.now()}`,
        actor: demoPeople.contractor,
        action: "updated",
        entity: "checklistItem",
        entityId: item.id,
        createdAt: new Date().toISOString(),
      });
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
  {
    method: "POST",
    path: "/checklist-items/:id/completion",
    respond: ({ params, body }) => {
      const { w, item, projectId } = findChecklistItem(params.id);
      allow(projectId, ["contractor"]);
      if (item.removedAt || !["doing", "sent_back"].includes(item.verificationStatus)) {
        throw new MockError(409, "CONFLICT", "Start the task before sending proof");
      }
      const progress = addProgress(
        w,
        { ...progressBody(body), checklistItemId: item.id },
        "contractor",
      );
      item.verificationStatus = "waiting";
      pushEvent(item, "submitted", demoPeople.contractor.id, {
        note: progress.note,
        progressId: progress.id,
      });
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
  {
    method: "POST",
    path: "/projects/:id/checklist-items",
    respond: ({ params, body }) => {
      allow(params.id, ["engineer"]);
      const w = world(params.id);
      const input = parseBody(AddChecklistItemInput, body);
      const list = w.checklists.find((c) => c.id === input.checklistId);
      if (!list) throw new MockError(404, "NOT_FOUND", "Checklist not found");
      if (list.items.length >= 40) {
        throw new MockError(409, "CONFLICT", "A checklist holds at most 40 items");
      }
      const item = {
        id: nextId(w, "ci"),
        phase: input.phase,
        task: input.task,
        materials: input.materials,
        status: "pending" as const,
        verificationStatus: "todo" as const,
        removedAt: null,
        history: [],
      };
      list.items.push(item);
      pushEvent(item, "added", demoPeople.engineer.id, { note: input.reason, next: input.task });
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
  {
    method: "PATCH",
    path: "/checklist-items/:id",
    respond: ({ params, body }) => {
      const { item, projectId } = findChecklistItem(params.id);
      allow(projectId, ["engineer"]);
      const input = parseBody(RenameChecklistItemInput, body);
      if (item.removedAt || item.verificationStatus === "waiting") {
        throw new MockError(409, "CONFLICT", "This task can't be renamed now");
      }
      if (item.task === input.task)
        throw new MockError(409, "CONFLICT", "That is already the name");
      pushEvent(item, "renamed", demoPeople.engineer.id, {
        note: input.reason,
        previous: item.task,
        next: input.task,
      });
      item.task = input.task;
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
  {
    method: "DELETE",
    path: "/checklist-items/:id",
    respond: ({ params, body }) => {
      const { item, projectId } = findChecklistItem(params.id);
      allow(projectId, ["engineer"]);
      const input = parseBody(RemoveChecklistItemInput, body);
      if (item.removedAt || item.verificationStatus === "waiting") {
        throw new MockError(409, "CONFLICT", "This task can't be removed now");
      }
      item.removedAt = new Date().toISOString();
      pushEvent(item, "removed", demoPeople.engineer.id, {
        note: input.reason,
        previous: item.task,
      });
      return VerifiedChecklistItemResponse.parse(item);
    },
  },
];
