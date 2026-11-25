import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import {
  AttendanceListQuery,
  AttendanceListResponse,
  AttendanceResponse,
  CreateAttendanceInput,
} from "@/shared/schemas/attendance";
import { IdParams } from "@/shared/schemas/common";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { listAttendance, recordAttendance } from "../services/attendance";

export const attendance = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/attendance",
      tags: ["attendance"],
      middleware: projectAuth,
      request: projectBody(CreateAttendanceInput),
      responses: {
        201: { description: "Attendance recorded", content: json(AttendanceResponse) },
        ...projectErrors,
        409: {
          description: "Attendance already exists for a worker and date",
          content: json(ErrorResponse),
        },
      },
    }),
    async (c) =>
      c.json(
        await recordAttendance(
          getDatabase().db,
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
      path: "/projects/{id}/attendance",
      tags: ["attendance"],
      middleware: projectAuth,
      request: { params: IdParams, query: AttendanceListQuery },
      responses: {
        200: {
          description: "Project attendance with effective corrected values",
          content: json(AttendanceListResponse),
        },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await listAttendance(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
        200,
      ),
  );
