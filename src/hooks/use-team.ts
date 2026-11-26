import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { failIfInvalid } from "@/lib/api/validate";
import { mocksEnabled } from "@/mocks";
import {
  CreateProjectInput,
  CreateProjectInvitationInput,
  MyPermissionsResponse,
  ProjectInvitationResponse,
  ProjectInvitationsResponse,
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

/** Whether the signed-in person may start a project (engineers only). Demo data always may. */
export const useMyPermissions = () =>
  useQuery({
    queryKey: ["me", "permissions"],
    queryFn: () =>
      mocksEnabled
        ? { canCreateProjects: true }
        : api("GET", "/me/permissions", { schema: MyPermissionsResponse }),
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

export const useSentInvitations = (projectId: string) =>
  useQuery({
    queryKey: [projectId, "invitations"],
    queryFn: () =>
      api("GET", `/projects/${encodeURIComponent(projectId)}/invitations`, {
        schema: ProjectInvitationsResponse,
      }),
  });

export function useInvite(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInvitationInput) =>
      api("POST", `/projects/${encodeURIComponent(projectId)}/invitations`, {
        body: failIfInvalid(CreateProjectInvitationInput, input),
        schema: ProjectInvitationResponse,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId, "invitations"] }),
  });
}
