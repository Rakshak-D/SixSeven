// Client-only: imported by the app shell.

import { BriefcaseMedical, Camera, ClipboardList, PackageMinus, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MedicalSheet } from "@/components/approvals/medical-sheet";
import { ReviewList } from "@/components/engineer/review-list";
import { ApprovalsList } from "@/components/owner/approvals-list";
import { ProofSheet } from "@/components/photos/proof-sheet";
import { Sheet } from "@/components/sheet";
import type { NavActionKind } from "./nav";

const quickLogs = [
  { label: "Delivery", note: "Material arrived", log: "delivery", icon: Truck },
  { label: "Usage", note: "Takes from stock", log: "usage", icon: PackageMinus },
  { label: "Attendance", note: "Who came today", log: "attendance", icon: ClipboardList },
  { label: "Photo", note: "Site progress", log: null, icon: Camera },
] as const;

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
    empty: "",
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
  const [photos, setPhotos] = useState(false);
  const [medical, setMedical] = useState(false);
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={text.title}
        description={text.description}
      >
        {kind === "log" ? (
          <div className="grid grid-cols-2 gap-2.5">
            {quickLogs.map(({ label, note, log, icon: Icon }) => {
              const body = (
                <>
                  <Icon aria-hidden="true" className="size-6 text-primary" />
                  <span>
                    <span className="block font-semibold text-[17px]">{label}</span>
                    <span className="block text-[15px] text-muted-foreground">{note}</span>
                  </span>
                </>
              );
              const tile =
                "flex min-h-32 flex-col items-start justify-between gap-4 rounded-3xl border bg-secondary p-4 text-left";
              return log ? (
                <Link
                  key={label}
                  href={`/projects/${encodeURIComponent(projectId)}?log=${log}`}
                  onClick={() => onOpenChange(false)}
                  className={tile}
                >
                  {body}
                </Link>
              ) : (
                <button
                  key={label}
                  type="button"
                  className={tile}
                  onClick={() => {
                    onOpenChange(false);
                    setPhotos(true);
                  }}
                >
                  {body}
                </button>
              );
            })}
            <button
              type="button"
              className="col-span-2 flex min-h-16 items-center gap-4 rounded-3xl border bg-secondary p-4 text-left"
              onClick={() => {
                onOpenChange(false);
                setMedical(true);
              }}
            >
              <BriefcaseMedical aria-hidden="true" className="size-6 text-primary" />
              <span>
                <span className="block font-semibold text-[17px]">Medical expense</span>
                <span className="block text-[15px] text-muted-foreground">Accident on site</span>
              </span>
            </button>
          </div>
        ) : null}
        {kind === "approvals" ? (
          <ApprovalsList projectId={projectId} />
        ) : kind === "review" ? (
          <ReviewList projectId={projectId} />
        ) : kind === "log" ? null : (
          <p className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-[15px] text-muted-foreground">
            {text.empty}
          </p>
        )}
      </Sheet>
      <ProofSheet projectId={projectId} open={photos} onOpenChange={setPhotos} />
      <MedicalSheet
        projectId={projectId}
        viewer="contractor"
        open={medical}
        onOpenChange={setMedical}
      />
    </>
  );
}
