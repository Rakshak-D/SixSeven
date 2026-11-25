import { createRoute, z } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { IdParams } from "@/shared/schemas/common";
import { WageExportContentType, WageSheetQuery, WageSheetResponse } from "@/shared/schemas/wages";
import { projectAuth, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { buildWageSheet, wageSheetCsv, wageSheetPdf } from "../services/wages";

const BinaryFile = z.string().openapi({ format: "binary" });

export const wageSheet = createRouter<AuthEnv>().openapi(
  createRoute({
    method: "get",
    path: "/projects/{id}/wage-sheet",
    tags: ["wages"],
    middleware: projectAuth,
    request: { params: IdParams, query: WageSheetQuery },
    responses: {
      200: {
        description: "Authoritative project wage report as JSON or downloadable CSV/PDF",
        content: {
          "application/json": { schema: WageSheetResponse },
          [WageExportContentType.csv]: { schema: z.string() },
          [WageExportContentType.pdf]: { schema: BinaryFile },
        },
      },
      ...projectErrors,
    },
  }),
  async (c) => {
    const { projectName, sheet } = await buildWageSheet(
      getDatabase().db,
      c.get("actor"),
      c.req.valid("param").id,
      c.req.valid("query"),
    );
    const format = c.req.valid("query").format ?? "json";
    if (format === "csv") {
      return new Response(wageSheetCsv(projectName, sheet), {
        status: 200,
        headers: {
          "Content-Type": `${WageExportContentType.csv}; charset=utf-8`,
          "Content-Disposition": `attachment; filename="wage-sheet-${sheet.from}-${sheet.to}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (format === "pdf") {
      const pdf = await wageSheetPdf(projectName, sheet);
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": WageExportContentType.pdf,
          "Content-Disposition": `attachment; filename="wage-sheet-${sheet.from}-${sheet.to}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return c.json(sheet, 200);
  },
);
