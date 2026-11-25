/**
 * Development fixtures for the contractor's writes. They change the in-memory demo world and refuse
 * what the real API refuses (docs/API.md): duplicate challans, usage over stock, attendance twice,
 * no-op corrections. Requests and responses go through the shared schemas.
 */
import type { ZodType } from "zod";
import { AdjustmentResponse, CreateAdjustmentInput } from "@/shared/schemas/adjustments";
import { AttendanceResponse, CreateAttendanceInput } from "@/shared/schemas/attendance";
import { CreateDeliveryInput, DeliveryResponse } from "@/shared/schemas/deliveries";
import { CreateUsageInput, UsageResponse } from "@/shared/schemas/usages";
import { CreateWagePaymentInput, WagePaymentResponse } from "@/shared/schemas/wages";
import { allow, world } from "./routes";
import { MockError, type MockRoute } from "./types";
import { balanceOf, type DemoWorld, demoPeople, qtyOf } from "./world";

let counter = 0;
const newId = (w: DemoWorld, prefix: string) =>
  `${w.projectId}-${prefix}n${Date.now().toString(36)}${++counter}`;
const now = () => new Date().toISOString();
const normalise = (s: string) => s.trim().toLowerCase();

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new MockError(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message ?? "Check the form",
      result.error.issues,
    );
  }
  return result.data;
}

function material(w: DemoWorld, materialId: string) {
  const m = w.materials.find((x) => x.id === materialId);
  if (!m) throw new MockError(404, "NOT_FOUND", "Material not found");
  return m;
}

function log(
  w: DemoWorld,
  entity: "delivery" | "usage" | "attendance" | "wagePayment" | "adjustment",
  entityId: string,
  action: "created" | "corrected" = "created",
) {
  w.activity.unshift({
    id: `${entityId}-a`,
    actor: demoPeople.contractor,
    action,
    entity,
    entityId,
    createdAt: now(),
  });
}

export const writeRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/projects/:id/deliveries",
    respond: ({ params, body }) => {
      allow(params.id, ["contractor"]);
      const w = world(params.id);
      const input = parse(CreateDeliveryInput, body);
      material(w, input.materialId);
      const duplicate = w.movements.some(
        (m) =>
          m.type === "delivery" &&
          normalise(m.supplier) === normalise(input.supplier) &&
          normalise(m.challanNo) === normalise(input.challanNo),
      );
      if (duplicate)
        throw new MockError(
          409,
          "DUPLICATE_CHALLAN",
          `Challan ${input.challanNo} from ${input.supplier} is already logged`,
        );
      const id = newId(w, "mv");
      w.movements.push({
        id,
        materialId: input.materialId,
        occurredOn: input.occurredOn,
        createdAt: now(),
        note: input.note ?? null,
        type: "delivery",
        qty: input.qty,
        supplier: input.supplier.trim(),
        challanNo: input.challanNo.trim(),
        unitCostPaise: input.unitCostPaise,
      });
      log(w, "delivery", id);
      return DeliveryResponse.parse({
        id,
        materialId: input.materialId,
        qty: input.qty,
        unitCostPaise: input.unitCostPaise,
        supplier: input.supplier.trim(),
        challanNo: input.challanNo.trim(),
        occurredOn: input.occurredOn,
        note: input.note ?? null,
        balance: balanceOf(w, input.materialId),
      });
    },
  },
  {
    method: "POST",
    path: "/projects/:id/usages",
    respond: ({ params, body }) => {
      allow(params.id, ["contractor"]);
      const w = world(params.id);
      const input = parse(CreateUsageInput, body);
      const m = material(w, input.materialId);
      const balance = balanceOf(w, input.materialId);
      if (input.qty > balance) {
        throw new MockError(
          409,
          "INSUFFICIENT_STOCK",
          `Only ${balance} ${m.unit} of ${m.name} in stock`,
          { materialId: m.id, balance },
        );
      }
      const id = newId(w, "mv");
      w.movements.push({
        id,
        materialId: input.materialId,
        occurredOn: input.occurredOn,
        createdAt: now(),
        note: input.note ?? null,
        type: "usage",
        qty: -input.qty,
      });
      log(w, "usage", id);
      return UsageResponse.parse({
        id,
        materialId: input.materialId,
        qty: input.qty,
        occurredOn: input.occurredOn,
        note: input.note ?? null,
        balance: balanceOf(w, input.materialId),
      });
    },
  },
  {
    method: "POST",
    path: "/projects/:id/attendance",
    respond: ({ params, body }) => {
      allow(params.id, ["contractor"]);
      const w = world(params.id);
      const input = parse(CreateAttendanceInput, body);
      for (const e of input.entries) {
        if (!w.workers.some((x) => x.id === e.workerId))
          throw new MockError(404, "NOT_FOUND", "Worker not found");
        if (w.attendance.some((a) => a.workerId === e.workerId && a.workDate === input.workDate)) {
          throw new MockError(
            409,
            "CONFLICT",
            `Attendance for ${input.workDate} is already saved; use a fix to change it`,
          );
        }
      }
      const entries = input.entries.map((e) => {
        const rate = w.workers.find((x) => x.id === e.workerId)?.dailyRatePaise ?? 2;
        const id = newId(w, "at");
        w.attendance.push({
          id,
          workerId: e.workerId,
          workDate: input.workDate,
          halfDays: e.halfDays,
          effectiveHalfDays: e.halfDays,
          ratePaise: rate,
          createdAt: now(),
        });
        return { id, workerId: e.workerId, halfDays: e.halfDays, ratePaise: rate };
      });
      log(w, "attendance", entries[0].id);
      return AttendanceResponse.parse({ workDate: input.workDate, entries });
    },
  },
  {
    method: "POST",
    path: "/projects/:id/wage-payments",
    respond: ({ params, body }) => {
      allow(params.id, ["contractor"]);
      const w = world(params.id);
      const input = parse(CreateWagePaymentInput, body);
      if (!w.workers.some((x) => x.id === input.workerId))
        throw new MockError(404, "NOT_FOUND", "Worker not found");
      const id = newId(w, "pay");
      const record = { id, ...input, reference: input.reference ?? null };
      w.payments.push({ ...record, effectiveAmountPaise: input.amountPaise, createdAt: now() });
      log(w, "wagePayment", id);
      return WagePaymentResponse.parse(record);
    },
  },
  {
    method: "POST",
    path: "/projects/:id/adjustments",
    respond: ({ params, body }) => {
      allow(params.id, ["contractor"]);
      const w = world(params.id);
      const input = parse(CreateAdjustmentInput, body);
      const base = {
        id: newId(w, "adj"),
        targetId: input.targetId,
        reason: input.reason,
        actorId: demoPeople.contractor.id,
        createdAt: now(),
      };
      let result: unknown;
      if (input.targetTable === "stock_movements") {
        const m = w.movements.find((x) => x.id === input.targetId);
        if (!m || m.type === "adjustment")
          throw new MockError(404, "NOT_FOUND", "Delivery or usage not found");
        const old = Math.abs(qtyOf(w, m));
        if (old === input.newValue)
          throw new MockError(409, "CONFLICT", "That is already the value");
        const delta = m.type === "delivery" ? input.newValue - old : old - input.newValue;
        const balance = balanceOf(w, m.materialId);
        if (balance + delta < 0)
          throw new MockError(409, "INSUFFICIENT_STOCK", "This fix would take stock below zero", {
            materialId: m.materialId,
            balance,
          });
        w.effectiveQty.set(m.id, m.type === "delivery" ? input.newValue : -input.newValue);
        w.movements.push({
          id: newId(w, "mv"),
          materialId: m.materialId,
          occurredOn: m.occurredOn,
          createdAt: now(),
          note: "Correction",
          type: "adjustment",
          qty: Math.round(delta * 1000) / 1000,
        });
        result = {
          ...base,
          targetTable: "stock_movements",
          oldValue: old,
          newValue: input.newValue,
        };
      } else if (input.targetTable === "attendance") {
        const a = w.attendance.find((x) => x.id === input.targetId);
        if (!a) throw new MockError(404, "NOT_FOUND", "Attendance entry not found");
        if (a.effectiveHalfDays === input.newValue)
          throw new MockError(409, "CONFLICT", "That is already the value");
        result = {
          ...base,
          targetTable: "attendance",
          oldValue: a.effectiveHalfDays,
          newValue: input.newValue,
        };
        a.effectiveHalfDays = input.newValue;
      } else {
        const p = w.payments.find((x) => x.id === input.targetId);
        if (!p) throw new MockError(404, "NOT_FOUND", "Payment not found");
        if (p.effectiveAmountPaise === input.newValue)
          throw new MockError(409, "CONFLICT", "That is already the value");
        result = {
          ...base,
          targetTable: "wage_payments",
          oldValue: p.effectiveAmountPaise,
          newValue: input.newValue,
        };
        p.effectiveAmountPaise = input.newValue;
      }
      const adjustment = AdjustmentResponse.parse(result);
      w.adjustments.push(adjustment);
      log(w, "adjustment", adjustment.id, "corrected");
      return adjustment;
    },
  },
];
