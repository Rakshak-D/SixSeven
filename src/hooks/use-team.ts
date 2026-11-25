import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { failIfInvalid } from "@/lib/api/validate";
import {
  CreateProjectInvitationInput,
  ProjectInvitationResponse,
  ProjectInvitationsResponse,
} from "@/lib/invitations";
import {
  CreateProjectInput,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectTeamResponse,
} from "@/shared/schemas/projects";

export const useTeam = (projectId: string) =>
  useQuery({
    queryKey: [projectId, "team"],
    queryFn: () =>
      api("GET", `/projects/${encodeURIComponent(projectId)}/members`, {
        schema: ProjectTeamResponse,
      }),
  });

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api("POST", "/projects", {
        body: failIfInvalid(CreateProjectInput, input),
        schema: ProjectResponse,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export const useMyInvitations = (enabled: boolean) =>
  useQuery({
    queryKey: ["invitations"],
    enabled,
    queryFn: () => api("GET", "/invitations", { schema: ProjectInvitationsResponse }),
  });

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api("POST", `/invitations/${encodeURIComponent(id)}/accept`, {
        schema: ProjectMemberResponse,
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["projects"] }),
        client.invalidateQueries({ queryKey: ["invitations"] }),
      ]),
  });
}

export const useInvite = (projectId: string) =>
  useMutation({
    mutationFn: (input: CreateProjectInvitationInput) =>
      api("POST", `/projects/${encodeURIComponent(projectId)}/invitations`, {
        body: failIfInvalid(CreateProjectInvitationInput, input),
        schema: ProjectInvitationResponse,
      }),
  });
