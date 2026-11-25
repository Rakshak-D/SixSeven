import { describe, expect, it } from "vitest";
import type { ChangeRequest } from "@/shared/schemas/change-requests";
import { changeRoutes } from "./change-routes";
import { demoRoutes, world } from "./routes";
import { MockError, type MockRoute } from "./types";
import { spendTotals } from "./world";
import { writeRoutes } from "./write-routes";

/**
 * Each demo project gives you one role, so a full chain across roles is driven by moving the
 * request into the next role's demo project, as one live project's members would see it.
 */
function call(method: MockRoute["method"], path: string, body?: unknown) {
  const parts = path.split("/");
  for (const route of [...demoRoutes, ...writeRoutes, ...changeRoutes]) {
    const pattern = route.path.split("/");
    if (route.method !== method || pattern.length !== parts.length) continue;
    if (!pattern.every((seg, i) => seg.startsWith(":") || seg === parts[i])) continue;
    const params = Object.fromEntries(
      pattern.flatMap((seg, i) => (seg.startsWith(":") ? [[seg.slice(1), parts[i]]] : [])),
    );
    return route.respond({ params, query: new URLSearchParams(), body }) as ChangeRequest;
  }
  throw new Error(`no mock for ${method} ${path}`);
}
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    if (e instanceof MockError) return e.status;
    throw e;
  }
};

const engineer = "demo-hillside";
const contractor = "demo-lakeview";
const owner = "demo-greenfield";
const seeded = (project: string, wanted: ChangeRequest["status"]) =>
  world(project).changeRequests.find((r) => r.status === wanted) as ChangeRequest;
const items = (project: string) => world(project).checklists.flatMap((c) => c.items);
const freeTask = (project: string) => {
  const busy = new Set(
    world(project).changeRequests.flatMap((r) => ("targetId" in r ? [r.targetId] : [])),
  );
  return items(project).find(
    (i) => !i.removedAt && i.verificationStatus === "todo" && !busy.has(i.id),
  ) as { id: string; task: string };
};

describe("approval chain", () => {
  it("an engineer's edit changes nothing until accepted, and waits for the contractor", () => {
    const task = freeTask(engineer);
    const input = {
      kind: "checklist_rename",
      targetId: task.id,
      payload: { task: "A clearer name" },
      note: "Clearer for the crew",
    };
    const made = call("POST", `/projects/${engineer}/change-requests`, input);
    expect(made.status).toBe("pending_contractor");
    expect(items(engineer).find((i) => i.id === task.id)?.task).toBe(task.task);
    expect(status(() => call("POST", `/projects/${engineer}/change-requests`, input))).toBe(409);
  });

  it("refuses a blank note and the wrong role", () => {
    const vote = seeded(contractor, "pending_contractor");
    expect(
      status(() => call("POST", `/change-requests/${vote.id}/vote`, { approve: true, note: " " })),
    ).toBe(400);
    const other = seeded(engineer, "pending_contractor");
    expect(
      status(() =>
        call("POST", `/change-requests/${other.id}/vote`, { approve: true, note: "ok" }),
      ),
    ).toBe(403);
    expect(
      status(() =>
        call("POST", `/projects/${owner}/change-requests`, {
          kind: "checklist_remove",
          targetId: freeTask(owner).id,
          payload: {},
          note: "no",
        }),
      ),
    ).toBe(403);
  });

  it("a contractor's no stops it, and only the author can reopen it", () => {
    const vote = seeded(contractor, "pending_contractor");
    const rejected = call("POST", `/change-requests/${vote.id}/vote`, {
      approve: false,
      note: "Not needed",
    });
    expect(rejected.status).toBe("rejected_contractor");
    expect(rejected.events.at(-1)).toMatchObject({
      kind: "contractor_rejected",
      note: "Not needed",
    });
    const mine = seeded(engineer, "rejected_contractor");
    const reopened = call("POST", `/change-requests/${mine.id}/reopen`, { note: "Added photos" });
    expect(reopened.status).toBe("pending_contractor");
    expect(reopened.events.map((e) => e.kind)).toEqual([
      "created",
      "contractor_rejected",
      "reopened",
    ]);
  });

  it("the owner's yes applies the change once, and the decision is final", () => {
    const add = seeded(owner, "pending_owner");
    const before = items(owner).length;
    const done = call("POST", `/change-requests/${add.id}/decision`, {
      accept: true,
      note: "Go ahead",
    });
    expect(done.status).toBe("accepted");
    expect(items(owner)).toHaveLength(before + 1);
    expect(
      status(() =>
        call("POST", `/change-requests/${add.id}/decision`, { accept: false, note: "Changed" }),
      ),
    ).toBe(409);
    expect(status(() => call("POST", `/change-requests/${add.id}/reopen`, { note: "x" }))).toBe(
      403,
    );
  });

  it("a contractor's attendance fix goes to the owner; full pay needs a medical emergency", () => {
    const row = world(contractor).attendance.find((a) => a.effectiveHalfDays === 1);
    expect(row).toBeDefined();
    const fix = (payload: object) =>
      call("POST", `/projects/${contractor}/change-requests`, {
        kind: "attendance_fix",
        targetId: row?.id,
        payload,
        note: "Cut hand on site, sent to clinic",
      });
    expect(status(() => fix({ newValue: 1, reasonKind: "other", payFullDay: true }))).toBe(400);
    expect(fix({ newValue: 1, reasonKind: "medical_emergency", payFullDay: true }).status).toBe(
      "pending_owner",
    );
    expect(row?.effectiveHalfDays).toBe(1);
    expect(
      status(() =>
        call("POST", `/projects/${contractor}/adjustments`, {
          targetTable: "attendance",
          targetId: row?.id,
          newValue: 2,
          reason: "Trying to skip approval",
        }),
      ),
    ).toBe(409);
  });

  it("a medical bill is paid in full or in part, never more, and counts once", () => {
    const form = new FormData();
    form.set("workerId", world(contractor).workers[0].id);
    form.set("billPaise", "250000");
    form.set("incidentOn", world(contractor).today);
    form.set("note", "Fell from the ladder");
    const send = () => call("POST", `/projects/${contractor}/medical-expenses`, form);
    expect(status(send)).toBe(400);
    form.append("billPhotos", new File([new Uint8Array(900)], "bill.jpg", { type: "image/jpeg" }));
    const made = send();
    expect(made.status).toBe("pending_owner");

    // The owner sees the same record in their own view of the project.
    const mine = { ...structuredClone(made), id: `${owner}-crmed`, projectId: owner };
    world(owner).changeRequests.push(mine);
    const before = spendTotals(world(owner)).otherPaise;
    const decide = (payPaise?: number) =>
      call("POST", `/change-requests/${mine.id}/decision`, {
        accept: true,
        note: "Get well soon",
        ...(payPaise ? { payPaise } : {}),
      });
    expect(status(() => decide())).toBe(400);
    expect(status(() => decide(250001))).toBe(400);
    expect(decide(200000).status).toBe("accepted");
    expect(spendTotals(world(owner)).otherPaise).toBe(before + 200000);
  });
});
