/** A few requests in each state, so every role's demo project has something to act on. */
import { addDays, istTimestamp } from "@/lib/dates";
import { ChangeRequest } from "@/shared/schemas/change-requests";
import type { Role } from "@/shared/schemas/common";
import { type DemoWorld, demoPeople } from "./world";

export function seedChangeRequests(w: DemoWorld) {
  const list = w.checklists[0];
  const open = list.items.filter((i) => i.verificationStatus === "todo");
  const at = (daysAgo: number, hour: number) => istTimestamp(addDays(w.today, -daysAgo), hour, 15);
  const step = (kind: string, role: Role, note: string, when: string) => ({
    kind,
    role,
    note,
    byUserId: demoPeople[role].id,
    at: when,
  });
  const asked = (role: Role, note: string, daysAgo: number) =>
    step("created", role, note, at(daysAgo, 10));
  const make = (n: number, body: object) =>
    ChangeRequest.parse({ id: `${w.projectId}-cr${n}`, projectId: w.projectId, ...body });
  const engineer = { authorId: demoPeople.engineer.id, authorRole: "engineer" };

  w.changeRequests.push(
    make(1, {
      ...engineer,
      kind: "checklist_rename",
      targetId: open[0].id,
      payload: { task: `${open[0].task} with curing check` },
      status: "pending_contractor",
      events: [asked("engineer", "Curing must be checked before sign-off.", 1)],
    }),
    make(2, {
      ...engineer,
      kind: "checklist_remove",
      targetId: open[1].id,
      payload: {},
      status: "rejected_contractor",
      events: [
        asked("engineer", "This work moved into another task.", 3),
        step("contractor_rejected", "contractor", "It is still separate work.", at(2, 17)),
      ],
    }),
    make(3, {
      ...engineer,
      kind: "checklist_add",
      payload: {
        checklistId: list.id,
        phase: "plumbing",
        task: "Pressure test water lines",
        materials: [],
      },
      status: "pending_owner",
      events: [
        asked("engineer", "Leaks are cheaper to fix before plaster.", 2),
        step("contractor_approved", "contractor", "Agreed, half a day of work.", at(1, 18)),
      ],
    }),
    make(4, {
      authorId: demoPeople.contractor.id,
      authorRole: "contractor",
      kind: "medical_expense",
      payPaise: null,
      payload: {
        workerId: w.workers[0].id,
        billPaise: 320_000,
        incidentOn: addDays(w.today, -1),
        billPhotos: [
          {
            id: `${w.projectId}-bill1`,
            mime: "image/jpeg",
            sizeBytes: 410_000,
            takenOn: addDays(w.today, -1),
            url: `/api/v1/projects/${w.projectId}/photos/${w.projectId}-bill1`,
          },
        ],
      },
      status: "pending_owner",
      events: [asked("contractor", "Rod fell on his foot. X-ray and dressing.", 1)],
    }),
  );
}
