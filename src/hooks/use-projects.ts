import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ProjectsResponse } from "@/shared/schemas/projects";

/** The signed-in user's projects, each with their role in it (GET /projects). */
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api("GET", "/projects", { schema: ProjectsResponse }),
  });
}
