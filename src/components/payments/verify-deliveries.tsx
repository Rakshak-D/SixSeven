"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, TextArea } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { useDeliveriesToVerify, useVerifyDelivery } from "@/hooks/use-supplier-payments";
import { formatIsoDate, formatQty } from "@/lib/format";
import type { DeliveryToVerify } from "@/lib/supplier-payments";

const SHOWN = 5;

/** The engineer confirms material really arrived. No money is shown here. */
export function VerifyDeliveries({ projectId }: { projectId: string }) {
  const list = useDeliveriesToVerify(projectId);
  const [picked, setPicked] = useState<DeliveryToVerify | null>(null);
  if (list.isError) return <FormError error={list.error} />;
  if (!list.data) return null;
  return (
    <section
      className="rounded-[1.75rem] border bg-card p-5 sm:p-6"
      aria-label="Deliveries to verify"
    >
      <h2 className="text-3xl">Deliveries to verify</h2>
      <p className="text-[15px] text-muted-foreground">
        Check the material on site before you confirm.
      </p>
      {list.data.length === 0 ? (
        <p className="mt-3 text-muted-foreground">Every delivery is checked.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {list.data.slice(0, SHOWN).map((d) => (
            <li key={d.deliveryId} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {d.materialName} · {formatQty(d.qty)} {d.unit}
                </span>
                <span className="block text-[15px] text-muted-foreground">
                  {d.supplier} · challan {d.challanNo} · {formatIsoDate(d.occurredOn)}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setPicked(d)}>
                Verify
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={picked !== null}
        onOpenChange={(open) => !open && setPicked(null)}
        title="Verify delivery"
        description="You are confirming this material is on site. It cannot be undone."
      >
        {picked ? (
          <VerifyForm
            key={picked.deliveryId}
            projectId={projectId}
            delivery={picked}
            onDone={() => setPicked(null)}
          />
        ) : null}
      </Sheet>
    </section>
  );
}

function VerifyForm({
  projectId,
  delivery,
  onDone,
}: {
  projectId: string;
  delivery: DeliveryToVerify;
  onDone: () => void;
}) {
  const verify = useVerifyDelivery(projectId);
  const [note, setNote] = useState("");
  const [codes, setCodes] = useState("");
  const bagCodes = codes.split(/\s+/).filter(Boolean);
  return (
    <div className="space-y-4">
      <p className="font-semibold">
        {delivery.materialName} · {formatQty(delivery.qty)} {delivery.unit} · challan{" "}
        {delivery.challanNo}
      </p>
      <Field label="Your note" hint="What you counted and checked.">
        {(id) => <TextArea id={id} value={note} onChange={setNote} />}
      </Field>
      {delivery.tracksBags ? (
        <Field label="Bag codes" hint="Enter one code per bag, one per line.">
          {(id) => <TextArea id={id} value={codes} onChange={setCodes} />}
        </Field>
      ) : null}
      <FormError error={verify.error} />
      <Button
        size="lg"
        className="w-full"
        disabled={
          !note.trim() ||
          verify.isPending ||
          (delivery.tracksBags && bagCodes.length !== delivery.qty)
        }
        onClick={() =>
          verify.mutate(
            {
              path: `/projects/${encodeURIComponent(projectId)}/deliveries/${encodeURIComponent(delivery.deliveryId)}/verify`,
              body: { note, ...(delivery.tracksBags ? { codes: bagCodes } : {}) },
            },
            {
              onSuccess: () => {
                toast.success("Delivery verified");
                onDone();
              },
            },
          )
        }
      >
        {verify.isPending ? "Saving…" : "It arrived as recorded"}
      </Button>
    </div>
  );
}
