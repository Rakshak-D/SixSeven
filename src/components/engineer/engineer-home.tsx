"use client";

import Link from "next/link";
import { useState } from "react";
import { VerifyDeliveries } from "@/components/payments/verify-deliveries";
import { Sheet } from "@/components/sheet";
import { useCurrentProject } from "@/components/shell/project-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useActivity,
  useChecklists,
  useMaterials,
  useMovements,
  useProposals,
  useStock,
} from "@/hooks/use-project-data";
import { describeActivity } from "@/lib/activity";
import { activeItems } from "@/lib/checklist";
import { daysBetween, istDateOf, todayIst } from "@/lib/dates";
import { formatIsoDate, formatQty, formatShortDate, formatTimeIst } from "@/lib/format";
import { ReviewList } from "./review-list";

const eyebrow = "font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]";
const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";

/** The site engineer's Home: what needs checking, how far the plan is, what is running low. */
export function EngineerHome() {
  const project = useCurrentProject();
  const id = project.id;
  const today = todayIst();
  const checklists = useChecklists(id);
  const stock = useStock(id);
  const activity = useActivity(id);
  const movements = useMovements(id);
  const materials = useMaterials(id);
  const proposals = useProposals(id);
  const [reviewing, setReviewing] = useState(false);

  const items = activeItems(checklists.data);
  const done = items.filter((i) => i.verificationStatus === "done").length;
  const waiting = items.filter((i) => i.verificationStatus === "waiting");
  const sentBack = items.filter((i) => i.verificationStatus === "sent_back");
  const low = (stock.data ?? []).filter((s) => s.lowStock);
  const week = Math.floor(daysBetween(project.startDate, today) / 7) + 1;
  const lookups = {
    movements: movements.data,
    materials: materials.data,
    proposals: proposals.data,
    checklists: checklists.data,
  };

  return (
    <div className="animate-rise space-y-4">
      <section className="rounded-[2.25rem] border bg-band p-6 sm:p-9">
        <p className={eyebrow}>Home · you are the site engineer</p>
        <h1 className="mt-3 text-5xl leading-[1.02] sm:text-6xl">{project.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {project.location} · {project.startDate > today ? "starts" : "started"}{" "}
          {formatIsoDate(project.startDate)}
          {project.startDate > today ? "" : ` · week ${week}`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/projects/${encodeURIComponent(id)}/logs?tab=attendance`}>
              Fix attendance
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/projects/${encodeURIComponent(id)}/team`}>Team and invites</Link>
          </Button>
        </div>
        {checklists.isPending ? (
          <Skeleton className="mt-8 h-20 rounded-2xl" />
        ) : items.length === 0 ? (
          <p className="mt-8 text-ink-2">No checklist yet. Draft and save one from the Site tab.</p>
        ) : (
          <div className="mt-8">
            <p className="text-ink-2">Plan progress</p>
            <p className="num mt-1 font-serif text-6xl leading-none tracking-tight sm:text-7xl">
              {Math.round((done / items.length) * 100)}%
            </p>
            <p className="num mt-2 text-ink-2">
              {done} of {items.length} tasks accepted
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-label="Needs your check">
          <h2 className="text-3xl">Needs your check</h2>
          {waiting.length === 0 ? (
            <p className="mt-3 text-muted-foreground">Nothing is waiting for you.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y">
                {waiting.slice(0, 4).map((i) => (
                  <li key={i.id} className="py-3">
                    <span className="block font-semibold">{i.task}</span>
                    <span className="block text-[15px] text-muted-foreground">{i.phase}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-3 w-full" size="lg" onClick={() => setReviewing(true)}>
                Review {waiting.length} {waiting.length === 1 ? "task" : "tasks"}
              </Button>
            </>
          )}
          {sentBack.length > 0 ? (
            <p className="mt-4 text-[15px] text-muted-foreground">
              {sentBack.length} sent back and with the contractor:{" "}
              {sentBack.map((i) => i.task).join(", ")}
            </p>
          ) : null}
        </section>

        <section className={card} aria-label="Running low">
          <h2 className="text-3xl">Running low</h2>
          {stock.isPending ? (
            <Skeleton className="mt-3 h-20 rounded-2xl" />
          ) : low.length === 0 ? (
            <p className="mt-3 text-muted-foreground">Every material is above its alert level.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {low.map((s) => (
                <li key={s.materialId} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-semibold">{s.name}</span>
                  <span className="num text-right">
                    <span className="font-semibold text-warning">
                      {formatQty(s.balance)} {s.unit}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      alert below {formatQty(s.lowStockQty)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <VerifyDeliveries projectId={id} />

      <section className={card} aria-label="Recent activity">
        <h2 className="text-3xl">Recent activity</h2>
        {activity.isPending ? (
          <Skeleton className="mt-3 h-32 rounded-2xl" />
        ) : (
          <ul className="mt-2 divide-y">
            {(activity.data ?? []).slice(0, 8).map((a) => {
              const line = describeActivity(a, lookups);
              return (
                <li key={a.id} className="flex items-baseline justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{line.title}</span>
                    <span className="block text-[15px] text-muted-foreground">{line.detail}</span>
                  </span>
                  <span className="num shrink-0 text-[15px] text-muted-foreground">
                    {formatShortDate(istDateOf(a.createdAt))}, {formatTimeIst(a.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet
        open={reviewing}
        onOpenChange={setReviewing}
        title="Review"
        description="Task proofs waiting for your check."
      >
        <ReviewList projectId={id} />
      </Sheet>
    </div>
  );
}
