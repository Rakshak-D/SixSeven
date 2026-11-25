"use client";

import { Camera } from "lucide-react";
import { ApprovalsList } from "@/components/owner/approvals-list";
import { useCurrentProject } from "@/components/shell/project-context";
import { Skeleton } from "@/components/ui/skeleton";
import { useChecklists, useProposals, useTimeline } from "@/hooks/use-project-data";
import { activeItems } from "@/lib/checklist";
import { todayIst } from "@/lib/dates";
import { formatIsoDate, formatPaise, formatTimeIst } from "@/lib/format";
import { mocksEnabled } from "@/mocks";
import { ChecklistPhase } from "@/shared/schemas/checklist";

const phaseLabel: Record<(typeof ChecklistPhase.options)[number], string> = {
  foundation: "Foundation",
  plinth: "Plinth",
  walls: "Walls",
  slab: "Slabs",
  plumbing: "Plumbing",
  electrical: "Electrical",
  plaster: "Plaster",
  flooring: "Flooring",
  finishing: "Finishing",
};
const statusLabel = {
  todo: "Not started",
  doing: "Under way",
  waiting: "Waiting for check",
  sent_back: "Sent back",
  done: "Done",
} as const;
const statusClass = {
  todo: "bg-secondary text-muted-foreground",
  doing: "bg-primary/15 text-primary",
  waiting: "bg-warning/15 text-warning",
  sent_back: "bg-destructive/15 text-destructive",
  done: "bg-success/15 text-success",
} as const;

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-rise rounded-[1.75rem] border bg-card p-5 sm:p-6">
      <h2 className="text-3xl">{title}</h2>
      {sub ? <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SitePage() {
  const project = useCurrentProject();
  const checklists = useChecklists(project.id);
  const timeline = useTimeline(project.id);
  const proposals = useProposals(project.id);
  const items = activeItems(checklists.data);
  const done = items.filter((i) => i.verificationStatus === "done").length;

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          {project.name}
        </p>
        <h1 className="mt-2 text-5xl">Site</h1>
        {items.length ? (
          <p className="num mt-2 text-ink-2">
            {done} of {items.length} tasks done · {Math.round((done / items.length) * 100)}%
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <Section title="Work by phase" sub="From the engineer's checklist">
          {checklists.isPending ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">
              No checklist yet. The engineer drafts and saves it.
            </p>
          ) : (
            <ul className="space-y-5">
              {ChecklistPhase.options
                .map((phase) => ({ phase, list: items.filter((i) => i.phase === phase) }))
                .filter((g) => g.list.length > 0)
                .map(({ phase, list }) => {
                  const phaseDone = list.filter((i) => i.verificationStatus === "done").length;
                  return (
                    <li key={phase}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-sans font-semibold text-[17px]">{phaseLabel[phase]}</h3>
                        <span className="num text-[15px] text-muted-foreground">
                          {phaseDone} of {list.length}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full origin-left animate-grow-x rounded-full bg-foreground"
                          style={{ width: `${(phaseDone / list.length) * 100}%` }}
                        />
                      </div>
                      <ul className="mt-2">
                        {list.map((item) => (
                          <li
                            key={item.id}
                            className="flex min-h-11 items-center justify-between gap-3"
                          >
                            <span
                              className={
                                item.verificationStatus === "done" ? "text-muted-foreground" : ""
                              }
                            >
                              {item.task}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-3 py-1 font-semibold text-[13px] ${statusClass[item.verificationStatus]}`}
                            >
                              {statusLabel[item.verificationStatus]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
            </ul>
          )}
        </Section>

        <div className="space-y-6">
          <Section
            title="Changes"
            sub={
              project.role === "owner"
                ? "Proposed by the engineer or contractor; you decide."
                : "Proposed changes and the owner's decisions."
            }
          >
            {project.role === "owner" ? (
              <ApprovalsList projectId={project.id} />
            ) : proposals.isPending ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : (
              <ul className="divide-y">
                {(proposals.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block font-semibold">{p.title}</span>
                      <span className="num block text-[15px] text-muted-foreground">
                        {p.costImpactPaise >= 0 ? "Adds " : "Saves "}
                        {formatPaise(Math.abs(p.costImpactPaise))}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-sm">
                      {p.status === "pending"
                        ? "Waiting"
                        : p.status === "approved"
                          ? "Approved"
                          : "Rejected"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Progress" sub="Notes and photos from the site">
            {timeline.isPending ? (
              <Skeleton className="h-64 rounded-2xl" />
            ) : (timeline.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">No progress updates yet.</p>
            ) : (
              <ol className="space-y-5">
                {(timeline.data ?? []).slice(0, 8).map((day) => (
                  <li key={day.date}>
                    <h3 className="font-sans font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
                      {day.date === todayIst() ? "Today" : formatIsoDate(day.date)}
                    </h3>
                    {day.updates.map((u) => (
                      <div key={u.id} className="mt-2">
                        <p className="font-semibold">{u.note}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {formatTimeIst(u.createdAt)}
                        </p>
                        <div className="mt-2 flex gap-2">
                          {u.photos.map((ph) =>
                            mocksEnabled ? (
                              <div
                                key={ph.id}
                                role="img"
                                aria-label="Demo photo placeholder"
                                className="flex aspect-[4/3] w-32 items-end rounded-2xl bg-[radial-gradient(circle_at_70%_30%,#ffc2a1,#ff6a3d_45%,#4a5bd0_85%)] p-2"
                              >
                                <span className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 font-semibold text-[11px] text-white">
                                  <Camera aria-hidden="true" className="size-3" /> Demo photo
                                </span>
                              </div>
                            ) : (
                              // biome-ignore lint/performance/noImgElement: protected same-origin photo route; next/image would proxy it without the session cookie.
                              <img
                                key={ph.id}
                                src={ph.url}
                                alt={u.note}
                                loading="lazy"
                                className="aspect-[4/3] w-32 rounded-2xl object-cover"
                              />
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
