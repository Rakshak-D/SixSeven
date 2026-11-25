"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, TextArea } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { useCompleteChecklistItem, useCreateProgress } from "@/hooks/use-project-data";
import { PhotoPicker, photoProblem } from "./photo-picker";

type Props = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set for task proof; unset for general site photos. */
  item?: { id: string; task: string };
};

/** A note and photos: general site progress, or the proof that a task is done. */
export function ProofSheet({ projectId, open, onOpenChange, item }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Send proof" : "Add site photos"}
      description={
        item
          ? `${item.task}. The engineer checks it before it counts as done.`
          : "Everyone on the project can see these."
      }
    >
      {open ? (
        <ProofForm projectId={projectId} item={item} onDone={() => onOpenChange(false)} />
      ) : null}
    </Sheet>
  );
}

function ProofForm({
  projectId,
  item,
  onDone,
}: {
  projectId: string;
  item?: { id: string; task: string };
  onDone: () => void;
}) {
  const progress = useCreateProgress(projectId);
  const completion = useCompleteChecklistItem(projectId);
  const save = item ? completion : progress;
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = firstProblem([
      [!note.trim(), "Say what the photos show."],
      [photoProblem(photos) !== undefined, photoProblem(photos) ?? ""],
    ]);
    setProblem(found);
    if (found) return;
    const done = {
      onSuccess: () => {
        toast.success(item ? `Proof sent: ${item.task}` : "Photos added");
        onDone();
      },
    };
    if (item) completion.mutate({ itemId: item.id, note, photos }, done);
    else progress.mutate({ note, photos }, done);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What do the photos show?">
        {(id) => <TextArea id={id} value={note} onChange={setNote} />}
      </Field>
      <PhotoPicker files={photos} onChange={setPhotos} />
      <FormError error={problem ?? save.error} />
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Sending…" : item ? "Send proof" : "Add photos"}
      </Button>
    </form>
  );
}
