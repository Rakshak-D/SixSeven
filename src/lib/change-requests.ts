import type { AttendanceRosterEntry } from "@/shared/schemas/attendance";
import type { ChangeRequest, ChangeRequestEvent } from "@/shared/schemas/change-requests";
import type { Role } from "@/shared/schemas/common";
import type { VerifiedItem } from "./checklist";
import { formatIsoDate, formatPaise } from "./format";

export const statusText: Record<ChangeRequest["status"], string> = {
  pending_contractor: "Waiting for the contractor's vote",
  pending_owner: "Waiting for the owner",
  rejected_contractor: "Rejected by the contractor",
  accepted: "Accepted by the owner",
  rejected_owner: "Rejected by the owner",
};

export const eventText: Record<ChangeRequestEvent["kind"], string> = {
  created: "Asked",
  contractor_approved: "Contractor voted yes",
  contractor_rejected: "Contractor voted no",
  reopened: "Reopened",
  owner_accepted: "Owner accepted (final)",
  owner_rejected: "Owner rejected (final)",
};

export const roleText: Record<Role, string> = {
  owner: "Owner",
  contractor: "Contractor",
  engineer: "Engineer",
};

/** What this person can do to a request now. Only the author reopens a contractor's "no". */
export function actionFor(role: Role, request: ChangeRequest): "vote" | "reopen" | "decide" | null {
  if (role === "contractor" && request.status === "pending_contractor") return "vote";
  if (role === "owner" && request.status === "pending_owner") return "decide";
  if (role === request.authorRole && request.status === "rejected_contractor") return "reopen";
  return null;
}

/** A request that has not reached a final state or a contractor's "no". */
export const isOpen = (r: ChangeRequest) =>
  r.status === "pending_contractor" || r.status === "pending_owner";

const days = ["Absent", "Half day", "Full day"] as const;

export type ChangeLookups = {
  items?: VerifiedItem[];
  roster?: AttendanceRosterEntry[];
};

/** Plain words for what would change. Falls back when the record it names is not loaded. */
export function describeChange(r: ChangeRequest, lookups: ChangeLookups) {
  const itemName = (id: string) => lookups.items?.find((i) => i.id === id)?.task ?? "a task";
  switch (r.kind) {
    case "checklist_add":
      return { title: "Add a task", detail: `“${r.payload.task}” in ${r.payload.phase}` };
    case "checklist_rename":
      return {
        title: "Rename a task",
        detail: `“${itemName(r.targetId)}” to “${r.payload.task}”`,
      };
    case "checklist_remove":
      return { title: "Remove a task", detail: `“${itemName(r.targetId)}”` };
    case "attendance_fix": {
      const entry = lookups.roster?.find((e) => e.id === r.targetId);
      const who = entry ? `${entry.workerName}, ${formatIsoDate(entry.workDate)}` : "One worker";
      const medical = r.payload.reasonKind === "medical_emergency" ? " · medical emergency" : "";
      const pay = r.payload.payFullDay ? " · pay full day" : "";
      return {
        title: "Fix attendance",
        detail: `${who}: ${days[r.payload.newValue]}${medical}${pay}`,
      };
    }
    case "medical_expense": {
      const worker = lookups.roster?.find((e) => e.workerId === r.payload.workerId)?.workerName;
      const paid = r.payPaise === null ? "" : ` · paid ${formatPaise(r.payPaise)} (mock)`;
      return {
        title: "Medical expense",
        detail: `${worker ?? "Worker"}, ${formatIsoDate(r.payload.incidentOn)} · bill ${formatPaise(r.payload.billPaise)}${paid}`,
      };
    }
  }
}
