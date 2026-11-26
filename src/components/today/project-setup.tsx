"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Field, FormError, parseQty, rupeesToPaise, SavedNotice } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkers } from "@/hooks/use-project-data";
import { api } from "@/lib/api/client";
import { CreateMaterialInput, MaterialResponse } from "@/shared/schemas/materials";
import { CreateWorkerInput, DeactivateWorkerInput, WorkerResponse } from "@/shared/schemas/workers";

const materialFields = [
  ["name", "Material name"],
  ["unit", "Unit"],
  ["plannedQty", "Planned quantity"],
  ["unitCost", "Unit cost (₹)"],
  ["tolerancePct", "Tolerance (%)"],
  ["lowStockQty", "Low-stock threshold"],
] as const;
const workerFields = [
  ["name", "Worker name"],
  ["category", "Trade"],
  ["dailyRate", "Daily rate (₹)"],
] as const;

export function ProjectSetup({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<"materials" | "workers" | null>(null);
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setMode("materials")}>
        Add material
      </Button>
      <Button variant="outline" onClick={() => setMode("workers")}>
        Manage workers
      </Button>
      <Sheet
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        title={mode === "workers" ? "Manage workers" : "Add material"}
      >
        {mode ? <SetupForm key={mode} projectId={projectId} mode={mode} /> : null}
      </Sheet>
    </div>
  );
}

function SetupForm({ projectId, mode }: { projectId: string; mode: "materials" | "workers" }) {
  const client = useQueryClient();
  const [tracksBags, setTracksBags] = useState(false);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const workers = useWorkers(projectId, mode === "workers");
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const refresh = () => client.invalidateQueries({ queryKey: [projectId] });
  const create = useMutation<MaterialResponse | WorkerResponse>({
    mutationFn: () =>
      mode === "materials"
        ? api("POST", `${base}/materials`, {
            body: CreateMaterialInput.parse({
              name: fields.name,
              unit: fields.unit,
              plannedQty: parseQty(fields.plannedQty ?? ""),
              unitCostPaise: rupeesToPaise(fields.unitCost ?? ""),
              tolerancePct: fields.tolerancePct?.trim() ? Number(fields.tolerancePct) : undefined,
              lowStockQty: parseQty(fields.lowStockQty ?? ""),
              tracksBags,
            }),
            schema: MaterialResponse,
          })
        : api("POST", `${base}/workers`, {
            body: CreateWorkerInput.parse({
              name: fields.name,
              category: fields.category,
              dailyRatePaise: rupeesToPaise(fields.dailyRate ?? ""),
            }),
            schema: WorkerResponse,
          }),
    onSuccess: async () => {
      setFields({});
      setTracksBags(false);
      await refresh();
    },
  });
  const deactivate = useMutation({
    mutationFn: () =>
      api("POST", `${base}/workers/${encodeURIComponent(selected)}/deactivate`, {
        body: DeactivateWorkerInput.parse({ reason }),
        schema: WorkerResponse,
      }),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await refresh();
    },
  });
  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!create.isPending) create.mutate();
        }}
      >
        {(mode === "materials" ? materialFields : workerFields).map(([key, label]) => (
          <Field key={key} label={label}>
            {(id) => (
              <Input
                id={id}
                required
                value={fields[key] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setFields((current) => ({ ...current, [key]: value }));
                }}
              />
            )}
          </Field>
        ))}
        {mode === "materials" ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tracksBags}
              onChange={(event) => setTracksBags(event.target.checked)}
            />
            Track unique bag codes
          </label>
        ) : null}
        <FormError error={create.error} />
        {create.isSuccess ? (
          <SavedNotice>{mode === "materials" ? "Material saved." : "Worker added."}</SavedNotice>
        ) : null}
        <Button type="submit" disabled={create.isPending}>
          {mode === "materials" ? "Save material" : "Add worker"}
        </Button>
      </form>
      {mode === "workers" ? (
        <section className="space-y-2 border-t pt-4" aria-label="Deactivate worker">
          <FormError error={workers.error} />
          {(workers.data ?? [])
            .filter((worker) => worker.active)
            .map((worker) => (
              <Button
                key={worker.id}
                variant="outline"
                onClick={() => {
                  setSelected(worker.id);
                  setReason("");
                }}
              >
                Deactivate {worker.name}
              </Button>
            ))}
          {selected ? (
            <>
              <Field label="Deactivation reason">
                {(id) => (
                  <Input
                    id={id}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
              <Button
                disabled={
                  !DeactivateWorkerInput.safeParse({ reason }).success || deactivate.isPending
                }
                onClick={() => deactivate.mutate()}
              >
                Confirm deactivation
              </Button>
            </>
          ) : null}
          <FormError error={deactivate.error} />
          {deactivate.isSuccess ? <SavedNotice>Worker deactivated.</SavedNotice> : null}
        </section>
      ) : null}
    </div>
  );
}
