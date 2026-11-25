import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { api } from "@/lib/api/client";
import { failIfInvalid } from "@/lib/api/validate";
import { DeliveriesToVerify, Done, NoteInput, PaymentsOverview } from "@/lib/supplier-payments";
import { mocksEnabled } from "@/mocks";

// Demo data only: these routes have no server yet, so nothing is requested on live data.
const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const usePayments = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: [projectId, "supplier-payments"],
    enabled: enabled && mocksEnabled,
    queryFn: () =>
      api("GET", `${projectPath(projectId)}/supplier-payments`, { schema: PaymentsOverview }),
  });

export const useDeliveriesToVerify = (projectId: string) =>
  useQuery({
    queryKey: [projectId, "deliveries-to-verify"],
    enabled: mocksEnabled,
    queryFn: () =>
      api("GET", `${projectPath(projectId)}/deliveries-to-verify`, { schema: DeliveriesToVerify }),
  });

/** One payment write. The body is checked with its input schema first. */
export function usePaymentWrite<I>(projectId: string, method: "POST" | "PUT", input: ZodType<I>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: I }) =>
      api(method, path, { body: failIfInvalid(input, body), schema: Done }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}

export const useVerifyDelivery = (projectId: string) =>
  usePaymentWrite(projectId, "POST", NoteInput);
