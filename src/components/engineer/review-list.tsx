"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, TextArea } from "@/components/forms";
import { PhotoPicker, photoProblem } from "@/components/photos/photo-picker";
import { ProofPhoto } from "@/components/photos/proof-photo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklists, useReviewChecklistItem, useTimeline } from "@/hooks/use-project-data";
import { api } from "@/lib/api/client";
import { activeItems, latestSubmission, type VerifiedItem } from "@/lib/checklist";
import { istDateOf } from "@/lib/dates";
import { formatShortDate, formatTimeIst } from "@/lib/format";
import { SteelProofPhotos } from "@/shared/schemas/checklist";
import type { ProgressResponse } from "@/shared/schemas/progress";

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
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();
  const client = useQueryClient();
  const [steelFiles, setSteelFiles] = useState<File[]>([]);
  const steelPath = `/checklist-items/${encodeURIComponent(item.id)}/steel-proof`;
  const steelKey = [projectId, "steel-proof", item.id];
  const steel = useQuery({
    queryKey: steelKey,
    enabled: Boolean(item.requiresSteelProof),
    queryFn: () => api("GET", steelPath, { schema: SteelProofPhotos }),
  });
  const upload = useMutation({
    mutationFn: (progressId: string) => {
      const invalid = photoProblem(steelFiles);
      if (invalid) throw new Error(invalid);
      const form = new FormData();
      form.set("progressId", progressId);
      form.set("note", note);
      for (const photo of steelFiles) {
        form.append("photos", photo);
        form.append("capturedAt", new Date(photo.lastModified).toISOString());
      }
      return api("POST", steelPath, { body: form, schema: SteelProofPhotos });
    },
    onSuccess: async () => {
      setSteelFiles([]);
      await client.invalidateQueries({ queryKey: steelKey });
    },
  });
  if (!submission?.progressId) return null;
  const progressId = submission.progressId;
  const evidence = steel.data?.filter((photo) => photo.progressId === progressId) ?? [];

  function decide(decision: "accept" | "send_back") {
    const found = firstProblem([
      [!note.trim(), "Add a note first."],
      [
        decision === "send_back" && note.trim().length < 10,
        "Say what to fix, in at least 10 characters.",
      ],
    ]);
    setProblem(found);
    if (found) return;
    const done = decision === "accept" ? "Accepted" : "Sent back";
    review.mutate(
      { itemId: item.id, decision, progressId, note },
      { onSuccess: () => toast.success(`${done}: ${item.task}`) },
    );
  }

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
              <ProofPhoto key={photo.id} url={photo.url} alt="Proof of completed work" />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[15px] text-muted-foreground">
          Accept needs the proof on screen. It could not be shown yet.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <Field
          label="Your note"
          hint="Required. The contractor reads it. To send back, say what to fix (10 characters or more)."
        >
          {(id) => <TextArea id={id} value={note} onChange={setNote} />}
        </Field>
        {item.requiresSteelProof ? (
          <div className="space-y-2">
            <p className="font-medium">Steel-marking evidence</p>
            {evidence.length ? (
              <div className="flex gap-2 overflow-x-auto">
                {evidence.map((photo) => (
                  <ProofPhoto key={photo.id} url={photo.url} alt="Steel markings" />
                ))}
              </div>
            ) : (
              <>
                <PhotoPicker files={steelFiles} onChange={setSteelFiles} max={3} />
                <Button
                  variant="outline"
                  disabled={
                    steel.isPending ||
                    steel.isError ||
                    upload.isPending ||
                    !note.trim() ||
                    !steelFiles.length
                  }
                  onClick={() => upload.mutate(progressId)}
                >
                  Save steel evidence
                </Button>
              </>
            )}
            <FormError error={upload.error ?? steel.error} />
          </div>
        ) : null}
        <FormError error={problem ?? review.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={review.isPending} onClick={() => decide("send_back")}>
            Send back / Reject
          </Button>
          <Button
            disabled={review.isPending || !proof || (item.requiresSteelProof && !evidence.length)}
            onClick={() => decide("accept")}
          >
            Accept
          </Button>
        </div>
      </div>
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
