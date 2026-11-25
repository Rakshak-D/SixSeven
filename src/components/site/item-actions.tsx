"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, NativeSelect, TextArea } from "@/components/forms";
import { ProofSheet } from "@/components/photos/proof-sheet";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditChecklist, useStartChecklistItem } from "@/hooks/use-project-data";
import type { VerifiedChecklists, VerifiedItem } from "@/lib/checklist";
import { ChecklistPhase } from "@/shared/schemas/checklist";
import type { Role } from "@/shared/schemas/common";

const phaseLabel = (phase: string) => phase.charAt(0).toUpperCase() + phase.slice(1);

/** What this role can do to one task: start and send proof (contractor), edit (engineer). */
export function ItemActions({
  projectId,
  role,
  item,
}: {
  projectId: string;
  role: Role;
  item: VerifiedItem;
}) {
  const start = useStartChecklistItem(projectId);
  const [proof, setProof] = useState(false);
  const [editing, setEditing] = useState(false);
  const sentBackNote = [...item.history].reverse().find((e) => e.kind === "sent_back")?.note;

  if (role === "contractor") {
    const s = item.verificationStatus;
    return (
      <div className="w-full pb-2">
        {s === "sent_back" && sentBackNote ? (
          <p className="mb-2 text-[15px] text-destructive">Engineer: {sentBackNote}</p>
        ) : null}
        {s === "todo" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={start.isPending}
            onClick={() =>
              start.mutate(item.id, { onSuccess: () => toast.success(`Started: ${item.task}`) })
            }
          >
            Start
          </Button>
        ) : null}
        {s === "doing" || s === "sent_back" ? (
          <Button size="sm" onClick={() => setProof(true)}>
            Send proof
          </Button>
        ) : null}
        <FormError error={start.error} />
        <ProofSheet
          projectId={projectId}
          open={proof}
          onOpenChange={setProof}
          item={{ id: item.id, task: item.task }}
        />
      </div>
    );
  }
  if (role === "engineer" && item.verificationStatus !== "waiting") {
    return (
      <div className="w-full pb-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <EditItemSheet projectId={projectId} item={item} open={editing} onOpenChange={setEditing} />
      </div>
    );
  }
  return null;
}

function EditItemSheet({
  projectId,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  item: VerifiedItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { rename, remove } = useEditChecklist(projectId);
  const [task, setTask] = useState(item.task);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const reasonProblem = firstProblem([
    [reason.trim().length < 10, "Say why, in at least 10 characters. It stays in the history."],
  ]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit task"
      description="Changes keep their history and reason."
    >
      <div className="space-y-4">
        <Field label="Task">
          {(id) => <Input id={id} value={task} onChange={(e) => setTask(e.target.value)} />}
        </Field>
        <Field label="Why?">
          {(id) => <TextArea id={id} value={reason} onChange={setReason} />}
        </Field>
        <FormError error={problem ?? rename.error ?? remove.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={remove.isPending}
            onClick={() => {
              setProblem(reasonProblem);
              if (reasonProblem) return;
              remove.mutate(
                { itemId: item.id, reason },
                {
                  onSuccess: () => {
                    toast.success(`Removed: ${item.task}`);
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            Remove task
          </Button>
          <Button
            disabled={rename.isPending}
            onClick={() => {
              const found =
                firstProblem([
                  [!task.trim(), "The task needs a name."],
                  [task.trim() === item.task, "Change the name first."],
                ]) ?? reasonProblem;
              setProblem(found);
              if (found) return;
              rename.mutate(
                { itemId: item.id, task, reason },
                {
                  onSuccess: () => {
                    toast.success("Task renamed");
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            Save name
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Engineer adds a task to a phase of the saved checklist. */
export function AddTaskSheet({
  projectId,
  checklists,
  open,
  onOpenChange,
}: {
  projectId: string;
  checklists: VerifiedChecklists;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { add } = useEditChecklist(projectId);
  const [phase, setPhase] = useState<(typeof ChecklistPhase.options)[number]>("foundation");
  const [task, setTask] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const checklist = checklists[0];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a task"
      description="It joins the saved checklist."
    >
      <div className="space-y-4">
        <Field label="Phase">
          {(id) => (
            <NativeSelect id={id} value={phase} onChange={(v) => setPhase(v as typeof phase)}>
              {ChecklistPhase.options.map((p) => (
                <option key={p} value={p}>
                  {phaseLabel(p)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Task">
          {(id) => <Input id={id} value={task} onChange={(e) => setTask(e.target.value)} />}
        </Field>
        <Field label="Why add it?">
          {(id) => <TextArea id={id} value={reason} onChange={setReason} />}
        </Field>
        <FormError error={problem ?? add.error} />
        <Button
          size="lg"
          className="w-full"
          disabled={add.isPending || !checklist}
          onClick={() => {
            const found = firstProblem([
              [!task.trim(), "The task needs a name."],
              [reason.trim().length < 10, "Say why, in at least 10 characters."],
            ]);
            setProblem(found);
            if (found || !checklist) return;
            add.mutate(
              { checklistId: checklist.id, phase, task, materials: [], reason },
              {
                onSuccess: () => {
                  toast.success(`Added: ${task}`);
                  setTask("");
                  setReason("");
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          Add task
        </Button>
      </div>
    </Sheet>
  );
}
