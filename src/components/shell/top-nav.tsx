// Client-only: imported by the app shell.
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mocksEnabled } from "@/mocks";
import type { ProjectResponse } from "@/shared/schemas/projects";
import { type RoleNav, tabHref } from "./nav";
import { ProjectSwitcher } from "./project-switcher";

const TAB_WIDTH = 104; // px; matches w-26 so the indicator can slide by index

/** Desktop navigation: a floating pill at the top. Hidden below the lg breakpoint (the dock takes over). */
export function TopNav({
  project,
  projects,
  nav,
  activeIndex,
  onAction,
}: {
  project: ProjectResponse;
  projects: ProjectResponse[];
  nav: RoleNav;
  activeIndex: number;
  onAction: () => void;
}) {
  const ActionIcon = nav.action.icon;
  return (
    <header className="sticky top-4 z-30 mx-4 mt-4 hidden h-17 animate-drop items-center gap-3 rounded-full border bg-card pr-2.5 pl-6 shadow-float lg:flex xl:mx-auto xl:w-full xl:max-w-[1360px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href="/projects"
          className="flex h-11 items-center font-serif text-[30px] leading-none"
        >
          Slate
        </Link>
        <span aria-hidden="true" className="mx-2 h-7 w-px bg-line-strong" />
        <ProjectSwitcher current={project} projects={projects} />
        {mocksEnabled ? <Badge variant="secondary">Demo data</Badge> : null}
      </div>

      <nav aria-label="Sections" className="relative flex rounded-full bg-secondary p-1">
        <span
          aria-hidden="true"
          className="absolute top-1 left-1 h-11 w-26 rounded-full bg-foreground transition-[transform,opacity] duration-(--duration-mid) ease-slate"
          style={{
            transform: `translateX(${Math.max(activeIndex, 0) * TAB_WIDTH}px)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
        {nav.tabs.map((tab, i) => (
          <Link
            key={tab.label}
            href={tabHref(project.id, tab)}
            aria-current={i === activeIndex ? "page" : undefined}
            className="relative flex h-11 w-26 items-center justify-center rounded-full font-semibold text-[15px] text-muted-foreground transition-colors duration-(--duration-mid) ease-slate hover:text-foreground aria-[current=page]:text-background"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-1 items-center justify-end gap-2">
        <Button onClick={onAction} aria-haspopup="dialog">
          <ActionIcon aria-hidden="true" />
          {nav.action.label}
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
