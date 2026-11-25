import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { Role } from "@/shared/schemas/common";
import { user } from "./auth-schema";

export const projectRole = pgEnum("project_role", [
  Role.enum.owner,
  Role.enum.contractor,
  Role.enum.engineer,
]);
export const movementType = pgEnum("movement_type", ["delivery", "usage", "adjustment"]);
export const wagePaymentKind = pgEnum("wage_payment_kind", ["wage", "advance"]);
export const wagePaymentMode = pgEnum("wage_payment_mode", ["cash", "upi", "bank"]);
export const adjustmentTarget = pgEnum("adjustment_target", [
  "stock_movements",
  "attendance",
  "wage_payments",
]);

const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });
const paise = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable(
  "projects",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    location: text().notNull(),
    startDate: date("start_date").notNull(),
    budgetPaise: paise("budget_paise").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("project_budget_paise_range", sql`${t.budgetPaise} between 0 and 9007199254740991`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: projectRole().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId, t.projectId),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    unit: text().notNull(),
    plannedQty: quantity("planned_qty").notNull(),
    unitCostPaise: paise("unit_cost_paise").notNull(),
    tolerancePct: doublePrecision("tolerance_pct").notNull(),
    lowStockQty: quantity("low_stock_qty").notNull(),
    stockQty: quantity("stock_qty").notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("materials_project_id_unique").on(t.projectId, t.id),
    check(
      "material_quantities_nonnegative",
      sql`
    ${t.plannedQty} between 0 and 99999999999.999
    and ${t.lowStockQty} between 0 and 99999999999.999
    and ${t.stockQty} between 0 and 99999999999.999`,
    ),
    check("material_cost_paise_range", sql`${t.unitCostPaise} between 0 and 9007199254740991`),
    check("material_tolerance_range", sql`${t.tolerancePct} between 0 and 100`),
  ],
);

export const workers = pgTable(
  "workers",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    category: text().notNull(),
    dailyRatePaise: paise("daily_rate_paise").notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("workers_project_id_unique").on(t.projectId, t.id),
    check(
      "worker_daily_rate_range",
      sql`${t.dailyRatePaise} between 2 and 9007199254740991 and ${t.dailyRatePaise} % 2 = 0`,
    ),
  ],
);

export const attendance = pgTable(
  "attendance",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    workerId: text("worker_id").notNull(),
    workDate: date("work_date").notNull(),
    halfDays: integer("half_days").notNull(),
    ratePaise: paise("rate_paise").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "attendance_project_worker_fk",
      columns: [t.projectId, t.workerId],
      foreignColumns: [workers.projectId, workers.id],
    }),
    unique("attendance_project_worker_date_unique").on(t.projectId, t.workerId, t.workDate),
    unique("attendance_project_id_unique").on(t.projectId, t.id),
    index("attendance_project_day_idx").on(t.projectId, t.workDate, t.workerId),
    check("attendance_half_days_valid", sql`${t.halfDays} in (0, 1, 2)`),
    check(
      "attendance_rate_paise_valid",
      sql`${t.ratePaise} between 2 and 9007199254740991 and ${t.ratePaise} % 2 = 0`,
    ),
  ],
);

export const wagePayments = pgTable(
  "wage_payments",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    workerId: text("worker_id").notNull(),
    amountPaise: paise("amount_paise").notNull(),
    kind: wagePaymentKind().notNull(),
    mode: wagePaymentMode().notNull(),
    paidOn: date("paid_on").notNull(),
    reference: text(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "wage_payments_project_worker_fk",
      columns: [t.projectId, t.workerId],
      foreignColumns: [workers.projectId, workers.id],
    }),
    unique("wage_payments_project_id_unique").on(t.projectId, t.id),
    index("wage_payments_project_day_idx").on(t.projectId, t.paidOn, t.workerId),
    index("wage_payments_worker_day_idx").on(t.projectId, t.workerId, t.paidOn),
    check("wage_payment_amount_paise_valid", sql`${t.amountPaise} between 1 and 9007199254740991`),
  ],
);

export const adjustments = pgTable(
  "adjustments",
  {
    id: text().primaryKey(),
    sequenceNo: bigint("sequence_no", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    targetTable: adjustmentTarget("target_table").notNull(),
    targetId: text("target_id").notNull(),
    oldValue: numeric("old_value", { precision: 20, scale: 3 }).notNull(),
    newValue: numeric("new_value", { precision: 20, scale: 3 }).notNull(),
    reason: text().notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("adjustments_sequence_no_unique").on(t.sequenceNo),
    index("adjustments_project_sequence_idx").on(t.projectId, t.sequenceNo),
    index("adjustments_effective_target_idx").on(
      t.projectId,
      t.targetTable,
      t.targetId,
      t.sequenceNo,
    ),
    index("adjustments_project_time_idx").on(t.projectId, t.createdAt, t.sequenceNo),
    check("adjustment_values_differ", sql`${t.oldValue} <> ${t.newValue}`),
    check(
      "adjustment_values_match_target",
      sql`(
        (${t.targetTable} = 'stock_movements' and ${t.oldValue} between 0 and 99999999999.999
          and ${t.newValue} between 0 and 99999999999.999) or
        (${t.targetTable} = 'attendance' and ${t.oldValue} in (0, 1, 2) and ${t.newValue} in (0, 1, 2)) or
        (${t.targetTable} = 'wage_payments'
          and ${t.oldValue} between 1 and 9007199254740991 and ${t.newValue} between 1 and 9007199254740991
          and ${t.oldValue} = trunc(${t.oldValue}) and ${t.newValue} = trunc(${t.newValue}))
      )`,
    ),
    check("adjustment_reason_valid", sql`length(btrim(${t.reason})) between 10 and 2000`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    materialId: text("material_id").notNull(),
    type: movementType().notNull(),
    qty: quantity("qty").notNull(),
    unitCostPaise: paise("unit_cost_paise"),
    supplier: text(),
    challanNo: text("challan_no"),
    note: text(),
    occurredOn: date("occurred_on").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "stock_movement_project_material_fk",
      columns: [t.projectId, t.materialId],
      foreignColumns: [materials.projectId, materials.id],
    }),
    index("stock_movements_project_day_idx").on(t.projectId, t.occurredOn, t.createdAt),
    index("stock_movements_material_idx").on(t.projectId, t.materialId),
    uniqueIndex("stock_delivery_supplier_challan_unique")
      .on(t.projectId, sql`lower(btrim(${t.supplier}))`, sql`lower(btrim(${t.challanNo}))`)
      .where(sql`${t.type} = 'delivery'`),
    check(
      "stock_movement_shape",
      sql`
    ${t.qty} between -99999999999.999 and 99999999999.999 and (
      (${t.type} = 'delivery' and ${t.qty} > 0 and nullif(btrim(${t.supplier}), '') is not null
        and nullif(btrim(${t.challanNo}), '') is not null and ${t.unitCostPaise} is not null
        and ${t.unitCostPaise} between 0 and 9007199254740991) or
      (${t.type} in ('usage', 'adjustment') and ${t.qty} <> 0 and
        (${t.type} <> 'usage' or ${t.qty} < 0)
        and ${t.supplier} is null and ${t.challanNo} is null and ${t.unitCostPaise} is null)
    )`,
    ),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_project_time_idx").on(t.projectId, t.createdAt)],
);
