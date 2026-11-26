"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Field, FormError, NativeSelect, parseQty, rupeesToPaise } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/use-project-data";
import { api } from "@/lib/api/client";
import { todayIst } from "@/lib/dates";
import { mocksEnabled } from "@/mocks";
import {
  CreateDeliveryInput,
  CreateExpectedDeliveryInput,
  DeliveryResponse,
  ExpectedDeliveriesResponse,
  ExpectedDeliveryResponse,
  RejectExpectedDeliveryInput,
} from "@/shared/schemas/deliveries";

export function ExpectedDeliveries({
  projectId,
  canDecide,
}: {
  projectId: string;
  canDecide: boolean;
}) {
  const client = useQueryClient();
  const materials = useMaterials(projectId);
  const route = `/projects/${encodeURIComponent(projectId)}/expected-deliveries`;
  const list = useQuery({
    queryKey: [projectId, "expected-deliveries"],
    enabled: !mocksEnabled,
    queryFn: () => api("GET", `${route}?status=all`, { schema: ExpectedDeliveriesResponse }),
  });
  const [material, setMaterial] = useState("");
  const [supplier, setSupplier] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(todayIst);
  const materialId = material || materials.data?.[0]?.id;
  const schedule = useMutation({
    mutationFn: () =>
      api("POST", route, {
        body: CreateExpectedDeliveryInput.parse({
          materialId,
          qty: parseQty(quantity),
          supplier,
          expectedOn: date,
        }),
        schema: ExpectedDeliveryResponse,
      }),
    onSuccess: async () => {
      setQuantity("");
      setSupplier("");
      await client.invalidateQueries({ queryKey: [projectId] });
    },
  });
  if (mocksEnabled) return null;
  return (
    <section className="rounded-[1.75rem] border bg-card p-5" aria-label="Expected deliveries">
      <h2 className="text-3xl">Expected deliveries</h2>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium">Schedule delivery</summary>
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!schedule.isPending) schedule.mutate();
          }}
        >
          <Field label="Expected material">
            {(id) => (
              <NativeSelect id={id} value={materialId ?? ""} onChange={setMaterial}>
                {(materials.data ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Expected quantity">
            {(id) => (
              <Input
                id={id}
                required
                value={quantity}
                onChange={(ev) => setQuantity(ev.target.value)}
              />
            )}
          </Field>
          <Field label="Expected supplier">
            {(id) => (
              <Input
                id={id}
                required
                value={supplier}
                onChange={(ev) => setSupplier(ev.target.value)}
              />
            )}
          </Field>
          <Field label="Expected date">
            {(id) => (
              <Input
                id={id}
                type="date"
                required
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
              />
            )}
          </Field>
          <FormError error={schedule.error} />
          <Button type="submit" disabled={!materialId || schedule.isPending}>
            Save schedule
          </Button>
        </form>
      </details>
      <FormError error={list.error ?? materials.error} />
      {list.isPending ? <p className="mt-3">Loading expected deliveries…</p> : null}
      <ul className="mt-3 divide-y">
        {(list.data ?? []).map((entry) => (
          <li key={entry.id} className="space-y-2 py-2">
            <p>
              {entry.supplier} · {entry.qty} · {entry.expectedOn} · {entry.status}
            </p>
            {entry.rejectionReason ? (
              <p className="text-sm text-muted-foreground">{entry.rejectionReason}</p>
            ) : null}
            {canDecide && entry.status === "pending" ? (
              <Arrival entry={entry} projectId={projectId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Arrival({ entry, projectId }: { entry: ExpectedDeliveryResponse; projectId: string }) {
  const client = useQueryClient();
  const [quantity, setQuantity] = useState(String(entry.qty));
  const [cost, setCost] = useState("");
  const [challan, setChallan] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIst);
  const path = `/expected-deliveries/${encodeURIComponent(entry.id)}`;
  const refresh = () => client.invalidateQueries({ queryKey: [projectId] });
  const accept = useMutation({
    mutationFn: () =>
      api("POST", `${path}/accept`, {
        body: CreateDeliveryInput.parse({
          materialId: entry.materialId,
          supplier: entry.supplier,
          qty: parseQty(quantity),
          unitCostPaise: rupeesToPaise(cost),
          challanNo: challan,
          occurredOn: date,
          note,
        }),
        schema: DeliveryResponse,
      }),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: () =>
      api("POST", `${path}/reject`, {
        body: RejectExpectedDeliveryInput.parse({ reason }),
        schema: ExpectedDeliveryResponse,
      }),
    onSuccess: refresh,
  });
  const busy = accept.isPending || reject.isPending;
  return (
    <details>
      <summary className="cursor-pointer font-medium">Record arrival or rejection</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) accept.mutate();
        }}
      >
        <Field label="Actual quantity">
          {(id) => (
            <Input
              id={id}
              required
              value={quantity}
              onChange={(ev) => setQuantity(ev.target.value)}
            />
          )}
        </Field>
        <Field label="Unit cost (₹)">
          {(id) => (
            <Input id={id} required value={cost} onChange={(ev) => setCost(ev.target.value)} />
          )}
        </Field>
        <Field label="Challan number">
          {(id) => (
            <Input
              id={id}
              required
              value={challan}
              onChange={(ev) => setChallan(ev.target.value)}
            />
          )}
        </Field>
        <Field label="Arrival date">
          {(id) => (
            <Input
              id={id}
              type="date"
              required
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
            />
          )}
        </Field>
        <Field label="Arrival note">
          {(id) => (
            <Input id={id} required value={note} onChange={(ev) => setNote(ev.target.value)} />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          Record arrival
        </Button>
      </form>
      <div className="mt-3 space-y-3">
        <Field label="Rejection reason">
          {(id) => <Input id={id} value={reason} onChange={(ev) => setReason(ev.target.value)} />}
        </Field>
        <Button
          variant="outline"
          disabled={busy || reason.trim().length < 10}
          onClick={() => reject.mutate()}
        >
          Reject expected delivery
        </Button>
      </div>
      <FormError error={accept.error ?? reject.error} />
    </details>
  );
}
