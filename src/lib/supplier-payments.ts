/**
 * Owner-only supplier payments and autopay. FRONTEND-ONLY SHAPES for demo data: there is no server
 * contract yet (backend requests 16-18 and 25). Replace these with the shared schemas when they
 * exist, and move the release rules to the server: a browser must never decide a real payment.
 */
import { z } from "zod";
import {
  Id,
  IsoDate,
  Label,
  Note,
  Paise,
  PositivePaise,
  PositiveQty,
  Qty,
  Timestamp,
} from "@/shared/schemas/common";

export const AccountNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/, "Enter the account number: 9 to 18 digits.");
export const Gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z0-9]{13}$/, "Enter the 15-character GSTIN.");

export const Autopay = z.strictObject({
  enabled: z.boolean(),
  paused: z.boolean().optional(),
  perBillCapPaise: Paise,
  perWeekCapPaise: Paise,
});
export const BankChange = z.strictObject({
  accountLast4: z.string().length(4),
  requestedAt: Timestamp,
  /** Null until the owner approves; payments stay held until this time has passed. */
  effectiveAt: Timestamp.nullable(),
});
export const Supplier = z.strictObject({
  id: Id,
  name: Label,
  gstin: z.string(),
  accountLast4: z.string().length(4),
  approved: z.boolean(),
  autopay: Autopay,
  bankChange: BankChange.nullable(),
});
export const Order = z.strictObject({
  id: Id,
  supplierId: Id,
  materialId: Id,
  qty: PositiveQty,
  remainingQty: Qty,
  maxUnitPricePaise: PositivePaise,
});
export const SupplierPayment = z.strictObject({
  id: Id,
  deliveryId: Id,
  supplierName: Label,
  materialId: Id,
  qty: PositiveQty,
  unitPricePaise: PositivePaise,
  occurredOn: IsoDate,
  verifiedNote: Note,
  status: z.enum(["pending", "paid", "declined"]),
  /** What would be or was paid. Never more than the approved order allows. */
  amountPaise: Paise,
  /** Why it waits for the owner; null once autopay released it. */
  heldBecause: z.string().nullable(),
  paidBy: z.enum(["autopay", "owner"]).nullable(),
  decidedAt: Timestamp.nullable(),
  decisionNote: z.string().nullable(),
});
export const PaymentsOverview = z.strictObject({
  paused: z.boolean(),
  suppliers: z.array(Supplier),
  orders: z.array(Order),
  payments: z.array(SupplierPayment),
});
/** A delivery the engineer has not checked. No prices: the engineer sees quantities only. */
export const DeliveryToVerify = z.strictObject({
  tracksBags: z.boolean().optional(),
  deliveryId: Id,
  materialName: Label,
  unit: Label,
  qty: PositiveQty,
  supplier: Label,
  challanNo: Label,
  occurredOn: IsoDate,
});
export const DeliveriesToVerify = z.array(DeliveryToVerify);
export const Done = z.strictObject({ ok: z.literal(true) });

export const AddSupplierInput = z.strictObject({
  name: Label,
  gstin: Gstin,
  account: AccountNumber,
  note: Note,
});
export const NoteInput = z.strictObject({ note: Note });
export const BankChangeInput = z.strictObject({ account: AccountNumber, note: Note });
export const SetAutopayInput = Autopay.extend({ note: Note });
export const PauseInput = z.strictObject({ paused: z.boolean(), note: Note });
export const AddOrderInput = z.strictObject({
  supplierId: Id,
  materialId: Id,
  qty: PositiveQty,
  maxUnitPricePaise: PositivePaise,
  note: Note,
});
export const DecidePaymentInput = z.strictObject({ approve: z.boolean(), note: Note });

export type Supplier = z.infer<typeof Supplier>;
export type Order = z.infer<typeof Order>;
export type SupplierPayment = z.infer<typeof SupplierPayment>;
export type PaymentsOverview = z.infer<typeof PaymentsOverview>;
export type DeliveryToVerify = z.infer<typeof DeliveryToVerify>;

/** A changed bank account waits this long after the owner approves it. */
export const BANK_COOLDOWN_HOURS = 24;

export function bankChanging(s: Supplier, now: Date) {
  const change = s.bankChange;
  return Boolean(change && (!change.effectiveAt || new Date(change.effectiveAt) > now));
}

export type Bill = { materialId: string; qty: number; unitPricePaise: number };

/** The order that covers this supplier and material, preferring one with enough left. */
export function orderFor(orders: Order[], supplierId: string | undefined, bill: Bill) {
  const open = orders.filter(
    (o) => o.supplierId === supplierId && o.materialId === bill.materialId && o.remainingQty > 0,
  );
  return open.find((o) => o.remainingQty >= bill.qty) ?? open[0];
}

/**
 * What a verified bill is worth, and why it may not leave on its own.
 * - `blocked`: the owner cannot pay it either (no approved supplier or order, or bank changing).
 * - `held`: autopay will not release it, but the owner may.
 * The amount is never above the order: the quantity left × the lower of bill and order rate.
 */
export function releaseCheck(input: {
  bill: Bill;
  supplier: Supplier | undefined;
  orders: Order[];
  paused: boolean;
  /** Already paid to this supplier in the last 7 days. */
  weekPaidPaise: number;
  now: Date;
}): { amountPaise: number; blocked: string | null; held: string | null } {
  const { bill, supplier, paused, weekPaidPaise, now } = input;
  const stop = (blocked: string) => ({ amountPaise: 0, blocked, held: blocked });
  if (!supplier?.approved) return stop("You have not approved this supplier");
  if (bankChanging(supplier, now)) return stop("The supplier's bank details are changing");
  const order = orderFor(input.orders, supplier.id, bill);
  if (!order) return stop("No approved order covers this material");
  const amountPaise = Math.round(
    Math.min(bill.qty, order.remainingQty) * Math.min(bill.unitPricePaise, order.maxUnitPricePaise),
  );
  const { autopay } = supplier;
  const held =
    bill.unitPricePaise > order.maxUnitPricePaise
      ? "The rate is above your approved order"
      : bill.qty > order.remainingQty
        ? "More arrived than your order has left"
        : paused
          ? "Autopay is paused"
          : !autopay.enabled
            ? "Autopay is off for this supplier"
            : amountPaise > autopay.perBillCapPaise
              ? "Above the per-bill limit"
              : weekPaidPaise + amountPaise > autopay.perWeekCapPaise
                ? "Above the weekly limit"
                : null;
  return { amountPaise, blocked: null, held };
}
