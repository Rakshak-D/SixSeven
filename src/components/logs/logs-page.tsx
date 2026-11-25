"use client";

import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { SpendRow, WageDayRow } from "@/components/data/spend-row";
import { SpendFilterChips, SpendFilterSheet } from "@/components/filters/spend-filter-sheet";
import { useCurrentProject } from "@/components/shell/project-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAdjustments,
  useAttendance,
  useMaterials,
  useMovements,
  useWagePayments,
  useWorkers,
} from "@/hooks/use-project-data";
import { istDateOf, todayIst } from "@/lib/dates";
import { formatIsoDate, formatPaise, formatQty, formatTimeIst } from "@/lib/format";
import {
  applySpendFilter,
  buildSpends,
  defaultSpendFilter,
  foldWagesByDay,
  type SpendFilter,
} from "@/lib/spends";

const PAGE_DAYS = 14;
const fixTable = {
  stock_movements: "Stock",
  attendance: "Attendance",
  wage_payments: "Payment",
} as const;

/** Rows grouped under a date heading, newest day first, a page of days at a time. */
function ByDay<T>({
  items,
  dateOf,
  render,
  empty,
}: {
  items: T[];
  dateOf: (t: T) => string;
  render: (t: T) => ReactNode;
  empty: string;
}) {
  const [days, setDays] = useState(PAGE_DAYS);
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(dateOf(item), [...(groups.get(dateOf(item)) ?? []), item]);
  const ordered = [...groups].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  if (ordered.length === 0) return <p className="py-6 text-muted-foreground">{empty}</p>;
  return (
    <div>
      {ordered.slice(0, days).map(([day, rows]) => (
        <section key={day} className="pt-5">
          <h3 className="font-sans font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
            {day === todayIst() ? "Today" : formatIsoDate(day)}
          </h3>
          <ul className="divide-y">{rows.map(render)}</ul>
        </section>
      ))}
      {ordered.length > days ? (
        <Button variant="outline" className="mt-6" onClick={() => setDays(days + PAGE_DAYS)}>
          Show older days
        </Button>
      ) : null}
    </div>
  );
}

const Loading = () => <Skeleton className="mt-6 h-64 rounded-3xl" />;

export function LogsPage() {
  const project = useCurrentProject();
  const id = project.id;
  const money = project.role !== "engineer";
  const today = todayIst();
  const movements = useMovements(id);
  const materials = useMaterials(id);
  const payments = useWagePayments(id, money);
  const workers = useWorkers(id, money);
  const attendance = useAttendance(id, money);
  const adjustments = useAdjustments(id, money);
  const [filter, setFilter] = useState<SpendFilter>({ ...defaultSpendFilter, window: "all" });
  const [filterOpen, setFilterOpen] = useState(false);

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
  const materialOf = (mid: string) => materials.data?.find((m) => m.id === mid);

  const attendanceDays = useMemo(() => {
    const days = new Map<
      string,
      { present: number; half: number; absent: number; earnedPaise: number }
    >();
    for (const a of attendance.data ?? []) {
      const d = days.get(a.workDate) ?? { present: 0, half: 0, absent: 0, earnedPaise: 0 };
      if (a.effectiveHalfDays === 2) d.present++;
      else if (a.effectiveHalfDays === 1) d.half++;
      else d.absent++;
      d.earnedPaise += (a.effectiveHalfDays * a.ratePaise) / 2;
      days.set(a.workDate, d);
    }
    return [...days].map(([date, d]) => ({ date, ...d }));
  }, [attendance.data]);

  const tabs = money ? ["spends", "stock", "attendance", "fixes"] : ["stock"];

  return (
    <div className="animate-rise">
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
        {project.name}
      </p>
      <h1 className="mt-2 text-5xl">Logs</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Every entry by date. Fixes never overwrite: the original stays, with the reason next to it.
      </p>

      <Tabs defaultValue={tabs[0]} className="mt-6">
        <TabsList className="max-w-full overflow-x-auto">
          {money ? <TabsTrigger value="spends">Spends</TabsTrigger> : null}
          <TabsTrigger value="stock">Stock</TabsTrigger>
          {money ? <TabsTrigger value="attendance">Attendance</TabsTrigger> : null}
          {money ? <TabsTrigger value="fixes">Fixes</TabsTrigger> : null}
        </TabsList>

        {money ? (
          <TabsContent value="spends">
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setFilterOpen(true)} aria-haspopup="dialog">
                <SlidersHorizontal aria-hidden="true" />
                Filter
              </Button>
              <SpendFilterChips value={filter} onChange={setFilter} />
              <span className="num ml-auto text-[15px] text-muted-foreground">
                {shown.length} entries · {formatPaise(shown.reduce((s, x) => s + x.amountPaise, 0))}
              </span>
            </div>
            {movements.isPending || payments.isPending ? (
              <Loading />
            ) : (
              <ByDay
                items={foldWagesByDay(shown)}
                dateOf={(s) => s.date}
                render={(s) =>
                  s.kind === "wageDay" ? (
                    <WageDayRow key={s.id} rows={s.rows} amountPaise={s.amountPaise} />
                  ) : (
                    <SpendRow key={s.id} spend={s} showDate={false} />
                  )
                }
                empty="Nothing matches these filters."
              />
            )}
            <SpendFilterSheet
              open={filterOpen}
              onOpenChange={setFilterOpen}
              value={filter}
              onChange={setFilter}
              resultCount={shown.length}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="stock">
          {movements.isPending ? (
            <Loading />
          ) : (
            <ByDay
              items={movements.data ?? []}
              dateOf={(m) => m.occurredOn}
              empty="No stock movements yet."
              render={(m) => {
                const mat = materialOf(m.materialId);
                const label =
                  m.type === "delivery" ? "Delivered" : m.type === "usage" ? "Used" : "Fixed";
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {label} · {mat?.name ?? "Material"}
                      </span>
                      <span className="block truncate text-[15px] text-muted-foreground">
                        {m.type === "delivery"
                          ? `${m.supplier} · challan ${m.challanNo}`
                          : (m.note ?? formatTimeIst(m.createdAt))}
                      </span>
                    </span>
                    <span
                      className={`num shrink-0 font-semibold ${m.qty > 0 ? "text-success" : ""}`}
                    >
                      {m.qty > 0 ? "+" : "−"}
                      {formatQty(Math.abs(m.qty))} {mat?.unit}
                    </span>
                  </li>
                );
              }}
            />
          )}
        </TabsContent>

        {money ? (
          <TabsContent value="attendance">
            {attendance.isPending ? (
              <Loading />
            ) : (
              <ByDay
                items={attendanceDays}
                dateOf={(d) => d.date}
                empty="No attendance yet."
                render={(d) => (
                  <li key={d.date} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-ink-2">
                      <b className="font-semibold text-foreground">{d.present} present</b>
                      {d.half ? ` · ${d.half} half day${d.half > 1 ? "s" : ""}` : ""}
                      {d.absent ? ` · ${d.absent} absent` : ""}
                    </span>
                    <span className="num shrink-0 font-semibold">
                      {formatPaise(d.earnedPaise)} earned
                    </span>
                  </li>
                )}
              />
            )}
          </TabsContent>
        ) : null}

        {money ? (
          <TabsContent value="fixes">
            {adjustments.isPending ? (
              <Loading />
            ) : (
              <ByDay
                items={adjustments.data ?? []}
                dateOf={(a) => istDateOf(a.createdAt)}
                empty="No fixes have been made."
                render={(a) => {
                  const show = (v: number) =>
                    a.targetTable === "wage_payments"
                      ? formatPaise(v)
                      : a.targetTable === "attendance"
                        ? v === 2
                          ? "full day"
                          : v === 1
                            ? "half day"
                            : "absent"
                        : formatQty(v);
                  return (
                    <li key={a.id} className="py-3">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{fixTable[a.targetTable]} fixed</span>
                        <span className="num shrink-0 text-[15px]">
                          <s className="text-muted-foreground">{show(a.oldValue)}</s> →{" "}
                          <b>{show(a.newValue)}</b>
                        </span>
                      </span>
                      <span className="block text-[15px] text-muted-foreground">
                        “{a.reason}” · {formatTimeIst(a.createdAt)}
                      </span>
                    </li>
                  );
                }}
              />
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
