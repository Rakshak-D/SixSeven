"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import { ApiClientError } from "@/lib/api/client";
import { formatIsoDate, formatPaiseShort } from "@/lib/format";
import { mocksEnabled } from "@/mocks";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;

/** The signed-in user's projects. Each opens the project's home. */
export function ProjectList() {
  const projects = useProjects();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <span className="font-serif text-3xl leading-none">Slate</span>
        <div className="flex items-center gap-2">
          {mocksEnabled ? <Badge variant="secondary">Demo data</Badge> : null}
          <ThemeToggle />
        </div>
      </header>
      <h1 className="mt-12 animate-rise text-5xl sm:text-6xl">Your projects</h1>

      {projects.isPending ? (
        <output className="block mt-8 space-y-3">
          <span className="sr-only">Loading your projects</span>
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </output>
      ) : projects.isError ? (
        <p className="mt-8 text-ink-2">
          {projects.error instanceof ApiClientError && projects.error.status === 401
            ? "Sign in to see your projects. The sign-in screen comes in a later stage."
            : projects.error.message}
        </p>
      ) : projects.data.length === 0 ? (
        <p className="mt-8 text-ink-2">You aren&apos;t part of any project yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {projects.data.map((p, i) => (
            <li key={p.id} className="animate-rise" style={{ animationDelay: `${(i + 1) * 80}ms` }}>
              <Link
                href={`/projects/${encodeURIComponent(p.id)}`}
                className="group flex items-center gap-4 rounded-3xl border bg-card p-5 transition-[transform,border-color] duration-(--duration-mid) ease-slate hover:-translate-y-0.5 hover:border-line-strong sm:p-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-3xl leading-tight">{p.name}</span>
                    <Badge variant="outline">{roleLabel[p.role]}</Badge>
                  </span>
                  <span className="mt-1 block text-muted-foreground">
                    {p.location} · started {formatIsoDate(p.startDate)} ·{" "}
                    {formatPaiseShort(p.budgetPaise)} budget
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-(--duration-mid) ease-slate group-hover:translate-x-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
