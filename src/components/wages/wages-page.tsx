"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Field, FormError, NativeSelect, rupeesToPaise, SavedNotice } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { useCurrentProject } from "@/components/shell/project-context";
import { effectiveValue, FixSheet, type FixTarget } from "@/components/today/fix-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdjustments,
  useCreateWagePayment,
  useWagePayments,
  useWageSheet,
  useWorkers,
} from "@/hooks/use-project-data";
import { addDays, mondayOf, todayIst } from "@/lib/dates";
import { formatIsoDate, formatPaise } from "@/lib/format";
import { referenceRules } from "@/lib/payment-reference";
import { CreateWagePaymentInput, type WagePaymentMode } from "@/shared/schemas/wages";

const eyebrow = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]";
const days = (halfDays: number) => `${halfDays / 2} ${halfDays === 2 ? "day" : "days"}`;

function presets(today: string) {
  const monday = mondayOf(today);
  return [
    { label: "This week", from: monday, to: today },
    { label: "Last week", from: addDays(monday, -7), to: addDays(monday, -1) },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
  ];
}

/** The wage sheet for a date range, who is still owed, and a form to record what was paid. */
export function WagesPage() {
  const project = useCurrentProject();
  const id = project.id;
  const today = todayIst();
  const [range, setRange] = useState(() => presets(today)[0]);
  const valid = range.from <= range.to;
  const sheet = useWageSheet(id, range.from, range.to, valid);
  const payments = useWagePayments(id);
  const adjustments = useAdjustments(id);
  const workers = useWorkers(id);
  const [pay, setPay] = useState<{ workerId?: string; duePaise?: number } | null>(null);
  const [fix, setFix] = useState<FixTarget | null>(null);
  const paymentFixes = adjustments.data?.filter((a) => a.targetTable === "wage_payments");
  const inRange = (payments.data ?? []).filter(
    (p) => p.paidOn >= range.from && p.paidOn <= range.to,
  );
  const nameOf = (workerId: string) =>
    workers.data?.find((w) => w.id === workerId)?.name ?? "Worker";

  return (
    <div className="animate-rise">
      <p className={eyebrow}>{project.name}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl">Wages</h1>
        <Button onClick={() => setPay({})}>
          <Plus aria-hidden="true" />
          Record payment
        </Button>
      </div>
      <p className="mt-2 max-w-prose text-ink-2">
        What each person has earned from attendance, what you have paid, and what is still due.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-2">
        {presets(today).map((p) => (
          <Button
            key={p.label}
            variant={p.from === range.from && p.to === range.to ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(p)}
          >
            {p.label}
          </Button>
        ))}
        <Field label="From">
          {(fid) => (
            <Input
              id={fid}
              type="date"
              max={range.to}
              value={range.from}
              onChange={(e) =>
                setRange({ ...range, label: "", from: e.target.value } as typeof range)
              }
              className="h-10 w-40"
            />
          )}
        </Field>
        <Field label="To">
          {(fid) => (
            <Input
              id={fid}
              type="date"
              max={today}
              value={range.to}
              onChange={(e) =>
                setRange({ ...range, label: "", to: e.target.value } as typeof range)
              }
              className="h-10 w-40"
            />
          )}
        </Field>
      </div>
      {!valid ? (
        <p role="alert" className="mt-3 text-destructive">
          End date must be on or after the start date.
        </p>
      ) : null}

      {sheet.isPending && valid ? (
        <Skeleton className="mt-6 h-72 rounded-3xl" />
      ) : sheet.data ? (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-[1.75rem] border bg-band p-5 sm:grid-cols-4 sm:p-6">
            {(
              [
                ["Earned", sheet.data.totals.accruedPaise],
                ["Paid", sheet.data.totals.paidWagesPaise],
                ["Advances", sheet.data.totals.advancesPaise],
                ["Still due", sheet.data.totals.duePaise],
              ] as const
            ).map(([label, paise]) => (
              <div key={label}>
                <dt className="text-[15px] text-ink-2">{label}</dt>
                <dd className="num font-serif text-3xl sm:text-4xl">{formatPaise(paise)}</dd>
              </div>
            ))}
          </dl>
          <ul className="mt-4 divide-y rounded-[1.75rem] border bg-card px-5 sm:px-6">
            {sheet.data.workers.map((w) => (
              <li key={w.workerId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block truncate font-semibold">{w.name}</span>
                  <span className="num block text-[15px] text-muted-foreground">
                    {days(w.halfDays)} · earned {formatPaise(w.accruedPaise)} · paid{" "}
                    {formatPaise(w.paidWagesPaise + w.advancesPaise)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block font-semibold">{formatPaise(w.duePaise)}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {w.duePaise < 0 ? "paid ahead" : "due"}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPay({ workerId: w.workerId, duePaise: w.duePaise })}
                  aria-label={`Pay ${w.name}`}
                >
                  Pay
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mt-8 text-3xl">Payments in this range</h2>
      {inRange.length === 0 ? (
        <p className="mt-3 text-muted-foreground">No payments recorded for these dates.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {inRange.map((p) => {
            const current = effectiveValue(paymentFixes, p.id, p.amountPaise);
            return (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {nameOf(p.workerId)} · {p.kind === "advance" ? "advance" : "wage"}
                  </span>
                  <span className="block truncate text-[15px] text-muted-foreground">
                    {formatIsoDate(p.paidOn)} · {p.mode.toUpperCase()}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                </span>
                <span className="num font-semibold">{formatPaise(current)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Fix payment to ${nameOf(p.workerId)}`}
                  onClick={() =>
                    setFix({
                      table: "wage_payments",
                      id: p.id,
                      title: `${nameOf(p.workerId)} · ${formatIsoDate(p.paidOn)}`,
                      currentPaise: current,
                    })
                  }
                >
                  Fix
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <PaySheet projectId={id} today={today} state={pay} onClose={() => setPay(null)} />
      <FixSheet projectId={id} target={fix} onClose={() => setFix(null)} />
    </div>
  );
}

function PaySheet({
  projectId,
  today,
  state,
  onClose,
}: {
  projectId: string;
  today: string;
  state: { workerId?: string; duePaise?: number } | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={state !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Record a payment"
      description="Money already handed over. Slate records it; it does not move money."
    >
      {state ? (
        <PayForm
          key={`${state.workerId}-${state.duePaise}`}
          projectId={projectId}
          today={today}
          state={state}
        />
      ) : null}
    </Sheet>
  );
}

function PayForm({
  projectId,
  today,
  state,
}: {
  projectId: string;
  today: string;
  state: { workerId?: string; duePaise?: number };
}) {
  const workers = useWorkers(projectId);
  const save = useCreateWagePayment(projectId);
  const active = (workers.data ?? []).filter((w) => w.active);
  const [picked, setPicked] = useState(state.workerId ?? "");
  const workerId = picked || (active[0]?.id ?? "");
  const [amount, setAmount] = useState(
    state.duePaise && state.duePaise > 0 ? String(state.duePaise / 100) : "",
  );
  const [kind, setKind] = useState<"wage" | "advance">("wage");
  const [mode, setMode] = useState<WagePaymentMode>("cash");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const parsed = CreateWagePaymentInput.safeParse({
      workerId,
      amountPaise: rupeesToPaise(amount),
      kind,
      mode,
      paidOn: date,
      note,
      reference: mode === "cash" ? undefined : reference.trim() || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setProblem(
        issue?.path[0] === "note"
          ? "Add a payment note."
          : (issue?.message ?? "Check the payment details."),
      );
      return;
    }
    setProblem(undefined);
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Worker">
        {(id) => (
          <NativeSelect id={id} value={workerId} onChange={setPicked}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          {(id) => (
            <NativeSelect id={id} value={kind} onChange={(v) => setKind(v as typeof kind)}>
              <option value="wage">Wage</option>
              <option value="advance">Advance</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Paid by">
          {(id) => (
            <NativeSelect
              id={id}
              value={mode}
              onChange={(v) => {
                setMode(v as typeof mode);
                setReference("");
                setProblem(undefined);
              }}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
            </NativeSelect>
          )}
        </Field>
      </div>
      {mode !== "cash" && (
        <Field label={referenceRules[mode].label} hint={referenceRules[mode].hint}>
          {(id) => (
            <Input
              id={id}
              inputMode={mode === "bank" ? "text" : "numeric"}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Field>
      )}
      <Field label="Note" hint={mode === "cash" ? "Who received the cash, and where." : undefined}>
        {(id) => (
          <Input id={id} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </Field>
      <FormError error={problem ?? save.error} />
      {save.isSuccess && !save.isPending ? <SavedNotice>Payment recorded.</SavedNotice> : null}
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save payment"}
      </Button>
    </form>
  );
}
