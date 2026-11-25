"use client";

import { AlertTriangle, CircleCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AreaChart, type AreaPoint, type AxisLabel } from "@/components/charts/area-chart";
import { PlanBar } from "@/components/charts/plan-bar";
import { Sparkline } from "@/components/charts/sparkline";
import { SpendRow } from "@/components/data/spend-row";
import { SpendFilterChips, SpendFilterSheet } from "@/components/filters/spend-filter-sheet";
import { Sheet } from "@/components/sheet";
import { useCurrentProject } from "@/components/shell/project-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useActivity,
  useAdjustments,
  useChecklists,
  useMaterials,
  useMovements,
  useProposals,
  useStock,
  useSummary,
  useWagePayments,
  useWorkers,
} from "@/hooks/use-project-data";
import { describeActivity } from "@/lib/activity";
import { activeItems } from "@/lib/checklist";
import { addDays, daysBetween, istDateOf, todayIst } from "@/lib/dates";
import {
  formatIsoDate,
  formatPaise,
  formatPaiseShort,
  formatQty,
  formatShortDate,
  formatTimeIst,
} from "@/lib/format";
import { applySpendFilter, buildSpends, defaultSpendFilter, type SpendFilter } from "@/lib/spends";
import { niceStep, stockSeries } from "@/lib/stock";
import type { SummaryResponse } from "@/shared/schemas/summary";
import { ApprovalsList } from "./approvals-list";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const eyebrow = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]";

/** Cumulative spend over the weeks since the start, ending today. */
function spentOverTime(summary: SummaryResponse, start: string, today: string) {
  const span = Math.max(1, daysBetween(start, today));
  const weekTotal = (w: SummaryResponse["spendByWeek"][number]) =>
    "spendPaise" in w ? w.spendPaise : w.materialsPaise + w.wagesPaise + w.otherPaise;
  const points: AreaPoint[] = [{ x: 0, value: 0, caption: `${formatIsoDate(start)} · start` }];
  let total = 0;
  summary.spendByWeek.forEach((w, i) => {
    total += weekTotal(w);
    const end = addDays(w.weekStart, 6) < today ? addDays(w.weekStart, 6) : today;
    const x = Math.min(1, Math.max(0, daysBetween(start, end) / span));
    const last = i === summary.spendByWeek.length - 1;
    points.push({
      x,
      value: total,
      caption: last ? "today" : `week of ${formatShortDate(w.weekStart)}`,
    });
  });
  const xLabels: AxisLabel[] = [{ x: 0, title: formatShortDate(start), sub: start.slice(0, 4) }];
  const nextMonth = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  };
  for (let d = nextMonth(start); d < today; d = nextMonth(d)) {
    const x = daysBetween(start, d) / span;
    if (x > 0.16 && x < 0.8) {
      xLabels.push({ x, title: MONTHS[Number(d.slice(5, 7)) - 1], sub: d.slice(0, 4) });
    }
  }
  xLabels.push({ x: 1, title: "Today", sub: formatShortDate(today), now: true });
  const step = niceStep(total * 1.1);
  const yTicks = [0, step, step * 2, step * 3]
    .filter((v) => v <= total * 1.25)
    .map((v) => ({ value: v, label: v === 0 ? "0" : formatPaiseShort(v) }));
  return { points, xLabels, yTicks, yMax: Math.max(total * 1.12, step * 2) };
}

function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`animate-rise rounded-[1.75rem] border bg-card p-5 sm:p-6 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-3xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function OwnerHome() {
  const project = useCurrentProject();
  const id = project.id;
  const today = todayIst();
  const summary = useSummary(id);
  const stock = useStock(id);
  const movements = useMovements(id);
  const materials = useMaterials(id);
  const activity = useActivity(id);
  const proposals = useProposals(id);
  const checklists = useChecklists(id);
  const payments = useWagePayments(id);
  const workers = useWorkers(id);
  const adjustments = useAdjustments(id);
  const [exact, setExact] = useState(false);
  const [filter, setFilter] = useState<SpendFilter>(defaultSpendFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);

  const spends = useMemo(
    () =>
      buildSpends({
        movements: movements.data,
        materials: materials.data,
        payments: payments.data,
        workers: workers.data,
        adjustments: adjustments.data,
      }),
    [movements.data, materials.data, payments.data, workers.data, adjustments.data],
  );
  const shown = applySpendFilter(spends, filter, today);

  if (summary.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[26rem] rounded-[2.25rem]" />
        <Skeleton className="h-72 rounded-[1.75rem]" />
      </div>
    );
  }
  if (summary.isError) return <p className="text-destructive">{summary.error.message}</p>;

  const s = summary.data;
  const left = s.budgetPaise - s.spendPaise;
  const usedPct = s.budgetPaise ? Math.round((s.spendPaise / s.budgetPaise) * 100) : 0;
  const split = "spendSplit" in s ? s.spendSplit : null;
  const week = Math.floor(daysBetween(project.startDate, today) / 7) + 1;
  const underway = activeItems(checklists.data).find((i) => i.verificationStatus === "doing");
  const chart = spentOverTime(s, project.startDate, today);
  const pending = proposals.data?.filter((p) => p.status === "pending") ?? [];
  const over = s.materialVariance.filter((v) => v.overTolerance);

  const lookups = {
    movements: movements.data,
    materials: materials.data,
    proposals: proposals.data,
    checklists: checklists.data,
  };
  const events = activity.data ?? [];
  const latestDay = events[0] ? istDateOf(events[0].createdAt) : today;
  const dayEvents = events.filter((a) => istDateOf(a.createdAt) === latestDay).slice(0, 6);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex animate-rise flex-wrap gap-x-10 gap-y-12 rounded-[2.25rem] border bg-band p-6 sm:p-9">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col">
          <p className={eyebrow}>
            {project.location} · started {formatIsoDate(project.startDate)}
          </p>
          <h1 className="mt-3 text-[2.4rem] leading-[1.04] sm:text-5xl">Week {week}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {underway ? `${underway.task} under way` : "On site"}
          </p>
          <div className="mt-auto pt-8">
            <p className="text-ink-2">Left in budget</p>
            <button
              type="button"
              onClick={() => setExact(!exact)}
              aria-label={`Left in budget ${formatPaise(left)}. ${exact ? "Show short form" : "Show exact amount"}`}
              className={`num text-left font-serif leading-none tracking-tight transition-[font-size] duration-(--duration-mid) ease-slate ${exact ? "text-5xl sm:text-6xl" : "text-7xl sm:text-[6.5rem]"}`}
            >
              {exact ? formatPaise(left) : formatPaiseShort(left)}
            </button>
            <p className="mt-2 text-muted-foreground">
              {formatPaiseShort(s.spendPaise)} spent of {formatPaiseShort(s.budgetPaise)} ·{" "}
              {usedPct}%
            </p>
            {split ? (
              <>
                <div
                  className="mt-5 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-border"
                  role="img"
                  aria-label={`Materials ${formatPaiseShort(split.materialsPaise)}, wages ${formatPaiseShort(split.labourPaise)}, other ${formatPaiseShort(split.otherPaise)} of the budget`}
                >
                  {(
                    [
                      ["bg-materials", split.materialsPaise],
                      ["bg-wages", split.labourPaise],
                      ["bg-other", split.otherPaise],
                    ] as const
                  ).map(([color, v]) =>
                    v > 0 ? (
                      <span
                        key={color}
                        className={`h-full origin-left animate-grow-x ${color}`}
                        style={{ width: `${(v / s.budgetPaise) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
                  <li className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-materials" />
                    Materials{" "}
                    <b className="num text-foreground">{formatPaiseShort(split.materialsPaise)}</b>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-wages" />
                    Wages{" "}
                    <b className="num text-foreground">{formatPaiseShort(split.labourPaise)}</b>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-other" />
                    Other{" "}
                    <b className="num text-foreground">{formatPaiseShort(split.otherPaise)}</b>
                  </li>
                </ul>
              </>
            ) : null}
            <p className="mt-2 text-[15px] text-muted-foreground">
              About {formatPaise(Math.round(s.burnRatePaisePerDay / 100) * 100)} a day on average
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-[1.5_1_420px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-3xl">Spent over time</h2>
            <span className="text-[15px] text-muted-foreground">drag to look back</span>
          </div>
          <AreaChart
            label="Total spent over time"
            points={chart.points}
            xLabels={chart.xLabels}
            yTicks={chart.yTicks}
            yMin={0}
            yMax={chart.yMax}
            format={(v) => {
              const text = formatPaiseShort(v);
              const [num, unit] = text.split(" ");
              return [num, unit ?? ""];
            }}
          />
        </div>

        <div className="min-w-0 flex-[0.9_1_280px]">
          <h2 className="text-3xl">Needs you</h2>
          <ul className="mt-3 space-y-2">
            {pending.length > 0 ? (
              <li>
                <button
                  type="button"
                  onClick={() => setApprovalsOpen(true)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left transition-transform duration-(--duration-fast) ease-slate active:scale-[0.98]"
                >
                  <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {pending.length} {pending.length === 1 ? "change" : "changes"} to approve
                    </span>
                    <span className="block truncate text-[15px] text-muted-foreground">
                      {pending.map((p) => p.title).join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ) : null}
            {s.stockAlerts.map((a) => {
              const unit = materials.data?.find((m) => m.id === a.materialId)?.unit ?? "";
              return (
                <li key={a.materialId} className="flex items-center gap-3 rounded-2xl bg-card p-3">
                  <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-warning" />
                  <span>
                    <span className="block font-semibold">{a.name} is low</span>
                    <span className="num block text-[15px] text-muted-foreground">
                      {formatQty(a.balance)} {unit} left · reorder at {formatQty(a.lowStockQty)}
                    </span>
                  </span>
                </li>
              );
            })}
            {over.map((v) => (
              <li key={v.materialId} className="flex items-center gap-3 rounded-2xl bg-card p-3">
                <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-warning" />
                <span>
                  <span className="block font-semibold">{v.name} is over plan</span>
                  <span className="num block text-[15px] text-muted-foreground">
                    {formatQty(v.usedQty)} of {formatQty(v.plannedQty)} {v.unit} used
                  </span>
                </span>
              </li>
            ))}
            {pending.length === 0 && s.stockAlerts.length === 0 && over.length === 0 ? (
              <li className="rounded-2xl border border-dashed p-3 text-muted-foreground">
                Nothing needs you right now.
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <Card
          title={
            latestDay === today ? "Today on site" : `Last activity, ${formatShortDate(latestDay)}`
          }
        >
          {activity.isPending ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : dayEvents.length === 0 ? (
            <p className="text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y">
              {dayEvents.map((a) => {
                const d = describeActivity(a, lookups);
                return (
                  <li key={a.id} className="flex justify-between gap-4 py-3">
                    <span className="num shrink-0 pt-0.5 text-[15px] text-muted-foreground">
                      {formatTimeIst(a.createdAt)}
                    </span>
                    <span className="min-w-0 text-right">
                      <span className="block truncate font-semibold">{d.title}</span>
                      <span className="block truncate text-[15px] text-muted-foreground">
                        {d.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Recent spends"
          action={
            <Button variant="outline" onClick={() => setFilterOpen(true)} aria-haspopup="dialog">
              <SlidersHorizontal aria-hidden="true" />
              Filter
            </Button>
          }
        >
          <SpendFilterChips value={filter} onChange={setFilter} />
          {movements.isPending || payments.isPending ? (
            <Skeleton className="mt-3 h-48 rounded-2xl" />
          ) : shown.length === 0 ? (
            <p className="mt-3 text-muted-foreground">Nothing matches these filters.</p>
          ) : (
            <ul className="divide-y">
              {shown.slice(0, 6).map((sp) => (
                <SpendRow key={sp.id} spend={sp} />
              ))}
            </ul>
          )}
          <Link
            href={`/projects/${encodeURIComponent(id)}/logs`}
            className="mt-2 inline-flex h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            All {shown.length} in Logs
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <Card title="Material use vs plan">
          <p className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3.5 rounded [background:repeating-linear-gradient(135deg,var(--line-strong)_0_1.5px,transparent_1.5px_5px)] shadow-[inset_0_0_0_1px_var(--line-strong)]" />
              Planned
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-3.5 rounded bg-foreground" />
              Used so far
            </span>
          </p>
          <ul className="space-y-4">
            {s.materialVariance.map((v) => (
              <li key={v.materialId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{v.name}</span>
                  <span
                    className={`num text-[15px] ${v.overTolerance ? "font-semibold text-warning" : "text-muted-foreground"}`}
                  >
                    {formatQty(v.usedQty)} of {formatQty(v.plannedQty)} {v.unit}
                    {v.overTolerance ? " · over plan" : ""}
                  </span>
                </div>
                <PlanBar used={v.usedQty} planned={v.plannedQty} over={v.overTolerance} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Stock">
          <p className="mb-2 text-[15px] text-muted-foreground">Last 14 days</p>
          <ul className="divide-y">
            {(stock.data ?? []).map((m) => {
              const series = movements.data
                ? stockSeries(movements.data, m.materialId, m.balance, today, 14)
                : [];
              return (
                <li key={m.materialId} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block text-[15px] text-muted-foreground">{m.unit}</span>
                  </span>
                  <Sparkline values={series} tone={m.lowStock ? "warning" : "muted"} />
                  <span className="w-20 shrink-0 text-right">
                    <span className="num block font-semibold">{formatQty(m.balance)}</span>
                    {m.lowStock ? (
                      <span className="block font-bold text-[13px] text-warning">Low</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <SpendFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filter}
        onChange={setFilter}
        resultCount={shown.length}
      />
      <Sheet
        open={approvalsOpen}
        onOpenChange={setApprovalsOpen}
        title="Approvals"
        description="Changes and payments that need your yes."
      >
        <ApprovalsList projectId={id} />
      </Sheet>
    </div>
  );
}
