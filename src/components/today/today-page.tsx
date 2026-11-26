"use client";

import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChangeList } from "@/components/approvals/change-list";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  parseQty,
  rupeesToPaise,
  SavedNotice,
} from "@/components/forms";
import { useCurrentProject } from "@/components/shell/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdjustments,
  useAttendance,
  useCreateAttendance,
  useCreateDelivery,
  useCreateUsage,
  useMaterials,
  useMovements,
  useStock,
  useWorkers,
} from "@/hooks/use-project-data";
import { todayIst } from "@/lib/dates";
import { formatIsoDate, formatPaise, formatQty } from "@/lib/format";
import { effectiveValue, FixSheet, type FixTarget } from "./fix-sheet";

const eyebrow = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]";
const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";
const LOGS = ["delivery", "usage", "attendance"] as const;
type Log = (typeof LOGS)[number];

/** The contractor's Today: one place to record what came, what was used and who worked. */
export function TodayPage() {
  const project = useCurrentProject();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("log");
  const tab: Log = LOGS.find((l) => l === requested) ?? "delivery";
  const [fix, setFix] = useState<FixTarget | null>(null);
  const today = todayIst();

  return (
    <div className="animate-rise">
      <p className={eyebrow}>
        {project.name} · {formatIsoDate(today)}
      </p>
      <h1 className="mt-2 text-5xl">Today</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Log what happened on site. Made a mistake? Fix it with a reason; the original stays on
        record.
      </p>

      <div className="mt-6 max-w-xl empty:hidden">
        <ChangeList projectId={project.id} viewer={project.role} mine />
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => router.replace(`${pathname}?log=${next}`, { scroll: false })}
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {tab === "delivery" ? <DeliveryForm projectId={project.id} today={today} /> : null}
        {tab === "usage" ? <UsageForm projectId={project.id} today={today} /> : null}
        {tab === "attendance" ? <AttendanceForm projectId={project.id} today={today} /> : null}
        <TodayEntries projectId={project.id} today={today} kind={tab} onFix={setFix} />
      </div>
      <FixSheet projectId={project.id} target={fix} onClose={() => setFix(null)} />
    </div>
  );
}

function useMaterialChoice(projectId: string) {
  const materials = useMaterials(projectId);
  const stock = useStock(projectId);
  const [picked, setPicked] = useState("");
  const list = materials.data ?? [];
  const materialId = picked || (list[0]?.id ?? "");
  const material = list.find((m) => m.id === materialId);
  const balance = stock.data?.find((s) => s.materialId === materialId)?.balance;
  return { list, materialId, material, balance, setPicked, loading: materials.isPending };
}

function MaterialField({ choice }: { choice: ReturnType<typeof useMaterialChoice> }) {
  return (
    <Field
      label="Material"
      hint={
        choice.material && choice.balance !== undefined
          ? `On site now: ${formatQty(choice.balance)} ${choice.material.unit}`
          : undefined
      }
    >
      {(id) => (
        <NativeSelect id={id} value={choice.materialId} onChange={choice.setPicked}>
          {choice.list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.unit})
            </option>
          ))}
        </NativeSelect>
      )}
    </Field>
  );
}

function DeliveryForm({ projectId, today }: { projectId: string; today: string }) {
  const choice = useMaterialChoice(projectId);
  const save = useCreateDelivery(projectId);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [challan, setChallan] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = firstProblem([
      [parseQty(qty) === undefined, "Enter the quantity that arrived."],
      [rupeesToPaise(cost) === undefined, "Enter the cost per unit in rupees."],
      [!supplier.trim(), "Enter the supplier's name."],
      [!challan.trim(), "Enter the challan number."],
      [!note.trim(), "Add a note about this delivery."],
    ]);
    setProblem(found);
    if (found) return;
    save.mutate(
      {
        materialId: choice.materialId,
        qty: parseQty(qty) as number,
        unitCostPaise: rupeesToPaise(cost) as number,
        supplier,
        challanNo: challan,
        occurredOn: date,
        note,
      },
      {
        onSuccess: () => {
          setQty("");
          setChallan("");
          setNote("");
        },
      },
    );
  }

  if (choice.loading) return <Skeleton className="h-96 rounded-3xl" />;
  return (
    <form onSubmit={submit} className={`${card} space-y-4`} aria-label="Record a delivery">
      <h2 className="text-3xl">Material delivered</h2>
      <MaterialField choice={choice} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantity${choice.material ? ` (${choice.material.unit})` : ""}`}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          )}
        </Field>
        <Field label="Cost per unit (₹)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Supplier">
        {(id) => <Input id={id} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Challan number">
          {(id) => <Input id={id} value={challan} onChange={(e) => setChallan(e.target.value)} />}
        </Field>
        <Field label="Date">
          {(id) => (
            <Input
              id={id}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Note" hint="Condition, vehicle, who received it.">
        {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <FormError error={problem ?? save.error} />
      {save.isSuccess && !save.isPending ? (
        <SavedNotice>
          Saved. On site now: {formatQty(save.data.balance)} {choice.material?.unit}.
        </SavedNotice>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save delivery"}
      </Button>
      <p className="text-[14px] text-muted-foreground">
        The challan photo needs the photo upload, which is not connected yet.
      </p>
    </form>
  );
}

function UsageForm({ projectId, today }: { projectId: string; today: string }) {
  const choice = useMaterialChoice(projectId);
  const save = useCreateUsage(projectId);
  const [qty, setQty] = useState("");
  const [codes, setCodes] = useState("");
  const bagCodes = codes.split(/\s+/).filter(Boolean);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const found = firstProblem([
      [parseQty(qty) === undefined, "Enter the quantity used."],
      [
        Boolean(choice.material?.tracksBags) && bagCodes.length !== parseQty(qty),
        "Enter one registered code per bag.",
      ],
      [!note.trim(), "Say where it was used."],
    ]);
    setProblem(found);
    if (found) return;
    save.mutate(
      {
        materialId: choice.materialId,
        qty: parseQty(qty) as number,
        occurredOn: date,
        note,
        ...(choice.material?.tracksBags ? { bagCodes } : {}),
      },
      {
        onSuccess: () => {
          setQty("");
          setNote("");
          setCodes("");
        },
      },
    );
  }

  if (choice.loading) return <Skeleton className="h-80 rounded-3xl" />;
  return (
    <form onSubmit={submit} className={`${card} space-y-4`} aria-label="Record usage">
      <h2 className="text-3xl">Material used</h2>
      <MaterialField choice={choice} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantity${choice.material ? ` (${choice.material.unit})` : ""}`}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          )}
        </Field>
        <Field label="Date">
          {(id) => (
            <Input
              id={id}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Where was it used?">
        {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {choice.material?.tracksBags ? (
        <Field label="Registered bag codes" hint="Enter one code per bag, one per line.">
          {(id) => <Input id={id} value={codes} onChange={(e) => setCodes(e.target.value)} />}
        </Field>
      ) : null}
      <FormError error={problem ?? save.error} />
      {save.isSuccess && !save.isPending ? (
        <SavedNotice>
          Saved. On site now: {formatQty(save.data.balance)} {choice.material?.unit}.
        </SavedNotice>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save usage"}
      </Button>
    </form>
  );
}

const choices = [
  { value: 2, label: "Full" },
  { value: 1, label: "Half" },
  { value: 0, label: "Absent" },
] as const;

function AttendanceForm({ projectId, today }: { projectId: string; today: string }) {
  const workers = useWorkers(projectId);
  const [date, setDate] = useState(today);
  const saved = useAttendance(projectId, true, date, date);
  const save = useCreateAttendance(projectId);
  const [marks, setMarks] = useState<Record<string, 0 | 1 | 2>>({});
  const active = (workers.data ?? []).filter((w) => w.active);
  const markOf = (workerId: string) => marks[workerId] ?? 2;
  const alreadySaved = (saved.data?.length ?? 0) > 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save.mutate({
      workDate: date,
      entries: active.map((w) => ({ workerId: w.id, halfDays: markOf(w.id) })),
    });
  }

  if (workers.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  const counts = { 2: 0, 1: 0, 0: 0 };
  for (const w of active) counts[markOf(w.id)]++;
  return (
    <form onSubmit={submit} className={`${card} space-y-4`} aria-label="Record attendance">
      <h2 className="text-3xl">Who came</h2>
      <Field label="Date">
        {(id) => (
          <Input
            id={id}
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      {alreadySaved ? (
        <output className="block rounded-2xl border border-dashed px-4 py-3 text-[15px] text-muted-foreground">
          Attendance for {formatIsoDate(date)} is already saved. To change a person, use Fix on
          their entry.
        </output>
      ) : null}
      <ul className="divide-y">
        {active.map((w) => (
          <li key={w.id} className="py-3">
            <p className="font-semibold">{w.name}</p>
            <p className="text-[15px] text-muted-foreground">
              {w.category} · {formatPaise(w.dailyRatePaise)} a day
            </p>
            <fieldset className="mt-2 grid grid-cols-3 gap-2 border-0 p-0">
              <legend className="sr-only">
                {w.name} on {formatIsoDate(date)}
              </legend>
              {choices.map((c) => (
                <label
                  key={c.value}
                  className="flex h-11 cursor-pointer items-center justify-center rounded-full border font-semibold text-[15px] transition-colors duration-(--duration-fast) ease-slate has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input
                    type="radio"
                    name={`mark-${w.id}`}
                    className="sr-only"
                    checked={markOf(w.id) === c.value}
                    disabled={alreadySaved}
                    onChange={() => setMarks({ ...marks, [w.id]: c.value })}
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      <FormError error={save.error} />
      {save.isSuccess && !save.isPending && !alreadySaved ? (
        <SavedNotice>Attendance saved.</SavedNotice>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={save.isPending || alreadySaved || active.length === 0}
      >
        {save.isPending
          ? "Saving…"
          : `Save · ${counts[2]} full, ${counts[1]} half, ${counts[0]} absent`}
      </Button>
    </form>
  );
}

/** What was recorded for the date in view, each with a Fix button. */
function TodayEntries({
  projectId,
  today,
  kind,
  onFix,
}: {
  projectId: string;
  today: string;
  kind: Log;
  onFix: (target: FixTarget) => void;
}) {
  const movements = useMovements(projectId);
  const materials = useMaterials(projectId);
  const workers = useWorkers(projectId);
  const attendance = useAttendance(projectId, true, today, today);
  const adjustments = useAdjustments(projectId);
  const nameOf = (id: string) => materials.data?.find((m) => m.id === id);
  const stockTargets = adjustments.data?.filter((a) => a.targetTable === "stock_movements");
  const attendanceTargets = adjustments.data?.filter((a) => a.targetTable === "attendance");

  const rows =
    kind === "attendance"
      ? (attendance.data ?? []).map((a) => {
          const worker = workers.data?.find((w) => w.id === a.workerId);
          const current = effectiveValue(attendanceTargets, a.id, a.halfDays) as 0 | 1 | 2;
          const label = ["Absent", "Half day", "Full day"][current];
          return {
            id: a.id,
            title: worker?.name ?? "Worker",
            detail: label,
            fix: {
              table: "attendance",
              id: a.id,
              title: `${worker?.name ?? "Worker"} · ${formatIsoDate(a.workDate)}`,
              current,
            } as FixTarget,
          };
        })
      : (movements.data ?? [])
          .filter((m) => m.occurredOn === today && m.type === kind)
          .map((m) => {
            const material = nameOf(m.materialId);
            const current = effectiveValue(stockTargets, m.id, Math.abs(m.qty));
            const unit = material?.unit ?? "";
            return {
              id: m.id,
              title: `${material?.name ?? "Material"} · ${formatQty(current)} ${unit}`,
              detail:
                m.type === "delivery"
                  ? [m.supplier, `challan ${m.challanNo}`, m.note].filter(Boolean).join(" · ")
                  : (m.note ?? "Used on site"),
              fix: {
                table: "stock_movements",
                id: m.id,
                title: `${material?.name ?? "Material"} ${m.type}`,
                current,
                unit,
              } as FixTarget,
            };
          });

  const loading = movements.isPending || attendance.isPending;
  return (
    <section className={card} aria-label="Today's entries">
      <h2 className="text-3xl">Today&apos;s entries</h2>
      {loading ? (
        <Skeleton className="mt-4 h-24 rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Nothing recorded yet today.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{row.title}</span>
                <span className="block truncate text-[15px] text-muted-foreground">
                  {row.detail}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFix(row.fix)}
                aria-label={`Fix ${row.title}`}
              >
                <Pencil aria-hidden="true" />
                Fix
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
