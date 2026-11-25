"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { SlateMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";
import { ApiClientError } from "@/lib/api/client";
import { mocksEnabled } from "@/mocks";
import { ActionSheet } from "./action-sheet";
import { AiAssistantWidget } from "./ai-assistant-widget";
import { Dock } from "./dock";
import { activeTabIndex, roleNav } from "./nav";
import { ProjectProvider } from "./project-context";
import { ProjectSwitcher } from "./project-switcher";
import { TopNav } from "./top-nav";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;

function ShellMessage({
  title,
  body,
  href = "/projects",
  link = "See your projects",
}: {
  title: string;
  body: string;
  href?: string;
  link?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-4xl">{title}</h1>
      <p className="text-ink-2">{body}</p>
      <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
        {link}
      </Link>
    </main>
  );
}

/** Navigation and project context for every page under /projects/[id]. */
export function AppShell({ projectId, children }: { projectId: string; children: ReactNode }) {
  const pathname = usePathname();
  const projects = useProjects();
  const [actionOpen, setActionOpen] = useState(false);

  if (projects.isPending) {
    return (
      <output className="block mx-auto w-full max-w-[1360px] px-4 pt-4">
        <span className="sr-only">Loading your projects</span>
        <Skeleton className="h-17 w-full rounded-full" />
        <Skeleton className="mt-8 h-64 w-full rounded-[2.25rem]" />
      </output>
    );
  }
  if (projects.isError) {
    const needsSignIn = projects.error instanceof ApiClientError && projects.error.status === 401;
    return needsSignIn ? (
      <ShellMessage
        title="Sign in needed"
        body="Your projects show once you're signed in."
        href="/login"
        link="Sign in"
      />
    ) : (
      <ShellMessage title="Couldn't load your projects" body={projects.error.message} />
    );
  }

  const project = projects.data.find((p) => p.id === projectId);
  if (!project) {
    return (
      <ShellMessage
        title="Project not found"
        body="It doesn't exist, or you're not a member of it."
      />
    );
  }

  const nav = roleNav[project.role];
  const activeIndex = activeTabIndex(pathname, project.id, nav.tabs);
  const openAction = () => setActionOpen(true);

  return (
    <ProjectProvider value={project}>
      <TopNav
        project={project}
        projects={projects.data}
        nav={nav}
        activeIndex={activeIndex}
        onAction={openAction}
      />
      <div className="flex items-center gap-1 px-2 pt-3 lg:hidden">
        <Link
          href="/projects"
          aria-label="Slate, your projects"
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <SlateMark />
        </Link>
        <Badge variant="outline" className="shrink-0">
          {roleLabel[project.role]}
        </Badge>
        <div className="min-w-0 flex-1">
          <ProjectSwitcher current={project} projects={projects.data} />
        </div>
        {mocksEnabled ? <Badge variant="secondary">Demo</Badge> : null}
        <ThemeToggle />
      </div>
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 pt-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 lg:pt-10 lg:pb-16">
        {children}
      </main>
      <Dock projectId={project.id} nav={nav} activeIndex={activeIndex} onAction={openAction} />
      <ActionSheet
        kind={nav.action.kind}
        projectId={project.id}
        open={actionOpen}
        onOpenChange={setActionOpen}
      />
      <AiAssistantWidget />
    </ProjectProvider>
  );
}
