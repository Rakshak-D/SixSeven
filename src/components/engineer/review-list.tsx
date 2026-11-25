"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklists, useReviewChecklistItem, useTimeline } from "@/hooks/use-project-data";
import { activeItems, latestSubmission, type VerifiedItem } from "@/lib/checklist";
import { istDateOf } from "@/lib/dates";
import { formatShortDate, formatTimeIst } from "@/lib/format";
import { mocksEnabled } from "@/mocks";
import type { ProgressResponse } from "@/shared/schemas/progress";

/** A proof photo. If it cannot load (demo data has no image files), say so instead of a broken icon. */
function Proof({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-secondary">
      {failed ? (
        <ImageOff
          role="img"
          aria-label={mocksEnabled ? "Demo photo, no image file" : "Photo not available"}
          className="size-6 text-muted-foreground"
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: protected same-origin photo, sized by the box
        <img
          src={url}
          alt="Proof of completed work"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function ReviewCard({
  projectId,
  item,
  proof,
}: {
  projectId: string;
  item: VerifiedItem;
  proof: ProgressResponse | undefined;
}) {
  const review = useReviewChecklistItem(projectId);
  const submission = latestSubmission(item);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();
  if (!submission?.progressId) return null;
  const progressId = submission.progressId;

  return (
    <li className="rounded-3xl border bg-secondary p-4">
      <p className="font-semibold text-[17px]">{item.task}</p>
      <p className="text-[15px] text-muted-foreground">
        {item.phase} · sent {formatShortDate(istDateOf(submission.createdAt))},{" "}
        {formatTimeIst(submission.createdAt)}
      </p>
      {proof ? (
        <>
          <p className="mt-3 text-[15px]">{proof.note}</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {proof.photos.map((photo) => (
              <Proof key={photo.id} url={photo.url} />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[15px] text-muted-foreground">
          Accept needs the proof on screen. It could not be shown yet.
        </p>
      )}

      {sending ? (
        <div className="mt-4 space-y-3">
          <Field
            label="What should the contractor fix?"
            hint="At least 10 characters. They will read this."
          >
            {(id) => <TextArea id={id} value={note} onChange={setNote} />}
          </Field>
          <FormError error={problem ?? review.error} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setSending(false)}>
              Cancel
            </Button>
            <Button
              disabled={review.isPending}
              onClick={() => {
                const found = firstProblem([
                  [note.trim().length < 10, "Say what to fix, in at least 10 characters."],
                ]);
                setProblem(found);
                if (found) return;
                review.mutate(
                  { itemId: item.id, decision: "send_back", progressId, note },
                  { onSuccess: () => toast.success(`Sent back: ${item.task}`) },
                );
              }}
            >
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <>
          <FormError error={review.error} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setSending(true)}>
              Send back
            </Button>
            <Button
              disabled={review.isPending || !proof}
              onClick={() =>
                review.mutate(
                  { itemId: item.id, decision: "accept", progressId },
                  { onSuccess: () => toast.success(`Accepted: ${item.task}`) },
                )
              }
            >
              Accept
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/** Tasks the contractor says are finished, with their proof, waiting for the engineer's decision. */
export function ReviewList({ projectId }: { projectId: string }) {
  const checklists = useChecklists(projectId);
  const timeline = useTimeline(projectId);
  if (checklists.isPending) return <Skeleton className="mt-4 h-40 rounded-3xl" />;
  const waiting = activeItems(checklists.data).filter((i) => i.verificationStatus === "waiting");
  const proofs = new Map((timeline.data ?? []).flatMap((d) => d.updates).map((u) => [u.id, u]));
  if (timeline.isError) {
    return (
      <p
        role="alert"
        className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[15px]"
      >
        Could not load the proof photos, so nothing can be accepted right now. Try again in a
        moment.
      </p>
    );
  }
  if (waiting.length === 0) {
    return <p className="mt-4 text-muted-foreground">Nothing is waiting for your check.</p>;
  }
  return (
    <ul className="mt-4 space-y-3">
      {waiting.map((item) => (
        <ReviewCard
          key={item.id}
          projectId={projectId}
          item={item}
          proof={proofs.get(latestSubmission(item)?.progressId ?? "")}
        />
      ))}
    </ul>
  );
}
