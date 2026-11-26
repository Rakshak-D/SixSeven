import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  ApproveSupplierPaymentsInput,
  ChangeSupplierBankInput,
  ChangeSupplierDelegationInput,
  CreateSupplierInput,
  CreateSupplierOrderInput,
  DecideSupplierPaymentInput,
  DelegatedPaymentsResponse,
  PauseSupplierPaymentsInput,
  SetSupplierAutopayInput,
  SupplierDelegationResponse,
  SupplierNoteInput,
  SupplierPaymentsOverview,
  SupplierPaymentsQuery,
  SupplierPaymentsResponse,
  SuppliersResponse,
  SupplierWriteResponse,
} from "@/shared/schemas/supplier-payments";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import {
  approveBankChange,
  approveDelegatedPayment,
  approveSupplier,
  changeSupplierDelegation,
  createSupplier,
  createSupplierOrder,
  decideSupplierPayments,
  getSupplierDelegation,
  listDelegatedPayments,
  listSuppliers,
  pauseSupplierPayments,
  requestBankChange,
  setSupplierAutopay,
  supplierPaymentOverview,
} from "../services/supplier-payments";

const db = () => getDatabase().db;
const mockWrite = {
  description: "Mock supplier workflow change recorded",
  content: json(SupplierWriteResponse),
};
const errors = {
  ...projectErrors,
  409: { description: "State or payment constraint conflict", content: json(ErrorResponse) },
};
const tags = ["supplier payments"];

export const supplierPaymentRoutes = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/suppliers",
      tags,
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Approved and pending suppliers", content: json(SuppliersResponse) },
        ...errors,
      },
    }),
    async (c) => c.json(await listSuppliers(db(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/suppliers",
      tags,
      middleware: projectAuth,
      request: projectBody(CreateSupplierInput),
      responses: { 201: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await createSupplier(db(), c.get("actor"), c.req.valid("param").id, c.req.valid("json")),
        201,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/suppliers/{id}/approve",
      tags,
      middleware: projectAuth,
      request: projectBody(SupplierNoteInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await approveSupplier(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json").note,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/suppliers/{id}/bank-change",
      tags,
      middleware: projectAuth,
      request: projectBody(ChangeSupplierBankInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await requestBankChange(db(), c.get("actor"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/suppliers/{id}/bank-change/approve",
      tags,
      middleware: projectAuth,
      request: projectBody(SupplierNoteInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await approveBankChange(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json").note,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/suppliers/{id}/autopay",
      tags,
      middleware: projectAuth,
      request: projectBody(SetSupplierAutopayInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await setSupplierAutopay(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/projects/{id}/autopay",
      tags,
      middleware: projectAuth,
      request: projectBody(PauseSupplierPaymentsInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await pauseSupplierPayments(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          input.paused,
          input.note,
        ),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/orders",
      tags,
      middleware: projectAuth,
      request: projectBody(CreateSupplierOrderInput),
      responses: { 201: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await createSupplierOrder(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        201,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/supplier-payments",
      tags,
      middleware: projectAuth,
      request: { params: IdParams, query: SupplierPaymentsQuery },
      responses: {
        200: {
          description: "Mock supplier payment overview",
          content: json(SupplierPaymentsOverview),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await supplierPaymentOverview(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/payments",
      tags,
      middleware: projectAuth,
      request: { params: IdParams, query: SupplierPaymentsQuery },
      responses: {
        200: { description: "Mock supplier payments", content: json(SupplierPaymentsResponse) },
        ...errors,
      },
    }),
    async (c) => {
      const overview = await supplierPaymentOverview(
        db(),
        c.get("actor"),
        c.req.valid("param").id,
        c.req.valid("query"),
      );
      return c.json(overview.payments, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/supplier-payments/{id}/decision",
      tags,
      middleware: projectAuth,
      request: projectBody(DecideSupplierPaymentInput),
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await decideSupplierPayments(
          db(),
          c.get("actor"),
          [c.req.valid("param").id],
          input.note,
          input.approve,
        ),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/payments/approve",
      tags,
      middleware: projectAuth,
      request: { body: { required: true, content: json(ApproveSupplierPaymentsInput) } },
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await decideSupplierPayments(db(), c.get("actor"), input.ids, input.note, true),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/supplier-delegation",
      tags,
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Supplier delegation", content: json(SupplierDelegationResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await getSupplierDelegation(db(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      path: "/projects/{id}/supplier-delegation",
      tags,
      middleware: projectAuth,
      request: projectBody(ChangeSupplierDelegationInput),
      responses: {
        200: { description: "Supplier delegation", content: json(SupplierDelegationResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await changeSupplierDelegation(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/delegated-payments",
      tags,
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Supplier delegation", content: json(DelegatedPaymentsResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await listDelegatedPayments(db(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/delegated-payments/{paymentId}",
      tags,
      middleware: projectAuth,
      request: {
        params: IdParams.extend({ paymentId: IdParams.shape.id }),
        body: { required: true, content: json(SupplierNoteInput) },
      },
      responses: { 200: mockWrite, ...errors },
    }),
    async (c) =>
      c.json(
        await approveDelegatedPayment(
          db(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("param").paymentId,
          c.req.valid("json").note,
        ),
        200,
      ),
  );
