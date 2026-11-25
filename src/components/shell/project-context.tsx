"use client";

import { createContext, useContext } from "react";
import type { ProjectResponse } from "@/shared/schemas/projects";

const ProjectContext = createContext<ProjectResponse | null>(null);

export const ProjectProvider = ProjectContext.Provider;

/** The project the current page belongs to, with the signed-in user's role in it. */
export function useCurrentProject(): ProjectResponse {
  const project = useContext(ProjectContext);
  if (!project) throw new Error("useCurrentProject must be used inside a project page");
  return project;
}
