"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ZodType } from "zod";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  parseQty,
  rupeesToPaise,
  TextArea,
} from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/use-project-data";
import { usePaymentWrite } from "@/hooks/use-supplier-payments";
import type { Supplier } from "@/lib/supplier-payments";
import {
  ApproveSupplierPaymentsInput,
  ChangeSupplierBankInput,
  CreateSupplierInput,
  CreateSupplierOrderInput,
  DecideSupplierPaymentInput,
  PauseSupplierPaymentsInput,
  SetSupplierAutopayInput,
  SupplierNoteInput,
} from "@/shared/schemas/supplier-payments";

/** One text or number box of a payment form. */
type Box = { key: string; label: string; initial?: string; numeric?: boolean; hint?: string };

/**
 * Boxes plus the required note, sent as one write. `body` turns the typed text into the request;
 * the input schema's own message is shown for anything it refuses.
 */
function WriteForm<I>({
  projectId,
  method = "POST",
  path,
  schema,
  boxes = [],
  body,
  submit,
  saved,
  onDone,
  children,
}: {
  projectId: string;
  method?: "POST" | "PUT";
  path: string;
  schema: ZodType<I>;
  boxes?: Box[];
  body: (values: Record<string, string>, note: string) => unknown;
  submit: string;
  saved: string;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const write = usePaymentWrite(projectId, method, schema);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(boxes.map((b) => [b.key, b.initial ?? ""])),
  );
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string>();

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = firstProblem([
          ...boxes.map((b): [boolean, string] => [!values[b.key]?.trim(), `Fill in: ${b.label}.`]),
          [!note.trim(), "Add a note first."],
        ]);
        setProblem(found);
        if (found) return;
        write.mutate(
          { path, body: body(values, note) as I },
          {
            onSuccess: () => {
              toast.success(saved);
              onDone();
            },
          },
        );
      }}
    >
      {children}
      {boxes.map((b) => (
        <Field key={b.key} label={b.label} hint={b.hint}>
          {(id) => (
            <Input
              id={id}
              inputMode={b.numeric ? "decimal" : "text"}
              autoComplete="off"
              value={values[b.key]}
              onChange={(e) => setValues((v) => ({ ...v, [b.key]: e.target.value }))}
            />
          )}
        </Field>
      ))}
      <Field label="Your note" hint="Required.">
        {(id) => <TextArea id={id} value={note} onChange={setNote} />}
      </Field>
      <FormError error={problem ?? write.error} />
      <Button type="submit" size="lg" className="w-full" disabled={write.isPending}>
        {write.isPending ? "Saving…" : submit}
      </Button>
    </form>
  );
}

const money = (text: string) => rupeesToPaise(text) ?? -1;
const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
const supplierPath = (id: string) => `/suppliers/${encodeURIComponent(id)}`;

type Common = { projectId: string; onDone: () => void };

export function AddSupplierForm({ projectId, onDone }: Common) {
  return (
    <WriteForm
      projectId={projectId}
      path={`${projectPath(projectId)}/suppliers`}
      schema={CreateSupplierInput}
      boxes={[
        { key: "name", label: "Supplier name", hint: "As written on their bills." },
        { key: "gstin", label: "GSTIN" },
        { key: "account", label: "Synthetic bank account number", numeric: true },
      ]}
      body={(v, note) => ({ ...v, note })}
      submit="Add supplier"
      saved="Supplier added. Approve them to allow payments."
      onDone={onDone}
    />
  );
}

export function ApproveForm({ projectId, supplier, onDone }: Common & { supplier: Supplier }) {
  const bank = supplier.approved;
  return (
    <WriteForm
      projectId={projectId}
      path={`${supplierPath(supplier.id)}${bank ? "/bank-change" : ""}/approve`}
      schema={SupplierNoteInput}
      body={(_, note) => ({ note })}
      submit={bank ? "Approve new account" : "Approve supplier"}
      saved={bank ? "Approved. Payments resume in 24 hours." : "Supplier approved"}
      onDone={onDone}
    >
      <p className="text-ink-2">
        {bank
          ? `Call ${supplier.name} on a number you already have and confirm the account ending ${supplier.bankChange?.accountLast4}. Payments stay held for 24 hours after you approve.`
          : `${supplier.name} · GSTIN ${supplier.gstin} · account ending ${supplier.accountLast4}`}
      </p>
    </WriteForm>
  );
}

export function BankChangeForm({ projectId, supplier, onDone }: Common & { supplier: Supplier }) {
  return (
    <WriteForm
      projectId={projectId}
      path={`${supplierPath(supplier.id)}/bank-change`}
      schema={ChangeSupplierBankInput}
      boxes={[{ key: "account", label: "New synthetic account number", numeric: true }]}
      body={(v, note) => ({ account: v.account, note })}
      submit="Record the change"
      saved="Change recorded. Payments to this supplier are held."
      onDone={onDone}
    />
  );
}

export function AutopayForm({ projectId, supplier, onDone }: Common & { supplier: Supplier }) {
  const [enabled, setEnabled] = useState(supplier.autopay.enabled);
  const [paused, setPaused] = useState(supplier.autopay.paused ?? false);
  return (
    <WriteForm
      projectId={projectId}
      method="PUT"
      path={`${supplierPath(supplier.id)}/autopay`}
      schema={SetSupplierAutopayInput}
      boxes={[
        {
          key: "bill",
          label: "Most per bill (₹)",
          numeric: true,
          initial: String(supplier.autopay.perBillCapPaise / 100),
        },
        {
          key: "week",
          label: "Most per week (₹)",
          numeric: true,
          initial: String(supplier.autopay.perWeekCapPaise / 100),
        },
      ]}
      body={(v, note) => ({
        enabled,
        paused,
        perBillCapPaise: money(v.bill),
        perWeekCapPaise: money(v.week),
        note,
      })}
      submit="Save autopay"
      saved="Autopay saved"
      onDone={onDone}
    >
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Pay {supplier.name} automatically
      </label>
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
        />
        Pause this supplier’s autopay
      </label>
      <p className="text-[15px] text-muted-foreground">
        Only after your engineer verifies a delivery that matches your order, and never above these
        limits.
      </p>
    </WriteForm>
  );
}

export function PauseForm({ projectId, paused, onDone }: Common & { paused: boolean }) {
  return (
    <WriteForm
      projectId={projectId}
      method="PUT"
      path={`${projectPath(projectId)}/autopay`}
      schema={PauseSupplierPaymentsInput}
      body={(_, note) => ({ paused: !paused, note })}
      submit={paused ? "Resume autopay" : "Pause autopay"}
      saved={paused ? "Autopay resumed" : "Autopay paused"}
      onDone={onDone}
    />
  );
}

export function DecisionForm({
  projectId,
  paymentId,
  approve,
  summary,
  onDone,
}: Common & { paymentId: string; approve: boolean; summary: string }) {
  return (
    <WriteForm
      projectId={projectId}
      path={`/supplier-payments/${encodeURIComponent(paymentId)}/decision`}
      schema={DecideSupplierPaymentInput}
      body={(_, note) => ({ approve, note })}
      submit={approve ? "Pay (mock)" : "Decline payment"}
      saved={approve ? "Mock payment recorded" : "Payment declined"}
      onDone={onDone}
    >
      <p className="text-ink-2">{summary}</p>
    </WriteForm>
  );
}

export function BatchPaymentForm({ projectId, ids, onDone }: Common & { ids: string[] }) {
  return (
    <WriteForm
      projectId={projectId}
      path="/payments/approve"
      schema={ApproveSupplierPaymentsInput}
      body={(_, note) => ({ ids, note })}
      submit="Approve selected mock payments"
      saved="Mock payments recorded"
      onDone={onDone}
    >
      <p className="text-ink-2">
        The server checks all {ids.length} selected payments together. If any fails, the batch is
        not recorded.
      </p>
    </WriteForm>
  );
}

export function OrderForm({ projectId, supplier, onDone }: Common & { supplier: Supplier }) {
  const materials = useMaterials(projectId);
  const [picked, setPicked] = useState("");
  const materialId = picked || (materials.data?.[0]?.id ?? "");
  return (
    <WriteForm
      projectId={projectId}
      path={`${projectPath(projectId)}/orders`}
      schema={CreateSupplierOrderInput}
      boxes={[
        { key: "qty", label: "Quantity", numeric: true },
        { key: "price", label: "Highest rate per unit (₹)", numeric: true },
      ]}
      body={(v, note) => ({
        supplierId: supplier.id,
        materialId,
        qty: parseQty(v.qty) ?? -1,
        maxUnitPricePaise: money(v.price),
        note,
      })}
      submit="Approve order"
      saved="Order approved"
      onDone={onDone}
    >
      <Field label="Material">
        {(id) => (
          <NativeSelect id={id} value={materialId} onChange={setPicked}>
            {(materials.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
    </WriteForm>
  );
}
