"use client";

import { useMemo } from "react";
import { AreaChart, type AreaPoint, type AxisLabel } from "@/components/charts/area-chart";
import { useCurrentProject } from "@/components/shell/project-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useMovements, useStock } from "@/hooks/use-project-data";
import { addDays, todayIst } from "@/lib/dates";
import { formatQty, formatShortDate } from "@/lib/format";
import { niceStep, stockSeries } from "@/lib/stock";
import type { StockResponse } from "@/shared/schemas/stock";

const DAYS = 14;
const eyebrow = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]";

function chartFor(series: number[], today: string) {
  const last = series.length - 1;
  const points: AreaPoint[] = series.map((value, i) => ({
    x: i / last,
    value,
    caption: i === last ? "today" : formatShortDate(addDays(today, i - last)),
  }));
  const xLabels: AxisLabel[] = [
    { x: 0, title: formatShortDate(addDays(today, -last)) },
    { x: 0.5, title: formatShortDate(addDays(today, -Math.round(last / 2))) },
    { x: 1, title: "Today", now: true },
  ];
  const max = Math.max(...series, 1);
  const step = niceStep(max * 1.1);
  const yTicks = [0, step, step * 2, step * 3]
    .filter((v) => v <= max * 1.25)
    .map((value) => ({ value, label: value === 0 ? "0" : formatQty(value) }));
  return { points, xLabels, yTicks, yMax: Math.max(max * 1.12, step * 2) };
}

function MaterialCard({
  item,
  series,
  today,
}: {
  item: StockResponse[number];
  series: number[];
  today: string;
}) {
  const chart = useMemo(() => chartFor(series, today), [series, today]);
  return (
    <li className="animate-rise rounded-[1.75rem] border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-3xl">{item.name}</h2>
          <p className="text-[15px] text-muted-foreground">
            Alert below {formatQty(item.lowStockQty)} {item.unit}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num font-serif text-5xl leading-none">{formatQty(item.balance)}</p>
          <p className="mt-1 text-[15px] text-muted-foreground">{item.unit}</p>
          {item.lowStock ? (
            <p className="mt-1 font-bold text-[13px] text-warning uppercase tracking-wide">
              Low stock
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <AreaChart
          label={`${item.name} on site over the last ${DAYS} days`}
          points={chart.points}
          xLabels={chart.xLabels}
          yTicks={chart.yTicks}
          yMin={0}
          yMax={chart.yMax}
          format={(v) => [formatQty(v), item.unit]}
        />
      </div>
    </li>
  );
}

/** What is on site for each material and how it moved, rebuilt from the append-only movements. */
export function StockPage() {
  const project = useCurrentProject();
  const stock = useStock(project.id);
  const movements = useMovements(project.id);
  const today = todayIst();

  return (
    <div className="animate-rise">
      <p className={eyebrow}>{project.name}</p>
      <h1 className="mt-2 text-5xl">Stock</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        What is on site for each material, and how it changed over the last two weeks.
      </p>
      {stock.isPending || movements.isPending ? (
        <Skeleton className="mt-6 h-72 rounded-3xl" />
      ) : stock.isError || movements.isError ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3"
        >
          Could not load stock. Try again in a moment.
        </p>
      ) : (stock.data ?? []).length === 0 ? (
        <p className="mt-6 text-muted-foreground">No materials on this project yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {(stock.data ?? []).map((item) => (
            <MaterialCard
              key={item.materialId}
              item={item}
              today={today}
              series={stockSeries(movements.data ?? [], item.materialId, item.balance, today, DAYS)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
