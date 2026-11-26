import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import {
  deliveryVerifications,
  materials,
  projects,
  stockMovements,
  supplierOrders,
  supplierPayments,
  supplierProjectRules,
  suppliers,
} from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import {
  type ChangeSupplierBankInput,
  type CreateSupplierInput,
  type CreateSupplierOrderInput,
  type SetSupplierAutopayInput,
  SupplierPaymentsOverview,
  type SupplierPaymentsQuery,
  SuppliersResponse,
} from "@/shared/schemas/supplier-payments";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

const missing = (name: string) => new ApiError(404, ErrorCode.NOT_FOUND, `${name} not found`);
const conflict = (message: string) => new ApiError(409, ErrorCode.CONFLICT, message);
const done = { ok: true, provider: "mock" } as const;
const bankCooldownMs = 24 * 60 * 60 * 1000;

function bankPending(row: typeof suppliers.$inferSelect, now: Date) {
  return row.bankRequestedAt !== null && (!row.bankEffectiveAt || row.bankEffectiveAt > now);
}

function supplierView(row: typeof suppliers.$inferSelect, now: Date) {
  const pending = bankPending(row, now);
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    accountLast4: !pending && row.pendingLast4 ? row.pendingLast4 : row.accountLast4,
    approved: row.approvedAt !== null,
    autopay: {
      enabled: row.autopayEnabled,
      paused: row.autopayPaused,
      perBillCapPaise: row.perBillCapPaise,
      perWeekCapPaise: row.perWeekCapPaise,
    },
    bankChange:
      pending && row.bankRequestedAt && row.pendingLast4
        ? {
            accountLast4: row.pendingLast4,
            requestedAt: row.bankRequestedAt.toISOString(),
            effectiveAt: row.bankEffectiveAt?.toISOString() ?? null,
          }
        : null,
  };
}

// Serialize billing decisions without conflicting with project foreign-key checks.
async function lockProject(tx: Transaction, projectId: string) {
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("no key update");
}

async function ownerWrite<T>(
  db: Db,
  actor: Actor,
  projectId: string,
  run: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["owner"]);
    await lockProject(tx, projectId);
    return run(tx);
  });
}

async function audit(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  entity: string,
  entityId: string,
  action: string,
  note: string,
) {
  await recordAudit(tx, {
    projectId,
    actorId: actor.userId,
    entity,
    entityId,
    action,
    payload: { note, provider: "mock" },
  });
}

export async function createSupplier(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateSupplierInput,
) {
  return ownerWrite(db, actor, projectId, async (tx) => {
    const id = crypto.randomUUID();
    const [row] = await tx
      .insert(suppliers)
      .values({
        id,
        projectId,
        name: input.name,
        gstin: input.gstin,
        accountLast4: input.account.slice(-4),
      })
      .onConflictDoNothing()
      .returning({ id: suppliers.id });
    if (!row) throw conflict("Supplier name or GSTIN already exists in this project");
    await audit(tx, actor, projectId, "supplier", id, "created", input.note);
    return done;
  });
}

export async function listSuppliers(db: Db, actor: Actor, projectId: string) {
  return db.transaction(
    async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["owner"]);
      const rows = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.projectId, projectId))
        .orderBy(asc(suppliers.name), asc(suppliers.id));
      const now = new Date();
      return SuppliersResponse.parse(rows.map((row) => supplierView(row, now)));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function supplierWrite<T>(
  db: Db,
  actor: Actor,
  id: string,
  run: (tx: Transaction, row: typeof suppliers.$inferSelect) => Promise<T>,
) {
  const [candidate] = await db
    .select({ projectId: suppliers.projectId })
    .from(suppliers)
    .where(eq(suppliers.id, id));
  if (!candidate) throw missing("Supplier");
  return ownerWrite(db, actor, candidate.projectId, async (tx) => {
    const [row] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.projectId, candidate.projectId), eq(suppliers.id, id)));
    if (!row) throw missing("Supplier");
    return run(tx, row);
  });
}

export function approveSupplier(db: Db, actor: Actor, id: string, note: string) {
  return supplierWrite(db, actor, id, async (tx, row) => {
    if (row.approvedAt) throw conflict("Supplier is already approved");
    await tx.update(suppliers).set({ approvedAt: new Date() }).where(eq(suppliers.id, id));
    await audit(tx, actor, row.projectId, "supplier", id, "approved", note);
    return done;
  });
}

export function requestBankChange(
  db: Db,
  actor: Actor,
  id: string,
  input: ChangeSupplierBankInput,
) {
  return supplierWrite(db, actor, id, async (tx, row) => {
    if (!row.approvedAt) throw conflict("Approve the supplier first");
    const now = new Date();
    if (bankPending(row, now)) throw conflict("A bank change is already pending or cooling down");
    await tx
      .update(suppliers)
      .set({
        accountLast4: row.pendingLast4 ?? row.accountLast4,
        pendingLast4: input.account.slice(-4),
        bankRequestedAt: now,
        bankEffectiveAt: null,
      })
      .where(eq(suppliers.id, id));
    await audit(tx, actor, row.projectId, "supplierBankChange", id, "created", input.note);
    return done;
  });
}

export function approveBankChange(db: Db, actor: Actor, id: string, note: string) {
  return supplierWrite(db, actor, id, async (tx, row) => {
    if (!row.bankRequestedAt || row.bankEffectiveAt)
      throw conflict("No bank change is awaiting approval");
    await tx
      .update(suppliers)
      .set({ bankEffectiveAt: new Date(Date.now() + bankCooldownMs) })
      .where(eq(suppliers.id, id));
    await audit(tx, actor, row.projectId, "supplierBankChange", id, "approved", note);
    return done;
  });
}

export function setSupplierAutopay(
  db: Db,
  actor: Actor,
  id: string,
  input: SetSupplierAutopayInput,
) {
  return supplierWrite(db, actor, id, async (tx, row) => {
    if (!row.approvedAt) throw conflict("Approve the supplier first");
    await tx
      .update(suppliers)
      .set({
        autopayEnabled: input.enabled,
        autopayPaused: input.paused,
        perBillCapPaise: input.perBillCapPaise,
        perWeekCapPaise: input.perWeekCapPaise,
      })
      .where(eq(suppliers.id, id));
    await audit(tx, actor, row.projectId, "supplier", id, "updated", input.note);
    return done;
  });
}

export function pauseSupplierPayments(
  db: Db,
  actor: Actor,
  projectId: string,
  paused: boolean,
  note: string,
) {
  return ownerWrite(db, actor, projectId, async (tx) => {
    await tx
      .insert(supplierProjectRules)
      .values({ projectId, paused })
      .onConflictDoUpdate({ target: supplierProjectRules.projectId, set: { paused } });
    await audit(tx, actor, projectId, "supplierRule", projectId, "updated", note);
    return done;
  });
}

export function createSupplierOrder(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateSupplierOrderInput,
) {
  return ownerWrite(db, actor, projectId, async (tx) => {
    const [supplier] = await tx
      .select({ approved: suppliers.approvedAt })
      .from(suppliers)
      .where(and(eq(suppliers.projectId, projectId), eq(suppliers.id, input.supplierId)));
    if (!supplier) throw missing("Supplier");
    if (!supplier.approved) throw conflict("Approve the supplier first");
    const [material] = await tx
      .select({ id: materials.id, tracksBags: materials.tracksBags })
      .from(materials)
      .where(and(eq(materials.projectId, projectId), eq(materials.id, input.materialId)));
    if (!material) throw missing("Material");
    if (material.tracksBags && !Number.isInteger(input.qty))
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Orders for tracked materials require whole bags",
      );
    const id = crypto.randomUUID();
    await tx.insert(supplierOrders).values({
      id,
      projectId,
      supplierId: input.supplierId,
      materialId: input.materialId,
      qty: String(input.qty),
      remainingQty: String(input.qty),
      maxUnitPricePaise: input.maxUnitPricePaise,
    });
    await audit(tx, actor, projectId, "supplierOrder", id, "created", input.note);
    return done;
  });
}

async function billRows(
  tx: Transaction,
  projectId: string,
  query: SupplierPaymentsQuery,
  id?: string,
) {
  return tx
    .select({
      payment: supplierPayments,
      supplierName: stockMovements.supplier,
      materialId: stockMovements.materialId,
      qty: deliveryVerifications.verifiedQty,
      unitPricePaise: stockMovements.unitCostPaise,
      occurredOn: stockMovements.occurredOn,
      verifiedNote: deliveryVerifications.note,
    })
    .from(supplierPayments)
    .innerJoin(
      stockMovements,
      and(
        eq(stockMovements.projectId, supplierPayments.projectId),
        eq(stockMovements.id, supplierPayments.deliveryId),
      ),
    )
    .innerJoin(
      deliveryVerifications,
      and(
        eq(deliveryVerifications.projectId, supplierPayments.projectId),
        eq(deliveryVerifications.deliveryId, supplierPayments.deliveryId),
      ),
    )
    .where(
      and(
        eq(supplierPayments.projectId, projectId),
        query.status ? eq(supplierPayments.status, query.status) : undefined,
        id ? eq(supplierPayments.id, id) : undefined,
      ),
    )
    .orderBy(desc(supplierPayments.createdAt), asc(supplierPayments.id));
}

type Bill = Awaited<ReturnType<typeof billRows>>[number];
function billAmount(qty: string, price: number) {
  const [integer, fraction = ""] = qty.split(".");
  const thousandths = BigInt(integer) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
  const paise = (thousandths * BigInt(price) + BigInt(500)) / BigInt(1000);
  return paise > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(paise);
}

async function projectPaused(tx: Transaction, projectId: string) {
  const [rule] = await tx
    .select()
    .from(supplierProjectRules)
    .where(eq(supplierProjectRules.projectId, projectId));
  return rule?.paused ?? false;
}

async function assess(tx: Transaction, bill: Bill, method: "autopay" | "owner", now: Date) {
  const { projectId } = bill.payment;
  const held = (reason: string, amountPaise = 0) => ({ reason, amountPaise }) as const;
  if (!bill.supplierName || !bill.unitPricePaise)
    return held("Delivery rate or supplier is missing");
  const [supplier] = await tx
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.projectId, projectId),
        sql`lower(btrim(${suppliers.name})) = lower(btrim(${bill.supplierName}))`,
      ),
    );
  if (!supplier?.approvedAt) return held("Supplier needs owner approval");
  if (bankPending(supplier, now)) return held("Supplier bank change is pending or cooling down");
  const [order] = await tx
    .select()
    .from(supplierOrders)
    .where(
      and(
        eq(supplierOrders.projectId, projectId),
        eq(supplierOrders.supplierId, supplier.id),
        eq(supplierOrders.materialId, bill.materialId),
        gte(supplierOrders.remainingQty, bill.qty),
        gte(supplierOrders.maxUnitPricePaise, bill.unitPricePaise),
      ),
    )
    .orderBy(asc(supplierOrders.createdAt), asc(supplierOrders.id))
    .limit(1);
  if (!order) return held("No approved order covers the quantity and unit price");
  const amount = billAmount(bill.qty, bill.unitPricePaise);
  if (!amount) return held("Calculated amount is outside the supported paise range");
  if (
    method === "autopay" &&
    (!supplier.autopayEnabled || supplier.autopayPaused || (await projectPaused(tx, projectId)))
  )
    return held("Autopay is off or paused", amount);
  if (supplier.autopayEnabled) {
    if (amount > supplier.perBillCapPaise) return held("Supplier per-bill cap exceeded", amount);
    const [week] = await tx
      .select({ spent: sql<string>`coalesce(sum(${supplierPayments.amountPaise}),0)::text` })
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.projectId, projectId),
          eq(supplierPayments.supplierId, supplier.id),
          eq(supplierPayments.status, "paid"),
          sql`${supplierPayments.decidedAt} >= (date_trunc('week', ${now.toISOString()}::timestamptz at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`,
        ),
      );
    if (BigInt(week?.spent ?? "0") + BigInt(amount) > BigInt(supplier.perWeekCapPaise))
      return held("Supplier weekly cap exceeded", amount);
  }
  return { reason: null, amountPaise: amount, supplierId: supplier.id, orderId: order.id } as const;
}

async function release(
  tx: Transaction,
  actor: Actor,
  bill: Bill,
  method: "autopay" | "owner",
  note: string,
) {
  const now = new Date();
  const current = await assess(tx, bill, method, now);
  if (current.reason !== null) {
    if (method === "owner") throw conflict(current.reason);
    return;
  }
  const [order] = await tx
    .update(supplierOrders)
    .set({ remainingQty: sql`${supplierOrders.remainingQty} - ${bill.qty}::numeric` })
    .where(and(eq(supplierOrders.id, current.orderId), gte(supplierOrders.remainingQty, bill.qty)))
    .returning({ id: supplierOrders.id });
  if (!order) throw conflict("Approved order no longer has enough quantity");
  const [payment] = await tx
    .update(supplierPayments)
    .set({
      status: "paid",
      amountPaise: current.amountPaise,
      supplierId: current.supplierId,
      orderId: current.orderId,
      decidedAt: now,
      decisionNote: note,
      paidBy: method,
    })
    .where(and(eq(supplierPayments.id, bill.payment.id), eq(supplierPayments.status, "pending")))
    .returning({ id: supplierPayments.id });
  if (!payment) throw conflict("Supplier payment already decided");
  await audit(tx, actor, bill.payment.projectId, "supplierPayment", payment.id, "approved", note);
}

export async function queueSupplierPayment(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  deliveryId: string,
) {
  await lockProject(tx, projectId);
  const [row] = await tx
    .insert(supplierPayments)
    .values({ id: deliveryId, projectId, deliveryId })
    .onConflictDoNothing({ target: supplierPayments.deliveryId })
    .returning({ id: supplierPayments.id });
  if (!row) return;
  await audit(
    tx,
    actor,
    projectId,
    "supplierPayment",
    row.id,
    "created",
    "Verified delivery entered the mock payment queue",
  );
  const [bill] = await billRows(tx, projectId, { status: "pending" }, row.id);
  if (!bill) throw missing("Verified bill");
  await release(tx, actor, bill, "autopay", "Mock autopay released on engineer verification");
}

export async function decideSupplierPayments(
  db: Db,
  actor: Actor,
  ids: string[],
  note: string,
  approve: boolean,
) {
  const [candidate] = await db
    .select({ projectId: supplierPayments.projectId })
    .from(supplierPayments)
    .where(eq(supplierPayments.id, ids[0]));
  if (!candidate) throw missing("Supplier payment");
  return ownerWrite(db, actor, candidate.projectId, async (tx) => {
    for (const id of [...ids].sort()) {
      const [bill] = await billRows(tx, candidate.projectId, {}, id);
      if (!bill) throw missing("Supplier payment");
      if (bill.payment.status !== "pending") throw conflict("Supplier payment already decided");
      if (approve) await release(tx, actor, bill, "owner", note);
      else {
        await tx
          .update(supplierPayments)
          .set({ status: "declined", decidedAt: new Date(), decisionNote: note })
          .where(
            and(eq(supplierPayments.projectId, candidate.projectId), eq(supplierPayments.id, id)),
          );
        await audit(tx, actor, candidate.projectId, "supplierPayment", id, "rejected", note);
      }
    }
    return done;
  });
}

export async function supplierPaymentOverview(
  db: Db,
  actor: Actor,
  projectId: string,
  query: SupplierPaymentsQuery = {},
) {
  return db.transaction(
    async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["owner"]);
      const now = new Date();
      const suppliersRows = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.projectId, projectId))
        .orderBy(asc(suppliers.name), asc(suppliers.id));
      const orders = await tx
        .select()
        .from(supplierOrders)
        .where(eq(supplierOrders.projectId, projectId))
        .orderBy(asc(supplierOrders.createdAt), asc(supplierOrders.id));
      const bills = await billRows(tx, projectId, query);
      const payments = [];
      for (const bill of bills) {
        const { id, deliveryId, status, paidBy, decidedAt, decisionNote } = bill.payment;
        const current = status === "pending" ? await assess(tx, bill, "autopay", now) : null;
        payments.push({
          provider: "mock",
          id,
          deliveryId,
          supplierName: bill.supplierName,
          materialId: bill.materialId,
          qty: Number(bill.qty),
          unitPricePaise: bill.unitPricePaise,
          occurredOn: bill.occurredOn,
          verifiedNote: bill.verifiedNote,
          status,
          amountPaise: current?.amountPaise ?? bill.payment.amountPaise,
          heldBecause: current?.reason ?? null,
          paidBy,
          decidedAt: decidedAt?.toISOString() ?? null,
          decisionNote,
        });
      }
      return SupplierPaymentsOverview.parse({
        provider: "mock",
        paused: await projectPaused(tx, projectId),
        suppliers: suppliersRows.map((row) => supplierView(row, now)),
        orders: orders.map(
          ({ id, supplierId, materialId, qty, remainingQty, maxUnitPricePaise }) => ({
            id,
            supplierId,
            materialId,
            qty: Number(qty),
            remainingQty: Number(remainingQty),
            maxUnitPricePaise,
          }),
        ),
        payments,
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
