/**
 * Demo supplier payments. MOCK PAYMENTS: no money moves and Slate never holds money. Only the owner
 * can read or change any of this; the engineer can only verify that a delivery arrived. The
 * contractor gets 403 on every route here.
 */
import {
  AddOrderInput,
  AddSupplierInput,
  BANK_COOLDOWN_HOURS,
  BankChangeInput,
  DecidePaymentInput,
  DeliveriesToVerify,
  Done,
  NoteInput,
  PaymentsOverview as Overview,
  orderFor,
  PauseInput,
  type PaymentsOverview,
  releaseCheck,
  SetAutopayInput,
  type Supplier,
  type SupplierPayment,
} from "@/lib/supplier-payments";
import { allow, world } from "./routes";
import { MockError, type MockRoute, mockId, parseBody } from "./types";
import { type DemoWorld, qtyOf } from "./world";

type State = PaymentsOverview & { verified: Set<string> };
type Delivery = Extract<DemoWorld["movements"][number], { type: "delivery" }>;

const states = new Map<string, State>();
const done = () => Done.parse({ ok: true });
const conflict = (message: string) => new MockError(409, "CONFLICT", message);
const iso = (ms = Date.now()) => new Date(ms).toISOString();

const deliveries = (w: DemoWorld) =>
  w.movements.filter((m): m is Delivery => m.type === "delivery").reverse();
const named = (state: State, name: string) =>
  state.suppliers.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());

function weekPaid(state: State, supplierName: string, now: number) {
  return state.payments
    .filter(
      (p) =>
        p.status === "paid" &&
        p.supplierName === supplierName &&
        p.decidedAt &&
        now - Date.parse(p.decidedAt) < 7 * 86_400_000,
    )
    .reduce((sum, p) => sum + p.amountPaise, 0);
}

function check(state: State, p: SupplierPayment | (Omit<SupplierPayment, "status"> & object)) {
  return releaseCheck({
    bill: { materialId: p.materialId, qty: p.qty, unitPricePaise: p.unitPricePaise },
    supplier: named(state, p.supplierName),
    orders: state.orders,
    paused: state.paused,
    weekPaidPaise: weekPaid(state, p.supplierName, Date.now()),
    now: new Date(),
  });
}

/** Takes the paid quantity off the order, so one order can never be paid twice over. */
function deductFromOrder(state: State, p: SupplierPayment) {
  const order = orderFor(state.orders, named(state, p.supplierName)?.id, p);
  if (order)
    order.remainingQty = Math.max(0, Math.round((order.remainingQty - p.qty) * 1000) / 1000);
}

/** One payment per verified delivery. It leaves by itself only when every rule passes. */
function verify(w: DemoWorld, state: State, d: Delivery, note: string) {
  if (state.verified.has(d.id)) throw conflict("This delivery is already verified");
  state.verified.add(d.id);
  const base = {
    id: mockId(w.projectId, "sp"),
    deliveryId: d.id,
    supplierName: d.supplier,
    materialId: d.materialId,
    qty: qtyOf(w, d),
    unitPricePaise: d.unitCostPaise,
    occurredOn: d.occurredOn,
    verifiedNote: note,
    paidBy: null,
    decidedAt: null,
    decisionNote: null,
    amountPaise: 0,
    heldBecause: null,
  };
  const result = check(state, base);
  const payment: SupplierPayment = {
    ...base,
    status: result.held ? "pending" : "paid",
    amountPaise: result.amountPaise,
    heldBecause: result.held,
    paidBy: result.held ? null : "autopay",
    decidedAt: result.held ? null : iso(),
  };
  if (!result.held) deductFromOrder(state, payment);
  state.payments.unshift(payment);
}

const caps = (enabled: boolean) => ({
  enabled,
  perBillCapPaise: 6_000_000,
  perWeekCapPaise: 15_000_000,
});

/** Two approved suppliers from the demo deliveries and one waiting, with a few verified bills. */
function seed(w: DemoWorld): State {
  const recent = deliveries(w);
  const names = [...new Set(recent.map((d) => d.supplier))].slice(0, 3);
  const suppliers: Supplier[] = names.map((name, i) => ({
    id: `${w.projectId}-sup${i + 1}`,
    name,
    gstin: `29ABCDE${1000 + i}F1Z5`,
    accountLast4: String(4821 + i * 137),
    approved: i < 2,
    autopay: caps(i === 0),
    bankChange: null,
  }));
  const orders = suppliers.slice(0, 2).flatMap((s) => {
    const last = recent.find((d) => d.supplier === s.name);
    return last
      ? [
          {
            id: `${s.id}-order`,
            supplierId: s.id,
            materialId: last.materialId,
            qty: last.qty * 4,
            remainingQty: last.qty * 3,
            maxUnitPricePaise: last.unitCostPaise,
          },
        ]
      : [];
  });
  const state: State = { paused: false, suppliers, orders, payments: [], verified: new Set() };
  // Older deliveries count as already settled; the newest few show each outcome.
  for (const d of recent.slice(6)) state.verified.add(d.id);
  for (const s of suppliers) {
    const d = recent.slice(0, 6).find((x) => x.supplier === s.name);
    if (d) verify(w, state, d, "Counted at the gate, matches the challan.");
  }
  return state;
}

function stateOf(projectId: string) {
  let state = states.get(projectId);
  if (!state) {
    state = seed(world(projectId));
    states.set(projectId, state);
  }
  return state;
}

const ownerState = (projectId: string) => {
  allow(projectId, ["owner"]);
  return stateOf(projectId);
};

/** Finds the project holding a supplier or payment id, for routes that name only the record. */
function holding(id: string) {
  const projectId = [...states.keys()].find((key) => id.startsWith(`${key}-`));
  if (!projectId) throw new MockError(404, "NOT_FOUND", "Not found");
  return { projectId, state: ownerState(projectId) };
}
function supplierById(id: string) {
  const { state } = holding(id);
  const supplier = state.suppliers.find((s) => s.id === id);
  if (!supplier) throw new MockError(404, "NOT_FOUND", "Supplier not found");
  return supplier;
}

export const supplierRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/projects/:id/supplier-payments",
    respond: ({ params }) => {
      const state = ownerState(params.id);
      // A waiting bill is judged again on every read: approving a supplier or an order can make it
      // payable. It still waits for the owner; autopay never releases it after the fact.
      for (const p of state.payments) {
        if (p.status !== "pending") continue;
        const result = check(state, p);
        p.amountPaise = result.amountPaise;
        p.heldBecause = result.held ?? "Waiting for your approval";
      }
      const { verified: _, ...overview } = state;
      return Overview.parse(overview);
    },
  },
  {
    method: "POST",
    path: "/projects/:id/suppliers",
    respond: ({ params, body }) => {
      const state = ownerState(params.id);
      const input = parseBody(AddSupplierInput, body);
      if (named(state, input.name)) throw conflict("That supplier is already listed");
      state.suppliers.push({
        id: mockId(params.id, "sup"),
        name: input.name,
        gstin: input.gstin,
        accountLast4: input.account.slice(-4),
        approved: false,
        autopay: caps(false),
        bankChange: null,
      });
      return done();
    },
  },
  {
    method: "POST",
    path: "/suppliers/:id/approve",
    respond: ({ params, body }) => {
      const supplier = supplierById(params.id);
      parseBody(NoteInput, body);
      if (supplier.approved) throw conflict("Already approved");
      supplier.approved = true;
      return done();
    },
  },
  {
    method: "POST",
    path: "/suppliers/:id/bank-change",
    respond: ({ params, body }) => {
      const supplier = supplierById(params.id);
      const input = parseBody(BankChangeInput, body);
      supplier.bankChange = {
        accountLast4: input.account.slice(-4),
        requestedAt: iso(),
        effectiveAt: null,
      };
      return done();
    },
  },
  {
    method: "POST",
    path: "/suppliers/:id/bank-change/approve",
    respond: ({ params, body }) => {
      const supplier = supplierById(params.id);
      parseBody(NoteInput, body);
      const change = supplier.bankChange;
      if (!change || change.effectiveAt) throw conflict("No bank change is waiting for approval");
      change.effectiveAt = iso(Date.now() + BANK_COOLDOWN_HOURS * 3_600_000);
      return done();
    },
  },
  {
    method: "PUT",
    path: "/suppliers/:id/autopay",
    respond: ({ params, body }) => {
      const supplier = supplierById(params.id);
      const { note: _, ...autopay } = parseBody(SetAutopayInput, body);
      if (!supplier.approved) throw conflict("Approve the supplier first");
      supplier.autopay = autopay;
      return done();
    },
  },
  {
    method: "PUT",
    path: "/projects/:id/autopay",
    respond: ({ params, body }) => {
      const state = ownerState(params.id);
      state.paused = parseBody(PauseInput, body).paused;
      return done();
    },
  },
  {
    method: "POST",
    path: "/projects/:id/orders",
    respond: ({ params, body }) => {
      const state = ownerState(params.id);
      const { note: _, ...input } = parseBody(AddOrderInput, body);
      if (!state.suppliers.find((s) => s.id === input.supplierId)?.approved)
        throw conflict("Approve the supplier first");
      state.orders.push({ ...input, id: mockId(params.id, "order"), remainingQty: input.qty });
      return done();
    },
  },
  {
    method: "POST",
    path: "/supplier-payments/:id/decision",
    respond: ({ params, body }) => {
      const { state } = holding(params.id);
      const payment = state.payments.find((p) => p.id === params.id);
      if (!payment) throw new MockError(404, "NOT_FOUND", "Payment not found");
      const { approve, note } = parseBody(DecidePaymentInput, body);
      if (payment.status !== "pending") throw conflict("This payment was already decided");
      if (approve) {
        // Checked again now: the order, supplier or bank details may have changed since.
        const result = check(state, payment);
        if (result.blocked) throw conflict(result.blocked);
        payment.amountPaise = result.amountPaise;
        deductFromOrder(state, payment);
      }
      payment.status = approve ? "paid" : "declined";
      payment.paidBy = approve ? "owner" : null;
      payment.decidedAt = iso();
      payment.decisionNote = note;
      return done();
    },
  },
  {
    method: "GET",
    path: "/projects/:id/deliveries-to-verify",
    respond: ({ params }) => {
      allow(params.id, ["engineer"]);
      const w = world(params.id);
      const state = stateOf(params.id);
      return DeliveriesToVerify.parse(
        deliveries(w)
          .filter((d) => !state.verified.has(d.id))
          .map((d) => {
            const material = w.materials.find((m) => m.id === d.materialId);
            return {
              deliveryId: d.id,
              materialName: material?.name ?? "Material",
              unit: material?.unit ?? "units",
              qty: qtyOf(w, d),
              supplier: d.supplier,
              challanNo: d.challanNo,
              occurredOn: d.occurredOn,
            };
          }),
      );
    },
  },
  {
    method: "POST",
    path: "/projects/:id/deliveries/:deliveryId/verify",
    respond: ({ params, body }) => {
      allow(params.id, ["engineer"]);
      const w = world(params.id);
      const delivery = deliveries(w).find((d) => d.id === params.deliveryId);
      if (!delivery) throw new MockError(404, "NOT_FOUND", "Delivery not found");
      verify(w, stateOf(params.id), delivery, parseBody(NoteInput, body).note);
      // The engineer learns nothing about the payment.
      return done();
    },
  },
];
