"use client";

import { Suspense } from "react";
import { EngineerHome } from "@/components/engineer/engineer-home";
import { OwnerHome } from "@/components/owner/owner-home";
import { TodayPage } from "@/components/today/today-page";
import { useCurrentProject } from "./project-context";

/** Project home: Home for the owner and the engineer, Today for the contractor. */
export function ProjectHome() {
  const project = useCurrentProject();
  if (project.role === "owner") return <OwnerHome />;
  if (project.role === "engineer") return <EngineerHome />;
  return (
    // Today reads the ?log= tab from the URL.
    <Suspense fallback={null}>
      <TodayPage />
    </Suspense>
  );
}
