import { describe, expect, it } from "vitest";
import {
  ChangeRequest,
  CreateChangeRequestInput,
  DecideChangeRequestInput,
  VoteChangeRequestInput,
} from "./change-requests";

describe("change request contracts", () => {
  it("requires a scoped target and forbids client-supplied actor fields", () => {
    const input = {
      kind: "checklist_rename",
      targetId: "item-1",
      payload: { task: "Check beams" },
      note: "Correct the task name",
    };
    expect(CreateChangeRequestInput.safeParse(input).success).toBe(true);
    expect(CreateChangeRequestInput.safeParse({ ...input, targetId: undefined }).success).toBe(
      false,
    );
    expect(CreateChangeRequestInput.safeParse({ ...input, authorId: "other-user" }).success).toBe(
      false,
    );
  });

  it("requires meaningful notes and reserves full-day pay for medical emergencies", () => {
    const input = {
      kind: "attendance_fix",
      targetId: "attendance-1",
      payload: { newValue: 0, reasonKind: "other", payFullDay: true },
      note: "Update the incident record",
    };
    expect(CreateChangeRequestInput.safeParse(input).success).toBe(false);
    expect(
      CreateChangeRequestInput.safeParse({
        ...input,
        payload: { ...input.payload, reasonKind: "medical_emergency" },
      }).success,
    ).toBe(true);
    expect(VoteChangeRequestInput.safeParse({ approve: false, note: "  " }).success).toBe(false);
    expect(
      DecideChangeRequestInput.safeParse({ accept: false, note: "Rejected", payPaise: 100 })
        .success,
    ).toBe(false);
    expect(
      DecideChangeRequestInput.safeParse({ accept: true, note: "Approved", payPaise: 1.5 }).success,
    ).toBe(false);
  });

  it("requires an attributable event on every response", () => {
    const record = {
      id: "req-1",
      projectId: "project-1",
      authorId: "user-1",
      authorRole: "engineer",
      status: "pending_contractor",
      kind: "checklist_remove",
      targetId: "item-1",
      payload: {},
      events: [
        {
          kind: "created",
          byUserId: "user-1",
          role: "engineer",
          note: "Remove a duplicate item",
          at: "2026-11-26T10:00:00.000Z",
        },
      ],
    };
    expect(ChangeRequest.safeParse(record).success).toBe(true);
    expect(ChangeRequest.safeParse({ ...record, events: [] }).success).toBe(false);
  });
});
