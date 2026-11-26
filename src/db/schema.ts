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

export const projectInvitations = pgTable(
  "project_invitations",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text(),
    phone: text(),
    role: projectRole().notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id),
    acceptedBy: text("accepted_by").references(() => user.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("project_invitation_email_unique").on(t.projectId, t.email),
    unique("project_invitation_phone_unique").on(t.projectId, t.phone),
    index("project_invitation_recipient_idx").on(t.email, t.acceptedAt, t.createdAt),
    check(
      "project_invitation_recipient_canonical",
      sql`(${t.email} is not null and ${t.phone} is null and ${t.email} = lower(btrim(${t.email})) and char_length(${t.email}) between 3 and 254)
        or (${t.phone} is not null and ${t.email} is null and ${t.phone} ~ '^[+]91[6-9][0-9]{9}$')`,
    ),
    check("project_invitation_role", sql`${t.role} in ('owner', 'contractor')`),
    check(
      "project_invitation_acceptance",
      sql`(${t.acceptedBy} is null) = (${t.acceptedAt} is null) and (${t.phone} is null or ${t.acceptedAt} is null)`,
    ),
  ],
);

export const changeRequests = pgTable(
  "change_requests",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    kind: text().notNull(),
    targetId: text("target_id"),
    targetVersion: text("target_version"),
    payload: jsonb().$type<unknown>().notNull(),
    authorId: text("author_id").notNull(),
    authorRole: projectRole("author_role").notNull(),
    status: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("change_request_project_pair").on(t.projectId, t.id),
    foreignKey({
      name: "change_request_author_member",
      columns: [t.projectId, t.authorId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    index("change_request_project_queue").on(t.projectId, t.status, t.createdAt),
    index("change_request_target_lookup").on(t.projectId, t.kind, t.targetId, t.status),
    check(
      "change_request_kind",
      sql`${t.kind} in ('checklist_add','checklist_rename','checklist_remove','attendance_fix','medical_expense')`,
    ),
    check(
      "change_request_status",
      sql`${t.status} in ('pending_contractor','pending_owner','rejected_contractor','accepted','rejected_owner')`,
    ),
    check("change_request_author_role", sql`${t.authorRole} in ('engineer','contractor')`),
  ],
);

export const changeRequestEvents = pgTable(
  "change_request_events",
  {
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity().primaryKey(),
    projectId: text("project_id").notNull(),
    requestId: text("request_id").notNull(),
    kind: text().notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: projectRole("actor_role").notNull(),
    note: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "change_event_scoped_request",
      columns: [t.projectId, t.requestId],
      foreignColumns: [changeRequests.projectId, changeRequests.id],
    }),
    foreignKey({
      name: "change_event_actor_member",
      columns: [t.projectId, t.actorId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    index("change_event_request_sequence").on(t.projectId, t.requestId, t.sequence),
    uniqueIndex("change_event_final_once")
      .on(t.requestId)
      .where(sql`${t.kind} in ('owner_accepted','owner_rejected')`),
    check(
      "change_event_kind",
      sql`${t.kind} in ('created','contractor_approved','contractor_rejected','reopened','owner_accepted','owner_rejected')`,
    ),
    check("change_event_nonblank_note", sql`char_length(btrim(${t.note})) between 1 and 2000`),
  ],
);

export const medicalClaims = pgTable(
  "medical_claims",
  {
    projectId: text("project_id").notNull(),
    requestId: text("request_id").primaryKey(),
    workerId: text("worker_id").notNull(),
    billPaise: paise("bill_paise").notNull(),
    incidentOn: date("incident_on").notNull(),
    reimbursementPaise: paise("reimbursement_paise"),
  },
  (t) => [
    foreignKey({
      name: "medical_claim_request_scope",
      columns: [t.projectId, t.requestId],
      foreignColumns: [changeRequests.projectId, changeRequests.id],
    }),
    foreignKey({
      name: "medical_claim_worker_scope",
      columns: [t.projectId, t.workerId],
      foreignColumns: [workers.projectId, workers.id],
    }),
    unique("medical_claim_project_pair").on(t.projectId, t.requestId),
    check(
      "medical_claim_bill_bound",
      sql`${t.billPaise} between 1 and 9007199254740991 and
      (${t.reimbursementPaise} is null or ${t.reimbursementPaise} between 1 and ${t.billPaise})`,
    ),
  ],
);

export const medicalBillPhotos = pgTable(
  "medical_bill_photos",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    requestId: text("request_id").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "medical_photo_claim_scope",
      columns: [t.projectId, t.requestId],
      foreignColumns: [medicalClaims.projectId, medicalClaims.requestId],
    }),
    index("medical_photo_claim_idx").on(t.projectId, t.requestId),
    check("medical_photo_size_bound", sql`${t.sizeBytes} between 1 and 5000000`),
    check("medical_photo_mime", sql`${t.mime} in ('image/jpeg','image/png','image/webp')`),
    check(
      "medical_photo_capture_window",
      sql`${t.capturedAt} between ${t.receivedAt} - interval '10 minutes' and ${t.receivedAt} + interval '30 seconds'`,
    ),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: text().primaryKey(),
    tracksBags: boolean("tracks_bags").notNull().default(false),
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
    removedReason: text("removed_reason"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("workers_project_id_unique").on(t.projectId, t.id),
    check(
      "worker_removal_metadata",
      sql`(${t.removedReason} is null and ${t.removedAt} is null)
          or (not ${t.active} and ${t.removedReason} is not null and ${t.removedAt} is not null
              and char_length(btrim(${t.removedReason})) between 5 and 2000)`,
    ),
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
    unique("stock_movements_project_id_pair_unique").on(t.projectId, t.id),
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

export const deliveryVerifications = pgTable(
  "delivery_verifications",
  {
    projectId: text("project_id").notNull(),
    deliveryId: text("delivery_id").primaryKey(),
    verifiedBy: text("verified_by").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    note: text().notNull(),
    bagCodeCount: integer("bag_code_count").notNull(),
    verifiedQty: quantity("verified_qty").notNull(),
  },
  (t) => [
    unique("delivery_verification_scope").on(t.projectId, t.deliveryId),
    foreignKey({
      name: "delivery_verification_movement",
      columns: [t.projectId, t.deliveryId],
      foreignColumns: [stockMovements.projectId, stockMovements.id],
    }),
    foreignKey({
      name: "delivery_verification_actor",
      columns: [t.projectId, t.verifiedBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    check("delivery_verification_count", sql`${t.bagCodeCount} between 0 and 5000`),
    check(
      "delivery_verification_qty",
      sql`${t.verifiedQty} > 0 and (${t.bagCodeCount} = 0 or ${t.bagCodeCount} = ${t.verifiedQty})`,
    ),
  ],
);

export const materialBagCodes = pgTable(
  "material_bag_codes",
  {
    projectId: text("project_id").notNull(),
    code: text().notNull(),
    deliveryId: text("delivery_id").notNull(),
    materialId: text("material_id").notNull(),
    consumedBy: text("consumed_by"),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.code] }),
    foreignKey({
      name: "bag_code_delivery_scope",
      columns: [t.projectId, t.deliveryId],
      foreignColumns: [deliveryVerifications.projectId, deliveryVerifications.deliveryId],
    }),
    foreignKey({
      name: "bag_code_material_scope",
      columns: [t.projectId, t.materialId],
      foreignColumns: [materials.projectId, materials.id],
    }),
    foreignKey({
      name: "bag_code_usage_scope",
      columns: [t.projectId, t.consumedBy],
      foreignColumns: [stockMovements.projectId, stockMovements.id],
    }),
    check("bag_code_consumption_pair", sql`(${t.consumedBy} is null) = (${t.consumedAt} is null)`),
  ],
);

export const expectedDeliveries = pgTable(
  "expected_deliveries",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    materialId: text("material_id").notNull(),
    qty: quantity("qty").notNull(),
    supplier: text().notNull(),
    expectedOn: date("expected_on").notNull(),
    note: text(),
    status: text().$type<"pending" | "accepted" | "rejected">().notNull().default("pending"),
    deliveryId: text("delivery_id").unique(),
    rejectionReason: text("rejection_reason"),
    rescheduledOn: date("rescheduled_on"),
    decidedBy: text("decided_by").references(() => user.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "expected_deliveries_material_fk",
      columns: [t.projectId, t.materialId],
      foreignColumns: [materials.projectId, materials.id],
    }),
    foreignKey({
      name: "expected_deliveries_movement_fk",
      columns: [t.projectId, t.deliveryId],
      foreignColumns: [stockMovements.projectId, stockMovements.id],
    }),
    index("expected_deliveries_project_status_day_idx").on(
      t.projectId,
      t.status,
      t.expectedOn,
      t.id,
    ),
    check("expected_delivery_qty_positive", sql`${t.qty} > 0`),
    check(
      "expected_delivery_state",
      sql`
      (${t.status} = 'pending' and ${t.deliveryId} is null and ${t.rejectionReason} is null and ${t.rescheduledOn} is null and ${t.decidedAt} is null and ${t.decidedBy} is null)
      or (${t.status} = 'accepted' and ${t.deliveryId} is not null and ${t.rejectionReason} is null and ${t.rescheduledOn} is null and ${t.decidedAt} is not null and ${t.decidedBy} is not null)
      or (${t.status} = 'rejected' and ${t.deliveryId} is null and ${t.rejectionReason} is not null and char_length(btrim(${t.rejectionReason})) between 10 and 2000 and ${t.decidedAt} is not null and ${t.decidedBy} is not null)
    `,
    ),
  ],
);

export const deliveryChallanPhotos = pgTable(
  "delivery_challan_photos",
  {
    projectId: text("project_id").notNull(),
    deliveryId: text("delivery_id").primaryKey(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "delivery_challan_photo_movement_fk",
      columns: [t.projectId, t.deliveryId],
      foreignColumns: [stockMovements.projectId, stockMovements.id],
    }),
    check(
      "delivery_challan_photo_media",
      sql`${t.sizeBytes} between 1 and 5000000 and ${t.mime} in ('image/jpeg', 'image/png', 'image/webp')`,
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

export const expenses = pgTable(
  "expenses",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    amountPaise: paise("amount_paise").notNull(),
    occurredOn: date("occurred_on").notNull(),
    description: text().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "expenses_project_actor_fk",
      columns: [t.projectId, t.createdBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    index("expenses_project_date_idx").on(t.projectId, t.occurredOn, t.id),
    check("expense_amount_paise_valid", sql`${t.amountPaise} between 1 and 9007199254740991`),
    check("expense_description_valid", sql`length(btrim(${t.description})) between 1 and 1000`),
  ],
);

export const progressUpdates = pgTable(
  "progress_updates",
  {
    id: text().primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    note: text().notNull(),
    checklistItemId: text("checklist_item_id"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "progress_updates_project_actor_fk",
      columns: [t.projectId, t.createdBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    unique("progress_updates_project_id_unique").on(t.projectId, t.id),
    unique("progress_updates_item_evidence_unique").on(t.projectId, t.checklistItemId, t.id),
    index("progress_updates_project_time_idx").on(t.projectId, t.createdAt, t.id),
    check("progress_note_valid", sql`length(btrim(${t.note})) between 1 and 2000`),
    foreignKey({
      name: "progress_checklist_project_fk",
      columns: [t.projectId, t.checklistItemId],
      foreignColumns: [checklistItems.projectId, checklistItems.id],
    }),
  ],
);

export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    progressId: text("progress_id").notNull(),
    mime: text().notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    takenOn: date("taken_on").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "progress_photos_project_update_fk",
      columns: [t.projectId, t.progressId],
      foreignColumns: [progressUpdates.projectId, progressUpdates.id],
    }),
    unique("progress_photos_storage_key_unique").on(t.storageKey),
    index("progress_photos_project_update_idx").on(t.projectId, t.progressId, t.id),
    check("progress_photo_mime_valid", sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("progress_photo_size_valid", sql`${t.sizeBytes} between 1 and 5000000`),
    check(
      "progress_photo_storage_key_valid",
      sql`${t.storageKey} ~ '^[a-f0-9-]{36}\\.(jpg|png|webp)$'`,
    ),
  ],
);

export const proposalStatus = pgEnum("proposal_status", ["pending", "approved", "rejected"]);
export const proposals = pgTable(
  "proposals",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    title: text().notNull(),
    description: text().notNull(),
    costImpactPaise: paise("cost_impact_paise").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    status: proposalStatus().notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.createdBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
      name: "proposal_creator_fk",
    }),
    foreignKey({
      columns: [t.projectId, t.decidedBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
      name: "proposal_decider_fk",
    }),
    check(
      "proposal_decision_shape",
      sql`(${t.status} = 'pending' and ${t.decidedBy} is null and ${t.decidedAt} is null) or (${t.status} <> 'pending' and ${t.decidedBy} is not null and ${t.decidedAt} is not null)`,
    ),
    check(
      "proposal_safe_cost",
      sql`${t.costImpactPaise} between -9007199254740991 and 9007199254740991`,
    ),
    index("proposal_project_time_idx").on(t.projectId, t.createdAt, t.id),
  ],
);

export const checklistDrafts = pgTable(
  "checklist_drafts",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.createdBy],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
      name: "checklist_draft_actor_fk",
    }),
    unique("checklist_draft_binding").on(t.projectId, t.id, t.createdBy),
  ],
);

export const checklistRecords = pgTable(
  "checklist_records",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    draftId: text("draft_id").notNull().unique(),
    createdBy: text("created_by").notNull(),
    title: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.draftId, t.createdBy],
      foreignColumns: [checklistDrafts.projectId, checklistDrafts.id, checklistDrafts.createdBy],
      name: "checklist_record_draft_fk",
    }),
    unique("checklist_record_project_id").on(t.projectId, t.id),
  ],
);

export const checklistPhase = pgEnum("checklist_phase", [
  "foundation",
  "plinth",
  "walls",
  "slab",
  "plumbing",
  "electrical",
  "plaster",
  "flooring",
  "finishing",
]);
export const checklistState = pgEnum("checklist_state", [
  "todo",
  "doing",
  "waiting",
  "done",
  "sent_back",
]);
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: text().primaryKey(),
    projectId: text("project_id").notNull(),
    checklistId: text("checklist_id").notNull(),
    phase: checklistPhase().notNull(),
    task: text().notNull(),
    materials: text().array().notNull(),
    position: integer().notNull(),
    state: checklistState().notNull().default("todo"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.checklistId],
      foreignColumns: [checklistRecords.projectId, checklistRecords.id],
      name: "checklist_item_record_fk",
    }),
    unique("checklist_item_project_id").on(t.projectId, t.id),
    unique("checklist_item_position").on(t.checklistId, t.position),
    check("checklist_item_task_valid", sql`length(btrim(${t.task})) between 1 and 120`),
    check("checklist_item_position_valid", sql`${t.position} between 0 and 39`),
  ],
);

export const checklistEventKind = pgEnum("checklist_event_kind", [
  "started",
  "submitted",
  "accepted",
  "sent_back",
  "added",
  "renamed",
  "removed",
]);
export const checklistEvents = pgTable(
  "checklist_events",
  {
    id: text().primaryKey(),
    sequence: integer().generatedAlwaysAsIdentity().notNull().unique(),
    projectId: text("project_id").notNull(),
    itemId: text("item_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: checklistEventKind().notNull(),
    note: text(),
    previous: text(),
    next: text(),
    progressId: text("progress_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.actorId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
      name: "checklist_event_actor_fk",
    }),
    foreignKey({
      columns: [t.projectId, t.itemId],
      foreignColumns: [checklistItems.projectId, checklistItems.id],
      name: "checklist_event_item_fk",
    }),
    foreignKey({
      columns: [t.projectId, t.itemId, t.progressId],
      foreignColumns: [
        progressUpdates.projectId,
        progressUpdates.checklistItemId,
        progressUpdates.id,
      ],
      name: "checklist_event_progress_fk",
    }),
    check(
      "checklist_event_evidence",
      sql`(${t.kind} = 'submitted') = (${t.progressId} is not null)`,
    ),
    check(
      "checklist_event_reason",
      sql`${t.kind} not in ('added', 'renamed', 'removed', 'sent_back') or ( ${t.note} is not null and length(btrim(${t.note})) >= 10 )`,
    ),
    index("checklist_event_item_seq").on(t.projectId, t.itemId, t.sequence),
  ],
);
