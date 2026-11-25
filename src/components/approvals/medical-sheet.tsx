"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  rupeesToPaise,
  TextArea,
} from "@/components/forms";
import { PhotoPicker, photoProblem } from "@/components/photos/photo-picker";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateMedicalExpense, useRoster } from "@/hooks/use-project-data";
import { todayIst } from "@/lib/dates";
import type { Role } from "@/shared/schemas/common";

const MAX_BILL_PHOTOS = 3;

/** A bill from an accident on site. The owner chooses to pay all or part of it. */
export function MedicalSheet({
  projectId,
  viewer,
  open,
  onOpenChange,
}: {
  projectId: string;
  viewer: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Medical expense"
      description={
        viewer === "engineer"
          ? "For an accident on site. The contractor votes, then the owner decides."
          : "For an accident on site. The owner decides what to pay."
      }
    >
      {open ? <MedicalForm projectId={projectId} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function MedicalForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const roster = useRoster(projectId);
  const save = useCreateMedicalExpense(projectId);
  // Everyone who has been marked on site, once each.
  const workers = [
    ...new Map((roster.data ?? []).map((e) => [e.workerId, e.workerName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const [picked, setPicked] = useState("");
  const workerId = picked || (workers[0]?.[0] ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIst());
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const billPaise = rupeesToPaise(amount);
    const found = firstProblem([
      [!workerId, "Pick who was hurt."],
      [!billPaise || billPaise <= 0, "Enter the bill amount in rupees."],
      [!note.trim(), "Say what happened."],
      [photos.length === 0, "Take a photo of the bill."],
      [photoProblem(photos) !== undefined, photoProblem(photos) ?? ""],
    ]);
    setProblem(found);
    if (found) return;
    save.mutate(
      { workerId, billPaise: billPaise as number, incidentOn: date, note, billPhotos: photos },
      {
        onSuccess: () => {
          toast.success("Medical expense sent");
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Who was hurt?">
        {(id) => (
          <NativeSelect id={id} value={workerId} onChange={setPicked}>
            {workers.map(([wid, name]) => (
              <option key={wid} value={wid}>
                {name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bill (₹)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <Field label="Accident date">
          {(id) => (
            <Input
              id={id}
              type="date"
              max={todayIst()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="What happened?">
        {(id) => <TextArea id={id} value={note} onChange={setNote} />}
      </Field>
      <div>
        <p className="mb-2 font-semibold text-[15px]">Photos of the bill (1 to 3)</p>
        <PhotoPicker files={photos} onChange={setPhotos} max={MAX_BILL_PHOTOS} />
      </div>
      <FormError error={problem ?? save.error} />
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Sending…" : "Send for approval"}
      </Button>
    </form>
  );
}
