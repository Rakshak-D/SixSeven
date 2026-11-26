"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMaterials } from "@/hooks/use-project-data";
import { usePayments } from "@/hooks/use-supplier-payments";
import { istDateOf } from "@/lib/dates";
import { formatPaise, formatQty, formatShortDate, formatTimeIst } from "@/lib/format";
import {
  bankChanging,
  type PaymentsOverview,
  type Supplier,
  type SupplierPayment,
} from "@/lib/supplier-payments";
import {
  AddSupplierForm,
  ApproveForm,
  AutopayForm,
  BankChangeForm,
  DecisionForm,
  OrderForm,
  PauseForm,
} from "./supplier-forms";

const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";
const HISTORY = 6;

type Open =
  | { kind: "add" }
  | { kind: "pause" }
  | { kind: "approve" | "bank" | "autopay" | "order"; supplier: Supplier }
  | { kind: "decide"; payment: SupplierPayment; approve: boolean };

const titles: Record<Open["kind"], string> = {
  add: "Add a supplier",
  pause: "Autopay",
  approve: "Check and approve",
  bank: "Bank account changed",
  autopay: "Autopay limits",
  order: "Approve an order",
  decide: "Your decision",
};

/** Owner only: who may be paid, the limits, what is waiting and what has been paid. All mock. */
export function SupplierPayments({ projectId }: { projectId: string }) {
  const overview = usePayments(projectId);
  const materials = useMaterials(projectId);
  const [open, setOpen] = useState<Open | null>(null);

  if (overview.isPending) return <Skeleton className="h-96 rounded-[1.75rem]" />;
  if (overview.isError) return <FormError error={overview.error} />;

  const { paused, suppliers, orders, payments }: PaymentsOverview = overview.data;
  const waiting = payments.filter((p) => p.status === "pending");
  const settled = payments.filter((p) => p.status !== "pending").slice(0, HISTORY);
  const material = (id: string) => materials.data?.find((m) => m.id === id);
  const billLine = (p: SupplierPayment) =>
    `${material(p.materialId)?.name ?? "Material"} · ${formatQty(p.qty)} at ${formatPaise(p.unitPricePaise)} = ${formatPaise(Math.round(p.qty * p.unitPricePaise))}`;
  const now = new Date();
  const changing = suppliers.filter((s) => bankChanging(s, now));
  const close = () => setOpen(null);

  return (
    <div className="space-y-6">
      <p className="rounded-2xl border border-warning/50 bg-warning/10 px-4 py-3 font-semibold text-[15px]">
        Mock supplier payments. No real money moves, and Slate never holds money.
      </p>

      {changing.map((s) => (
        <p
          key={s.id}
          role="alert"
          className="flex gap-3 rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-destructive" />
          <span>
            <b>{s.name}</b>&apos;s bank account is changing to one ending{" "}
            {s.bankChange?.accountLast4}. Payments are held
            {s.bankChange?.effectiveAt
              ? ` until ${formatShortDate(istDateOf(s.bankChange.effectiveAt))}, ${formatTimeIst(s.bankChange.effectiveAt)}.`
              : " until you approve it and 24 hours pass."}
          </span>
        </p>
      ))}

      <section className={card} aria-label="Payments waiting for you">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl">Waiting for you</h2>
          <div className="flex items-center gap-2">
            {paused ? <Badge variant="outline">Autopay paused</Badge> : null}
            <Button variant="outline" onClick={() => setOpen({ kind: "pause" })}>
              {paused ? "Resume autopay" : "Pause all autopay"}
            </Button>
          </div>
        </div>
        {waiting.length === 0 ? (
          <p className="mt-3 text-muted-foreground">No payment is waiting.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {waiting.map((p) => (
              <li key={p.id} className="py-4">
                <p className="font-semibold">{p.supplierName}</p>
                <p className="num text-[15px] text-ink-2">{billLine(p)}</p>
                <p className="text-[15px] text-muted-foreground">Engineer: “{p.verifiedNote}”</p>
                <p className="mt-1 font-semibold text-[15px] text-warning">{p.heldBecause}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Nothing can be paid without an approved supplier and order. */}
                  {p.amountPaise > 0 ? (
                    <Button onClick={() => setOpen({ kind: "decide", payment: p, approve: true })}>
                      Pay {formatPaise(p.amountPaise)}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => setOpen({ kind: "decide", payment: p, approve: false })}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-label="Suppliers">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-3xl">Suppliers</h2>
          <Button onClick={() => setOpen({ kind: "add" })}>
            <Plus aria-hidden="true" />
            Add supplier
          </Button>
        </div>
        <ul className="mt-2 divide-y">
          {suppliers.map((s) => (
            <li key={s.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                <Badge variant="outline">
                  {!s.approved ? "Not approved" : s.autopay.enabled ? "Autopay on" : "Approved"}
                </Badge>
              </div>
              <p className="num text-[15px] text-muted-foreground">
                GSTIN {s.gstin} · account ending {s.accountLast4}
              </p>
              {s.approved && s.autopay.enabled ? (
                <p className="num text-[15px] text-muted-foreground">
                  Up to {formatPaise(s.autopay.perBillCapPaise)} a bill,{" "}
                  {formatPaise(s.autopay.perWeekCapPaise)} a week
                </p>
              ) : null}
              {orders
                .filter((o) => o.supplierId === s.id)
                .map((o) => (
                  <p key={o.id} className="num text-[15px] text-ink-2">
                    Order: {material(o.materialId)?.name ?? "Material"}, {formatQty(o.remainingQty)}{" "}
                    of {formatQty(o.qty)} left, up to {formatPaise(o.maxUnitPricePaise)}
                  </p>
                ))}
              <div className="mt-3 flex flex-wrap gap-2">
                {!s.approved ? (
                  <Button size="sm" onClick={() => setOpen({ kind: "approve", supplier: s })}>
                    Approve
                  </Button>
                ) : (
                  <>
                    {s.bankChange && !s.bankChange.effectiveAt ? (
                      <Button size="sm" onClick={() => setOpen({ kind: "approve", supplier: s })}>
                        Approve new account
                      </Button>
                    ) : null}
                    {(
                      [
                        ["autopay", "Autopay"],
                        ["order", "New order"],
                        ["bank", "Bank changed"],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        size="sm"
                        variant="outline"
                        onClick={() => setOpen({ kind, supplier: s })}
                      >
                        {label}
                      </Button>
                    ))}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} aria-label="Payment history">
        <h2 className="text-3xl">Payment history</h2>
        {settled.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {settled.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{p.supplierName}</span>
                  <span className="num block text-[15px] text-muted-foreground">{billLine(p)}</span>
                  <span className="block text-[15px] text-muted-foreground">
                    {p.status === "declined"
                      ? "Declined"
                      : p.paidBy === "autopay"
                        ? "Paid by autopay (mock)"
                        : "Paid by you (mock)"}
                    {p.decidedAt ? ` · ${formatShortDate(istDateOf(p.decidedAt))}` : ""}
                    {p.decisionNote ? ` · “${p.decisionNote}”` : ""}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">
                  {p.status === "paid" ? formatPaise(p.amountPaise) : "₹0"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet
        open={open !== null}
        onOpenChange={(next) => !next && close()}
        title={open ? titles[open.kind] : ""}
      >
        {open?.kind === "add" ? <AddSupplierForm projectId={projectId} onDone={close} /> : null}
        {open?.kind === "pause" ? (
          <PauseForm projectId={projectId} paused={paused} onDone={close} />
        ) : null}
        {open?.kind === "approve" ? (
          <ApproveForm projectId={projectId} supplier={open.supplier} onDone={close} />
        ) : null}
        {open?.kind === "bank" ? (
          <BankChangeForm projectId={projectId} supplier={open.supplier} onDone={close} />
        ) : null}
        {open?.kind === "autopay" ? (
          <AutopayForm projectId={projectId} supplier={open.supplier} onDone={close} />
        ) : null}
        {open?.kind === "order" ? (
          <OrderForm projectId={projectId} supplier={open.supplier} onDone={close} />
        ) : null}
        {open?.kind === "decide" ? (
          <DecisionForm
            projectId={projectId}
            paymentId={open.payment.id}
            approve={open.approve}
            summary={`${open.payment.supplierName}: ${billLine(open.payment)}. ${open.approve ? `You pay ${formatPaise(open.payment.amountPaise)}, the most your order allows.` : "Nothing is paid."}`}
            onDone={close}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
