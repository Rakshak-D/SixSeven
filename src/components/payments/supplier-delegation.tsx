"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Field, FormError, NativeSelect, rupeesToPaise } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTeam } from "@/hooks/use-team";
import { api } from "@/lib/api/client";
import { formatPaise } from "@/lib/format";
import { mocksEnabled } from "@/mocks";
import {
  ChangeSupplierDelegationInput,
  DelegatedPaymentsResponse,
  SupplierDelegationResponse,
  SupplierNoteInput,
  SupplierWriteResponse,
} from "@/shared/schemas/supplier-payments";

export function SupplierDelegation({ projectId, owner }: { projectId: string; owner: boolean }) {
  const client = useQueryClient();
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const query = useQuery({
    queryKey: [projectId, "supplier-delegation"],
    enabled: !mocksEnabled,
    queryFn: () =>
      api("GET", `${base}/supplier-delegation`, { schema: SupplierDelegationResponse }),
  });
  const team = useTeam(projectId);
  const [engineer, setEngineer] = useState("");
  const [cap, setCap] = useState("");
  const [note, setNote] = useState("");
  const refresh = async () => {
    setNote("");
    await client.invalidateQueries({ queryKey: [projectId] });
  };
  const update = useMutation({
    mutationFn: (action: "grant" | "revoke") =>
      api("PUT", `${base}/supplier-delegation`, {
        body: ChangeSupplierDelegationInput.parse(
          action === "grant"
            ? { action, engineerId: engineer, capPaise: rupeesToPaise(cap), note }
            : { action, note },
        ),
        schema: SupplierDelegationResponse,
      }),
    onSuccess: refresh,
  });
  const pending = useQuery({
    queryKey: [projectId, "delegated-payments"],
    enabled: !owner && !mocksEnabled && Boolean(query.data),
    queryFn: () => api("GET", `${base}/delegated-payments`, { schema: DelegatedPaymentsResponse }),
  });
  const approve = useMutation({
    mutationFn: (id: string) =>
      api("POST", `${base}/delegated-payments/${encodeURIComponent(id)}`, {
        body: SupplierNoteInput.parse({ note }),
        schema: SupplierWriteResponse,
      }),
    onSuccess: refresh,
  });
  if (mocksEnabled || (!owner && !query.data && !query.error)) return null;
  return (
    <section
      className="space-y-3 rounded-[1.75rem] border bg-card p-5"
      aria-label="Supplier payment delegation"
    >
      <h2 className="text-3xl">Supplier payment delegation</h2>
      <p className="text-muted-foreground">
        Mock payments only. Approved orders and supplier limits still apply.
      </p>
      {query.data ? (
        <p>Remaining delegated authority: {formatPaise(query.data.remainingPaise)}</p>
      ) : (
        <p>No active grant.</p>
      )}
      {owner ? (
        <>
          <Field label="Delegate engineer">
            {(id) => (
              <NativeSelect id={id} value={engineer} onChange={setEngineer}>
                <option value="">Select an engineer</option>
                {team.data
                  ?.filter((member) => member.role === "engineer")
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Total delegation cap (₹)">
            {(id) => <Input id={id} value={cap} onChange={(event) => setCap(event.target.value)} />}
          </Field>
        </>
      ) : null}
      <Field label={owner ? "Delegation reason" : "Mock payment note"}>
        {(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} />}
      </Field>
      {owner ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!engineer || !note.trim() || update.isPending}
            onClick={() => update.mutate("grant")}
          >
            Grant or replace authority
          </Button>
          {query.data ? (
            <Button
              variant="outline"
              disabled={!note.trim() || update.isPending}
              onClick={() => update.mutate("revoke")}
            >
              Revoke authority
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {pending.data?.map((bill) => (
            <li key={bill.id} className="flex items-center justify-between gap-2">
              <span>
                {bill.supplierName} · {formatPaise(bill.amountPaise)}
              </span>
              <Button
                disabled={!note.trim() || approve.isPending}
                onClick={() => approve.mutate(bill.id)}
              >
                Approve mock payment
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormError error={query.error ?? update.error ?? pending.error ?? approve.error} />
    </section>
  );
}
