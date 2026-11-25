import type { ActivityResponse } from "@/shared/schemas/activity";
import type { MaterialsResponse } from "@/shared/schemas/materials";
import type { ProposalsResponse } from "@/shared/schemas/proposals";
import type { StockMovementsResponse } from "@/shared/schemas/stock";
import type { VerifiedChecklists as ChecklistsResponse } from "./checklist";
import { formatQty } from "./format";

export type Activity = ActivityResponse[number];

export type ActivityLookups = {
  movements?: StockMovementsResponse;
  materials?: MaterialsResponse;
  proposals?: ProposalsResponse;
  checklists?: ChecklistsResponse;
};

const statusWords = {
  pending: "set to not started",
  inProgress: "started",
  done: "marked done",
} as const;

/** A readable line for one activity event, joined with the records it points at when we have them. */
export function describeActivity(
  a: Activity,
  look: ActivityLookups,
): { title: string; detail: string } {
  const who = a.actor.name.split(" ")[0];
  const movement = look.movements?.find((m) => m.id === a.entityId);
  const material = movement ? look.materials?.find((m) => m.id === movement.materialId) : undefined;
  const amount =
    movement && material ? `${formatQty(Math.abs(movement.qty))} ${material.unit}` : "";
  switch (a.entity) {
    case "delivery":
      return {
        title: material ? `${material.name} delivered` : "Delivery logged",
        detail: [amount, movement?.type === "delivery" ? `challan ${movement.challanNo}` : "", who]
          .filter(Boolean)
          .join(" · "),
      };
    case "usage":
      return {
        title: material ? `${material.name} used` : "Usage logged",
        detail: [amount, who].filter(Boolean).join(" · "),
      };
    case "attendance":
      return { title: "Attendance marked", detail: who };
    case "wagePayment":
      return { title: "Wage payment recorded", detail: who };
    case "adjustment":
      return { title: "A fix was made", detail: `${who} · the old value stays in the log` };
    case "progress":
      return { title: "Progress photos added", detail: who };
    case "proposal": {
      const p = look.proposals?.find((x) => x.id === a.entityId);
      const verb =
        a.action === "approved"
          ? "Approved"
          : a.action === "rejected"
            ? "Rejected"
            : "Change proposed";
      return { title: p ? `${verb}: ${p.title}` : `${verb}`, detail: who };
    }
    case "checklistItem": {
      const item = look.checklists?.flatMap((c) => c.items).find((i) => i.id === a.entityId);
      const words =
        a.action === "approved"
          ? "accepted"
          : a.action === "rejected"
            ? "sent back"
            : item
              ? statusWords[item.status]
              : "";
      return {
        title: item ? `${item.task} ${words}` : "Checklist updated",
        detail: who,
      };
    }
    default:
      return { title: `${a.entity} ${a.action}`, detail: who };
  }
}
