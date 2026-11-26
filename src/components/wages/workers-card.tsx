"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Field, FormError, rupeesToPaise, SavedNotice, TextArea } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkers } from "@/hooks/use-project-data";
import { api } from "@/lib/api/client";
import { formatPaise } from "@/lib/format";
import {
  CreateWorkerInput,
  DeactivateWorkerInput,
  type WorkerResponse,
  WorkerResponse as WorkerSchema,
} from "@/shared/schemas/workers";

const card = "mt-8 rounded-[1.75rem] border bg-card p-5 sm:p-6";
const workersPath = (id: string) => `/projects/${encodeURIComponent(id)}/workers`;

function useWorkerWrite<I>(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: I }) =>
      api("POST", path, { body, schema: WorkerSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}

/** The contractor's crew: add someone any day, or remove them with a reason. */
export function WorkersCard({ projectId }: { projectId: string }) {
  const workers = useWorkers(projectId);
  const [open, setOpen] = useState<{ kind: "add" } | { kind: "remove"; worker: WorkerResponse }>();
  const active = (workers.data ?? []).filter((w) => w.active);
  const close = () => setOpen(undefined);
  return (
    <section className={card} aria-label="Workers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">Workers</h2>
        <Button variant="outline" onClick={() => setOpen({ kind: "add" })}>
          <Plus aria-hidden="true" />
          Add worker
        </Button>
      </div>
      <FormError error={workers.error} />
      {workers.isPending ? (
        <Skeleton className="mt-3 h-20 rounded-2xl" />
      ) : active.length === 0 ? (
        <p className="mt-3 text-muted-foreground">No workers yet.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {active.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="block font-semibold">{w.name}</span>
                <span className="num block text-[15px] text-muted-foreground">
                  {w.category} · {formatPaise(w.dailyRatePaise)} a day
                </span>
              </span>
              <Button variant="ghost" onClick={() => setOpen({ kind: "remove", worker: w })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open !== undefined}
        onOpenChange={(o) => !o && close()}
        title={open?.kind === "remove" ? `Remove ${open.worker.name}` : "Add a worker"}
        description={
          open?.kind === "remove"
            ? "Their past attendance and pay stay on record. They can no longer be marked present."
            : undefined
        }
      >
        {open?.kind === "add" ? <AddWorker projectId={projectId} /> : null}
        {open?.kind === "remove" ? (
          <RemoveWorker projectId={projectId} worker={open.worker} onDone={close} />
        ) : null}
      </Sheet>
    </section>
  );
}

function AddWorker({ projectId }: { projectId: string }) {
  const save = useWorkerWrite<CreateWorkerInput>(projectId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [rate, setRate] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = CreateWorkerInput.safeParse({
      name,
      category,
      dailyRatePaise: rupeesToPaise(rate),
    });
    setProblem(input.success ? undefined : "Enter a name, their trade and a daily rate.");
    if (input.success && !save.isPending) {
      save.mutate(
        { path: workersPath(projectId), body: input.data },
        { onSuccess: () => setName("") },
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Name">
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Trade" hint="For example mason, helper, carpenter.">
        {(id) => <Input id={id} value={category} onChange={(e) => setCategory(e.target.value)} />}
      </Field>
      <Field label="Daily rate (₹)">
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        )}
      </Field>
      <FormError error={problem ?? save.error} />
      {save.isSuccess ? <SavedNotice>Added {save.data.name}.</SavedNotice> : null}
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Adding…" : "Add worker"}
      </Button>
    </form>
  );
}

function RemoveWorker({
  projectId,
  worker,
  onDone,
}: {
  projectId: string;
  worker: WorkerResponse;
  onDone: () => void;
}) {
  const save = useWorkerWrite<DeactivateWorkerInput>(projectId);
  const [reason, setReason] = useState("");
  const valid = DeactivateWorkerInput.safeParse({ reason });
  return (
    <div className="space-y-4">
      <Field label="Reason" hint="At least 5 characters.">
        {(id) => <TextArea id={id} value={reason} onChange={setReason} />}
      </Field>
      <FormError error={save.error} />
      <Button
        size="lg"
        variant="destructive"
        className="w-full"
        disabled={!valid.success || save.isPending}
        onClick={() =>
          valid.success &&
          save.mutate(
            {
              path: `${workersPath(projectId)}/${encodeURIComponent(worker.id)}/deactivate`,
              body: valid.data,
            },
            { onSuccess: onDone },
          )
        }
      >
        {save.isPending ? "Removing…" : `Remove ${worker.name}`}
      </Button>
    </div>
  );
}
