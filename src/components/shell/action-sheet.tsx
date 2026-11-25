// Client-only: imported by the app shell.

import { Camera, ClipboardList, PackageMinus, Truck } from "lucide-react";
import { ApprovalsList } from "@/components/owner/approvals-list";
import { Sheet } from "@/components/sheet";
import type { NavActionKind } from "./nav";

const quickLogs = [
  { label: "Delivery", note: "Needs the challan photo", icon: Truck },
  { label: "Usage", note: "Takes from stock", icon: PackageMinus },
  { label: "Attendance", note: "Who came today", icon: ClipboardList },
  { label: "Photo", note: "Site progress", icon: Camera },
];

const copy: Record<NavActionKind, { title: string; description: string; empty: string }> = {
  log: {
    title: "Log something",
    description: "Pick what happened on site.",
    empty: "These forms arrive with the Today screen.",
  },
  approvals: {
    title: "Approvals",
    description: "Changes and payments that need your yes.",
    empty: "The approvals list is not connected yet, so nothing is shown here.",
  },
  review: {
    title: "Review",
    description: "Task proofs waiting for your check.",
    empty: "The review list is not connected yet, so nothing is shown here.",
  },
};

/** What the centre button opens for each role. Nothing here pretends to be live. */
export function ActionSheet({
  kind,
  projectId,
  open,
  onOpenChange,
}: {
  kind: NavActionKind;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const text = copy[kind];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      description={text.description}
    >
      {kind === "log" ? (
        <div className="grid grid-cols-2 gap-2.5">
          {quickLogs.map(({ label, note, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              className="flex min-h-32 flex-col items-start justify-between gap-4 rounded-3xl border bg-secondary p-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon aria-hidden="true" className="size-6 text-primary" />
              <span>
                <span className="block font-semibold text-[17px]">{label}</span>
                <span className="block text-[15px] text-muted-foreground">{note}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {kind === "approvals" ? (
        <ApprovalsList projectId={projectId} />
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-[15px] text-muted-foreground">
          {text.empty}
        </p>
      )}
    </Sheet>
  );
}
