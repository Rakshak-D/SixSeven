// Client-only: imported by the app shell.
import Link from "next/link";
import { SlateLockup, SlateMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mocksEnabled } from "@/mocks";
import type { ProjectResponse } from "@/shared/schemas/projects";
import { AssistantButton } from "./assistant-button";
import { type RoleNav, tabHref } from "./nav";
import { ProjectSwitcher } from "./project-switcher";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;

const TAB_WIDTH = 104; // px; matches w-26 so the indicator can slide by index

/** Desktop navigation: a floating pill at the top. Hidden below the lg breakpoint (the dock takes over). */
export function TopNav({
  project,
  projects,
  nav,
  activeIndex,
  onAction,
  onAssistant,
}: {
  project: ProjectResponse;
  projects: ProjectResponse[];
  nav: RoleNav;
  activeIndex: number;
  onAction: () => void;
  onAssistant: () => void;
}) {
  const ActionIcon = nav.action.icon;
  return (
    <header className="sticky top-4 z-30 mx-4 mt-4 hidden h-17 animate-drop items-center gap-3 rounded-full border bg-card pr-2.5 pl-6 shadow-float lg:flex xl:mx-auto xl:w-full xl:max-w-[1360px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href="/projects"
          aria-label="Slate, your projects"
          className="flex h-11 shrink-0 items-center"
        >
          {/* Between 1024 and 1280 px only the mark fits next to the project name. */}
          <span className="xl:hidden">
            <SlateMark />
          </span>
          <span className="hidden xl:inline-flex">
            <SlateLockup />
          </span>
        </Link>
        <Badge variant="outline" className="shrink-0">
          {roleLabel[project.role]}
        </Badge>
        <span aria-hidden="true" className="mx-1 h-7 w-px shrink-0 bg-line-strong xl:mx-2" />
        <div className="min-w-0">
          <ProjectSwitcher current={project} projects={projects} />
        </div>
        {mocksEnabled ? (
          <Badge variant="secondary" className="hidden shrink-0 xl:inline-flex">
            Demo data
          </Badge>
        ) : null}
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
        <AssistantButton onClick={onAssistant} />
        <ThemeToggle />
      </div>
    </header>
  );
}
