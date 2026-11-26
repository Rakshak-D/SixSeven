"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { SupplierDelegation } from "@/components/payments/supplier-delegation";
import { SupplierPayments } from "@/components/payments/supplier-payments";
import { useCurrentProject } from "@/components/shell/project-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary, useWageSheet } from "@/hooks/use-project-data";
import { addDays, mondayOf, todayIst } from "@/lib/dates";
import { formatIsoDate, formatPaise, formatPaiseShort, formatShortDate } from "@/lib/format";
import { mocksEnabled } from "@/mocks";

type Range = "week" | "30d" | "all";
const rangeLabel: Record<Range, string> = {
  week: "This week",
  "30d": "Last 30 days",
  all: "Whole project",
};

function WeeklyBars({
  weeks,
}: {
  weeks: { weekStart: string; materials: number; wages: number; other: number }[];
}) {
  const [picked, setPicked] = useState(weeks.length - 1);
  const max = Math.max(...weeks.map((w) => w.materials + w.wages + w.other), 1);
  const week = weeks[picked];
  return (
    <div>
      <div className="flex h-56 items-end gap-1.5 sm:gap-2">
        {weeks.map((w, i) => {
          const total = w.materials + w.wages + w.other;
          const isPicked = i === picked;
          return (
            <button
              key={w.weekStart}
              type="button"
              onClick={() => setPicked(i)}
              aria-pressed={isPicked}
              aria-label={`Week of ${formatShortDate(w.weekStart)}: ${formatPaise(total)}, materials ${formatPaise(w.materials)}, wages ${formatPaise(w.wages)}`}
              className="group flex h-full min-h-11 flex-1 flex-col justify-end rounded-lg pb-0"
            >
              <span
                className={`flex w-full origin-bottom animate-[grow-y_900ms_var(--ease-slate)_both] flex-col justify-end overflow-hidden rounded-md transition-opacity duration-(--duration-mid) ease-slate ${isPicked ? "opacity-100" : "opacity-70 group-hover:opacity-90"}`}
                style={{ height: `${(total / max) * 100}%`, animationDelay: `${200 + i * 35}ms` }}
              >
                <span className="block w-full bg-wages" style={{ flexGrow: w.wages }} />
                <span className="block w-full bg-materials" style={{ flexGrow: w.materials }} />
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="mt-2 flex justify-between text-[13px] text-muted-foreground"
        aria-hidden="true"
      >
        <span>{formatShortDate(weeks[0].weekStart)}</span>
        <span>This week</span>
      </div>
      {week ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-2xl bg-secondary px-4 py-3">
          <span className="font-semibold">Week of {formatShortDate(week.weekStart)}</span>
          <span className="num">
            <b>{formatPaise(week.materials + week.wages + week.other)}</b>
          </span>
          <span className="num flex items-center gap-2 text-ink-2">
            <span className="size-2.5 rounded-full bg-materials" />
            Materials {formatPaise(week.materials)}
          </span>
          <span className="num flex items-center gap-2 text-ink-2">
            <span className="size-2.5 rounded-full bg-wages" />
            Wages {formatPaise(week.wages)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function MoneyPage() {
  const project = useCurrentProject();
  const today = todayIst();
  const [range, setRange] = useState<Range>("week");
  const from =
    range === "week" ? mondayOf(today) : range === "30d" ? addDays(today, -29) : project.startDate;
  const summary = useSummary(project.id);
  const sheet = useWageSheet(project.id, from, today);

  const s = summary.data;
  const split = s && "spendSplit" in s ? s.spendSplit : null;
  const weeks =
    s && "spendSplit" in s
      ? s.spendByWeek.map((w) => ({
          weekStart: w.weekStart,
          materials: "materialsPaise" in w ? w.materialsPaise : 0,
          wages: "wagesPaise" in w ? w.wagesPaise : 0,
          other: "otherPaise" in w ? w.otherPaise : 0,
        }))
      : [];
  const exportHref = (format: "csv" | "pdf") =>
    `/api/v1/projects/${encodeURIComponent(project.id)}/wage-sheet?from=${from}&to=${today}&format=${format}`;

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          {project.name}
        </p>
        <h1 className="mt-2 text-5xl">Money</h1>
      </div>

      {summary.isPending ? (
        <Skeleton className="h-80 rounded-[2.25rem]" />
      ) : summary.isError || !s ? (
        <p className="text-destructive">{summary.error?.message ?? "Couldn't load the summary"}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-8">
          <section className="animate-rise rounded-[2.25rem] border bg-band p-6 sm:p-8">
            <h2 className="text-3xl">Where it went</h2>
            <p className="num mt-1 text-muted-foreground">
              {formatPaiseShort(s.spendPaise)} of {formatPaiseShort(s.budgetPaise)} ·{" "}
              {formatPaiseShort(s.budgetPaise - s.spendPaise)} left
            </p>
            {split ? (
              <ul className="mt-6 space-y-5">
                {(
                  [
                    ["Materials", split.materialsPaise, "bg-materials"],
                    ["Wages", split.labourPaise, "bg-wages"],
                    ["Other", split.otherPaise, "bg-other"],
                  ] as const
                ).map(([name, v, color]) => (
                  <li key={name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{name}</span>
                      <span className="num">
                        <b>{formatPaiseShort(v)}</b>
                        <span className="text-muted-foreground">
                          {" "}
                          · {s.spendPaise ? Math.round((v / s.spendPaise) * 100) : 0}%
                        </span>
                      </span>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full origin-left animate-grow-x rounded-full ${color}`}
                        style={{ width: `${s.spendPaise ? (v / s.spendPaise) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-6 text-[15px] text-muted-foreground">
              "Other" is medical expenses you have paid. Nothing else can be recorded there yet.
            </p>
          </section>

          <section className="min-w-0 animate-rise rounded-[1.75rem] border bg-card p-5 sm:p-6">
            <h2 className="text-3xl">Spend per week</h2>
            <p className="mb-5 text-[15px] text-muted-foreground">Tap a week to see it</p>
            {weeks.length ? (
              <WeeklyBars weeks={weeks} />
            ) : (
              <p className="text-muted-foreground">No spending yet.</p>
            )}
          </section>
        </div>
      )}

      {project.role === "owner" ? (
        <>
          <SupplierPayments projectId={project.id} />
          <SupplierDelegation owner projectId={project.id} />
        </>
      ) : null}

      <section className="animate-rise rounded-[1.75rem] border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl">Wage sheet</h2>
            <p className="text-[15px] text-muted-foreground">
              {formatIsoDate(from)} to {formatIsoDate(today)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mocksEnabled ? (
              <span className="self-center text-[15px] text-muted-foreground">
                Downloads work once you're signed in
              </span>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <a href={exportHref("csv")} download>
                    <Download aria-hidden="true" /> CSV
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={exportHref("pdf")} download>
                    <Download aria-hidden="true" /> PDF
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
        <fieldset className="mt-4 flex flex-wrap gap-2">
          <legend className="sr-only">Date range</legend>
          {(Object.keys(rangeLabel) as Range[]).map((r) => (
            <Button
              key={r}
              variant={r === range ? "default" : "secondary"}
              aria-pressed={r === range}
              onClick={() => setRange(r)}
            >
              {rangeLabel[r]}
            </Button>
          ))}
        </fieldset>
        {sheet.isPending ? (
          <Skeleton className="mt-4 h-64 rounded-2xl" />
        ) : sheet.isError ? (
          <p className="mt-4 text-destructive">{sheet.error.message}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="num w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b text-[13px] text-muted-foreground uppercase tracking-[0.08em]">
                  <th className="py-2 pr-3 font-semibold">Worker</th>
                  <th className="py-2 pr-3 text-right font-semibold">Days</th>
                  <th className="py-2 pr-3 text-right font-semibold">Earned</th>
                  <th className="py-2 pr-3 text-right font-semibold">Paid</th>
                  <th className="py-2 pr-3 text-right font-semibold">Advances</th>
                  <th className="py-2 text-right font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sheet.data.workers.map((w) => (
                  <tr key={w.workerId}>
                    <td className="py-3 pr-3 font-semibold">{w.name}</td>
                    <td className="py-3 pr-3 text-right">{w.halfDays / 2}</td>
                    <td className="py-3 pr-3 text-right">{formatPaise(w.accruedPaise)}</td>
                    <td className="py-3 pr-3 text-right">{formatPaise(w.paidWagesPaise)}</td>
                    <td className="py-3 pr-3 text-right">{formatPaise(w.advancesPaise)}</td>
                    <td
                      className={`py-3 text-right font-semibold ${w.duePaise < 0 ? "text-warning" : ""}`}
                    >
                      {formatPaise(w.duePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-3 pr-3">Total</td>
                  <td className="py-3 pr-3 text-right">
                    {sheet.data.workers.reduce((x, w) => x + w.halfDays, 0) / 2}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    {formatPaise(sheet.data.totals.accruedPaise)}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    {formatPaise(sheet.data.totals.paidWagesPaise)}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    {formatPaise(sheet.data.totals.advancesPaise)}
                  </td>
                  <td className="py-3 text-right">{formatPaise(sheet.data.totals.duePaise)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-[15px] text-muted-foreground">
              A negative due means the worker was paid ahead.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
