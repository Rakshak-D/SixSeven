"use client";

import { useState } from "react";
import { FormError } from "@/components/forms";
import { FixSheet, type FixTarget } from "@/components/today/fix-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoster } from "@/hooks/use-project-data";
import { addDays, todayIst } from "@/lib/dates";
import { formatIsoDate } from "@/lib/format";

const mark = ["Absent", "Half day", "Full day"] as const;
const DAYS = 7;

/** Who came, without pay, for the engineer. A fix goes to the contractor, then the owner. */
export function RosterLog({ projectId }: { projectId: string }) {
  const roster = useRoster(projectId);
  const [fix, setFix] = useState<FixTarget | null>(null);
  if (roster.isPending) return <Skeleton className="mt-6 h-64 rounded-3xl" />;
  if (roster.isError) return <FormError error={roster.error} />;
  const since = addDays(todayIst(), -(DAYS - 1));
  const recent = roster.data.filter((e) => e.workDate >= since);
  const dates = [...new Set(recent.map((e) => e.workDate))].sort().reverse();
  if (dates.length === 0)
    return <p className="py-6 text-muted-foreground">No attendance in the last {DAYS} days.</p>;
  return (
    <div>
      {dates.map((date) => (
        <section key={date} className="pt-5">
          <h3 className="font-sans font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
            {date === todayIst() ? "Today" : formatIsoDate(date)}
          </h3>
          <ul className="divide-y">
            {recent
              .filter((e) => e.workDate === date)
              .map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.workerName}</span>
                    <span className="block text-[15px] text-muted-foreground">
                      {mark[e.effectiveHalfDays]}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Fix ${e.workerName}, ${formatIsoDate(e.workDate)}`}
                    onClick={() =>
                      setFix({
                        table: "attendance",
                        id: e.id,
                        title: `${e.workerName} · ${formatIsoDate(e.workDate)}`,
                        current: e.effectiveHalfDays,
                      })
                    }
                  >
                    Fix
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <FixSheet projectId={projectId} target={fix} onClose={() => setFix(null)} />
    </div>
  );
}
