"use client";

import { useCurrentProject } from "./project-context";

/** Honest stand-in for a section whose screen is not built yet. */
export function SectionPlaceholder({ title, what }: { title: string; what: string }) {
  const project = useCurrentProject();
  return (
    <section className="animate-rise">
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
        {project.name}
      </p>
      <h1 className="mt-2 text-5xl">{title}</h1>
      <p className="mt-3 max-w-prose text-ink-2">{what}</p>
      <p className="mt-6 inline-flex rounded-full border border-dashed px-4 py-2 text-[15px] text-muted-foreground">
        Not built yet
      </p>
    </section>
  );
}
