import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { ApiClientError, api } from "@/lib/api/client";
import { ActivityResponse } from "@/shared/schemas/activity";
import {
  AdjustmentListResponse,
  AdjustmentResponse,
  CreateAdjustmentInput,
} from "@/shared/schemas/adjustments";
import {
  AttendanceListResponse,
  AttendanceResponse,
  CreateAttendanceInput,
} from "@/shared/schemas/attendance";
import { ChecklistsResponse } from "@/shared/schemas/checklist";
import { CreateDeliveryInput, DeliveryResponse } from "@/shared/schemas/deliveries";
import { MaterialsResponse } from "@/shared/schemas/materials";
import { TimelineResponse } from "@/shared/schemas/progress";
import { ProposalResponse, ProposalsResponse } from "@/shared/schemas/proposals";
import { StockMovementsResponse, StockResponse } from "@/shared/schemas/stock";
import { SummaryResponse } from "@/shared/schemas/summary";
import { CreateUsageInput, UsageResponse } from "@/shared/schemas/usages";
import {
  CreateWagePaymentInput,
  WagePaymentListResponse,
  WagePaymentResponse,
  WageSheetResponse,
} from "@/shared/schemas/wages";
import { WorkersResponse } from "@/shared/schemas/workers";

/** One query per API read, keyed by project, each parsed with its shared response schema. */
const base = (id: string) => `/projects/${encodeURIComponent(id)}`;

function range(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const useSummary = (id: string) =>
  useQuery({
    queryKey: [id, "summary"],
    queryFn: () => api("GET", `${base(id)}/summary`, { schema: SummaryResponse }),
  });

export const useMaterials = (id: string) =>
  useQuery({
    queryKey: [id, "materials"],
    queryFn: () => api("GET", `${base(id)}/materials`, { schema: MaterialsResponse }),
  });

export const useWorkers = (id: string, enabled = true) =>
  useQuery({
    queryKey: [id, "workers"],
    enabled,
    queryFn: () => api("GET", `${base(id)}/workers`, { schema: WorkersResponse }),
  });

export const useStock = (id: string) =>
  useQuery({
    queryKey: [id, "stock"],
    queryFn: () => api("GET", `${base(id)}/stock`, { schema: StockResponse }),
  });

export const useMovements = (id: string) =>
  useQuery({
    queryKey: [id, "movements"],
    queryFn: () => api("GET", `${base(id)}/movements`, { schema: StockMovementsResponse }),
  });

export const useAttendance = (id: string, enabled = true, from?: string, to?: string) =>
  useQuery({
    queryKey: [id, "attendance", from, to],
    enabled,
    queryFn: () =>
      api("GET", `${base(id)}/attendance${range(from, to)}`, { schema: AttendanceListResponse }),
  });

export const useWagePayments = (id: string, enabled = true) =>
  useQuery({
    queryKey: [id, "wage-payments"],
    enabled,
    queryFn: () => api("GET", `${base(id)}/wage-payments`, { schema: WagePaymentListResponse }),
  });

export const useAdjustments = (id: string, enabled = true) =>
  useQuery({
    queryKey: [id, "adjustments"],
    enabled,
    queryFn: () => api("GET", `${base(id)}/adjustments`, { schema: AdjustmentListResponse }),
  });

export const useWageSheet = (id: string, from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: [id, "wage-sheet", from, to],
    enabled,
    queryFn: () =>
      api("GET", `${base(id)}/wage-sheet${range(from, to)}`, { schema: WageSheetResponse }),
  });

export const useTimeline = (id: string) =>
  useQuery({
    queryKey: [id, "timeline"],
    queryFn: () => api("GET", `${base(id)}/timeline`, { schema: TimelineResponse }),
  });

export const useActivity = (id: string) =>
  useQuery({
    queryKey: [id, "activity"],
    queryFn: () => api("GET", `${base(id)}/activity`, { schema: ActivityResponse }),
  });

export const useProposals = (id: string) =>
  useQuery({
    queryKey: [id, "proposals"],
    queryFn: () => api("GET", `${base(id)}/proposals`, { schema: ProposalsResponse }),
  });

export const useChecklists = (id: string) =>
  useQuery({
    queryKey: [id, "checklists"],
    queryFn: () => api("GET", `${base(id)}/checklists`, { schema: ChecklistsResponse }),
  });

/** Owner approves or rejects a pending proposal; refreshes proposals and activity after. */
export function useDecideProposal(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      proposalId,
      decision,
    }: {
      proposalId: string;
      decision: "approve" | "reject";
    }) =>
      api("POST", `/proposals/${encodeURIComponent(proposalId)}/decision`, {
        body: { decision },
        schema: ProposalResponse,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [projectId, "proposals"] });
      client.invalidateQueries({ queryKey: [projectId, "activity"] });
    },
  });
}

/**
 * A POST to a project route: validates the body with the shared input schema first (so the form can
 * show the contract's own message), parses the response, then refreshes everything for that project.
 */
function useProjectPost<I, O>(
  projectId: string,
  path: string,
  input: ZodType<I>,
  output: ZodType<O>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: I) => {
      const checked = input.safeParse(body);
      if (!checked.success) {
        return Promise.reject(
          new ApiClientError(
            400,
            "VALIDATION_ERROR",
            checked.error.issues[0]?.message ?? "Check the form",
            checked.error.issues,
          ),
        );
      }
      return api("POST", `${base(projectId)}${path}`, { body: checked.data, schema: output });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}

export const useCreateDelivery = (id: string) =>
  useProjectPost(id, "/deliveries", CreateDeliveryInput, DeliveryResponse);
export const useCreateUsage = (id: string) =>
  useProjectPost(id, "/usages", CreateUsageInput, UsageResponse);
export const useCreateAttendance = (id: string) =>
  useProjectPost(id, "/attendance", CreateAttendanceInput, AttendanceResponse);
export const useCreateWagePayment = (id: string) =>
  useProjectPost(id, "/wage-payments", CreateWagePaymentInput, WagePaymentResponse);
export const useCreateAdjustment = (id: string) =>
  useProjectPost(id, "/adjustments", CreateAdjustmentInput, AdjustmentResponse);
