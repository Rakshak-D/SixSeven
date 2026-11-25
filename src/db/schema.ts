import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
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
