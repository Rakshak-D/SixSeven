import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import { api } from "@/lib/api/client";
import { failIfInvalid } from "@/lib/api/validate";
import { DeliveriesToVerify, Done, NoteInput, PaymentsOverview } from "@/lib/supplier-payments";
import { mocksEnabled } from "@/mocks";
import {
  DeliveryVerificationQueue,
  DeliveryVerificationResponse,
  VerifyDeliveryInput,
} from "@/shared/schemas/deliveries";
import {
  SupplierPaymentsOverview,
  SupplierWriteResponse,
} from "@/shared/schemas/supplier-payments";

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const usePayments = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: [projectId, "supplier-payments"],
    enabled,
    queryFn: () =>
      api("GET", `${projectPath(projectId)}/supplier-payments`, {
        schema: mocksEnabled ? PaymentsOverview : SupplierPaymentsOverview,
      }),
  });

export const useDeliveriesToVerify = (projectId: string) =>
  useQuery({
    queryKey: [projectId, "deliveries-to-verify"],
    queryFn: () =>
      api("GET", `${projectPath(projectId)}/deliveries-to-verify`, {
        schema: mocksEnabled ? DeliveriesToVerify : DeliveryVerificationQueue,
      }),
  });

/** One payment write. The body is checked with its input schema first. */
export function usePaymentWrite<I>(projectId: string, method: "POST" | "PUT", input: ZodType<I>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: I }) =>
      api(method, path, {
        body: failIfInvalid(input, body),
        schema: mocksEnabled ? Done : SupplierWriteResponse,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}

export function useVerifyDelivery(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: VerifyDeliveryInput }) =>
      api("POST", path, {
        body: mocksEnabled
          ? failIfInvalid(NoteInput, { note: body.note })
          : failIfInvalid(VerifyDeliveryInput, body),
        schema: mocksEnabled ? Done : DeliveryVerificationResponse,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: [projectId] }),
  });
}
