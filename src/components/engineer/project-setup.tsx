"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  parseQty,
  rupeesToPaise,
  SavedNotice,
} from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/use-project-data";
import { api } from "@/lib/api/client";
import { type BoqLine, parseBoq } from "@/lib/boq";
import { formatQty } from "@/lib/format";
import {
  ChecklistDraftResponse,
  ChecklistPhase,
  SaveChecklistInput,
  VerifiedChecklistResponse,
} from "@/shared/schemas/checklist";
import { CreateMaterialInput, MaterialResponse } from "@/shared/schemas/materials";

const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";
const base = (id: string) => `/projects/${encodeURIComponent(id)}`;
type Phase = (typeof ChecklistPhase.options)[number];
type Task = { phase: Phase; task: string };
const phaseLabel = (p: string) => p[0].toUpperCase() + p.slice(1);

function useAddMaterial(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) =>
      api("POST", `${base(projectId)}/materials`, {
        body: CreateMaterialInput.parse(input),
        schema: MaterialResponse,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}

/** Engineer's setup: building needs from the Revit export or by hand, and the task checklist. */
export function ProjectSetup({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState<"import" | "material" | "checklist" | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const close = () => setOpen(null);
  return (
    <section className={card} aria-label="Project setup">
      <h2 className="text-3xl">Set up the project</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Enter what the building needs, then the tasks the contractor works through.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button variant="outline" size="lg" onClick={() => setOpen("import")}>
          Import Revit quantities
        </Button>
        <Button variant="outline" size="lg" onClick={() => setOpen("material")}>
          Add a material
        </Button>
        <Button variant="outline" size="lg" onClick={() => setOpen("checklist")}>
          Write the checklist
        </Button>
      </div>
      <Sheet
        open={open === "import"}
        onOpenChange={(o) => !o && close()}
        title="Import Revit quantities"
        description="Upload the quantity take-off exported from Revit as .xlsx. The .rvt model itself is not read or stored."
      >
        <ImportQuantities projectId={projectId} onLevels={setLevels} />
      </Sheet>
      <Sheet open={open === "material"} onOpenChange={(o) => !o && close()} title="Add a material">
        <AddMaterial projectId={projectId} />
      </Sheet>
      <Sheet
        open={open === "checklist"}
        onOpenChange={(o) => !o && close()}
        title="Write the checklist"
        description="The contractor works through these tasks and you review each one."
      >
        <ChecklistBuilder projectId={projectId} levels={levels} onDone={close} />
      </Sheet>
    </section>
  );
}

function ImportQuantities({
  projectId,
  onLevels,
}: {
  projectId: string;
  onLevels: (levels: string[]) => void;
}) {
  const materials = useMaterials(projectId);
  const add = useAddMaterial(projectId);
  const [lines, setLines] = useState<BoqLine[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [overuse, setOveruse] = useState("");
  const [alertPct, setAlertPct] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const existing = new Set((materials.data ?? []).map((m) => m.name.toLowerCase()));

  async function read(file: File | undefined) {
    setProblem(null);
    setLines([]);
    setResults({});
    if (!file) return;
    try {
      const boq = parseBoq(new Uint8Array(await file.arrayBuffer()));
      setLines(boq.lines);
      onLevels(boq.levels);
    } catch (e) {
      setProblem(e);
    }
  }

  async function save() {
    const tolerancePct = parseQty(overuse);
    const alert = parseQty(alertPct);
    const found = firstProblem([
      [tolerancePct === undefined || tolerancePct > 100, "Enter the allowed overuse, 0 to 100 %."],
      [alert === undefined || alert > 100, "Enter the stock alert level, 0 to 100 %."],
      [
        lines.some((l) => rupeesToPaise(rates[l.category] ?? "") === undefined),
        "Enter every rate.",
      ],
    ]);
    setProblem(found ?? null);
    if (found) return;
    setBusy(true);
    for (const line of lines) {
      if (existing.has(line.category.toLowerCase()) || results[line.category] === "Added") {
        setResults((r) => ({ ...r, [line.category]: "Already added" }));
        continue;
      }
      try {
        await add.mutateAsync({
          name: line.category,
          unit: line.unit,
          plannedQty: line.qty,
          unitCostPaise: rupeesToPaise(rates[line.category]) as number,
          tolerancePct: tolerancePct as number,
          lowStockQty: Math.round(line.qty * (alert as number) * 10) / 1000,
        });
        setResults((r) => ({ ...r, [line.category]: "Added" }));
      } catch (e) {
        setResults((r) => ({ ...r, [line.category]: e instanceof Error ? e.message : "Failed" }));
      }
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <Field label="Quantity export (.xlsx)">
        {(id) => (
          <Input
            id={id}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => read(e.target.files?.[0])}
          />
        )}
      </Field>
      {lines.length ? (
        <>
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.category} className="space-y-2 py-3">
                <p className="flex justify-between gap-3">
                  <span className="font-semibold">{l.category}</span>
                  <span className="num">
                    {formatQty(l.qty)} {l.unit}
                  </span>
                </p>
                <Field label={`Rate per ${l.unit} (₹)`}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      value={rates[l.category] ?? ""}
                      onChange={(e) => setRates((r) => ({ ...r, [l.category]: e.target.value }))}
                    />
                  )}
                </Field>
                {results[l.category] ? (
                  <p className="text-[14px] text-muted-foreground">{results[l.category]}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <Field label="Allowed overuse (%)" hint="Usage above plan by more than this is flagged.">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={overuse}
                onChange={(e) => setOveruse(e.target.value)}
              />
            )}
          </Field>
          <Field label="Stock alert (% of planned)" hint="Warn when stock falls below this share.">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={alertPct}
                onChange={(e) => setAlertPct(e.target.value)}
              />
            )}
          </Field>
          <Button size="lg" className="w-full" disabled={busy} onClick={save}>
            {busy ? "Adding…" : `Add ${lines.length} materials`}
          </Button>
        </>
      ) : null}
      <FormError error={problem} />
    </div>
  );
}

function AddMaterial({ projectId }: { projectId: string }) {
  const add = useAddMaterial(projectId);
  const [v, setV] = useState({ name: "", unit: "", planned: "", rate: "", overuse: "", alert: "" });
  const [problem, setProblem] = useState<string>();
  const box = (key: keyof typeof v, label: string, numeric = false, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => (
        <Input
          id={id}
          inputMode={numeric ? "decimal" : undefined}
          value={v[key]}
          onChange={(e) => setV({ ...v, [key]: e.target.value })}
        />
      )}
    </Field>
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      name: v.name,
      unit: v.unit,
      plannedQty: parseQty(v.planned),
      unitCostPaise: rupeesToPaise(v.rate),
      tolerancePct: parseQty(v.overuse),
      lowStockQty: parseQty(v.alert),
    };
    const parsed = CreateMaterialInput.safeParse(input);
    setProblem(parsed.success ? undefined : "Fill in every box with a valid value.");
    if (parsed.success) add.mutate(parsed.data, { onSuccess: () => setV({ ...v, name: "" }) });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {box("name", "Material")}
      {box("unit", "Unit", false, "For example bag, m3, kg.")}
      {box("planned", "Planned quantity", true)}
      {box("rate", "Rate per unit (₹)", true)}
      {box("overuse", "Allowed overuse (%)", true)}
      {box("alert", "Stock alert below (quantity)", true)}
      <FormError error={problem ?? add.error} />
      {add.isSuccess ? <SavedNotice>Added {add.data.name}.</SavedNotice> : null}
      <Button type="submit" size="lg" className="w-full" disabled={add.isPending}>
        {add.isPending ? "Adding…" : "Add material"}
      </Button>
    </form>
  );
}

function ChecklistBuilder({
  projectId,
  levels,
  onDone,
}: {
  projectId: string;
  levels: string[];
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [problem, setProblem] = useState<string>();
  const draft = () =>
    api("POST", `${base(projectId)}/checklists?source=template`, {
      body: {},
      schema: ChecklistDraftResponse,
    });
  const template = useMutation({
    mutationFn: draft,
    onSuccess: (d) => setTasks(d.draft.items.map(({ phase, task }) => ({ phase, task }))),
  });
  const save = useMutation({
    mutationFn: async (input: Omit<SaveChecklistInput, "draftId">) => {
      const { draftId } = await draft();
      return api("POST", `${base(projectId)}/checklists/records`, {
        body: SaveChecklistInput.parse({ draftId, ...input }),
        schema: VerifiedChecklistResponse,
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [projectId] });
      onDone();
    },
  });
  const update = (i: number, next: Partial<Task>) =>
    setTasks(tasks.map((t, j) => (j === i ? { ...t, ...next } : t)));

  function submit() {
    const kept = tasks.filter((t) => t.task.trim());
    const found = firstProblem([
      [!title.trim(), "Give the checklist a title."],
      [!kept.length, "Add at least one task."],
      [kept.length > 40, "A checklist holds at most 40 tasks."],
    ]);
    setProblem(found);
    if (!found) {
      save.mutate({
        title,
        items: kept.map((t) => ({ ...t, task: t.task.trim(), materials: [] })),
      });
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Title">
        {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={template.isPending} onClick={() => template.mutate()}>
          Start from the template
        </Button>
        {levels.length ? (
          <Button
            variant="outline"
            onClick={() =>
              setTasks(
                levels.slice(0, 40).map((level) => ({ phase: "slab", task: `Complete ${level}` })),
              )
            }
          >
            One task per imported level
          </Button>
        ) : null}
      </div>
      <FormError error={template.error} />
      <ol className="space-y-3">
        {tasks.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no id yet
          <li key={i} className="space-y-2 rounded-2xl border p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Task ${i + 1}`}>
                  {(id) => (
                    <Input
                      id={id}
                      maxLength={120}
                      value={t.task}
                      onChange={(e) => update(i, { task: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove task ${i + 1}`}
                onClick={() => setTasks(tasks.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
            <Field label="Phase">
              {(id) => (
                <NativeSelect
                  id={id}
                  value={t.phase}
                  onChange={(p) => update(i, { phase: p as Phase })}
                >
                  {ChecklistPhase.options.map((p) => (
                    <option key={p} value={p}>
                      {phaseLabel(p)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        className="w-full"
        disabled={tasks.length >= 40}
        onClick={() => setTasks([...tasks, { phase: "foundation", task: "" }])}
      >
        Add a task
      </Button>
      <FormError error={problem ?? save.error} />
      <Button size="lg" className="w-full" disabled={save.isPending} onClick={submit}>
        {save.isPending ? "Saving…" : "Save checklist"}
      </Button>
    </div>
  );
}
