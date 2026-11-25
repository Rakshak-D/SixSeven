"use client";

import { formatIsoDate, formatPaise, formatPaiseShort } from "@/lib/format";
import { roleNav } from "./nav";
import { useCurrentProject } from "./project-context";

const roleLabel = { owner: "owner", contractor: "contractor", engineer: "site engineer" } as const;

/** Project home (Home, or Today for contractors). Shows only what the project contract carries today. */
export function ProjectHome() {
  const project = useCurrentProject();
  const title = roleNav[project.role].tabs[0].label;
  return (
    <section className="animate-rise rounded-[2.25rem] border bg-band p-6 sm:p-9">
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
        {title} · you are the {roleLabel[project.role]}
      </p>
      <h1 className="mt-3 text-5xl leading-[1.02] sm:text-6xl">{project.name}</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        {project.location} · started {formatIsoDate(project.startDate)}
      </p>
      <div className="mt-8">
        <p className="text-ink-2">Budget</p>
        <p
          className="num mt-1 font-serif text-6xl leading-none tracking-tight sm:text-7xl"
          title={formatPaise(project.budgetPaise)}
        >
          {formatPaiseShort(project.budgetPaise)}
        </p>
      </div>
      <p className="mt-8 inline-flex rounded-full border border-dashed px-4 py-2 text-[15px] text-muted-foreground">
        Spending, stock and today&apos;s site activity arrive with the overview stage
      </p>
    </section>
  );
}
