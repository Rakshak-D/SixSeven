import { createRoute } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { proposals as rows } from "@/db/schema";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  CreateProposalInput,
  DecideProposalInput,
  ProposalResponse,
  ProposalsResponse,
} from "@/shared/schemas/proposals";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "../services/audit";
import { requireProjectAccess } from "../services/projects";

function publicProposal(row: typeof rows.$inferSelect) {
  const { id, title, description, costImpactPaise, status, createdAt, decidedAt } = row;
  return ProposalResponse.parse({
    id,
    title,
    description,
    costImpactPaise,
    status,
    createdAt: createdAt.toISOString(),
    decidedAt: decidedAt?.toISOString() ?? null,
  });
}

export const proposals = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/proposals",
      middleware: projectAuth,
      request: projectBody(CreateProposalInput),
      responses: {
        201: { description: "Proposal recorded", content: json(ProposalResponse) },
        ...projectErrors,
      },
    }),
    async (c) => {
      const projectId = c.req.valid("param").id;
      const actor = c.get("actor");
      return c.json(
        await getDatabase().db.transaction(async (tx) => {
          await requireProjectAccess(tx, actor, projectId, ["contractor", "engineer"]);
          const id = crypto.randomUUID();
          const [row] = await tx
            .insert(rows)
            .values({ ...c.req.valid("json"), id, projectId, createdBy: actor.userId })
            .returning();
          if (!row) throw new Error("Proposal insert did not return a row");
          await recordAudit(tx, {
            projectId,
            actorId: actor.userId,
            action: "created",
            entity: "proposal",
            entityId: id,
          });
          return publicProposal(row);
        }),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/proposals",
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Project proposals", content: json(ProposalsResponse) },
        ...projectErrors,
      },
    }),
    async (c) => {
      const { db } = getDatabase();
      const projectId = c.req.valid("param").id;
      await requireProjectAccess(db, c.get("actor"), projectId);
      const proposals = await db
        .select()
        .from(rows)
        .where(eq(rows.projectId, projectId))
        .orderBy(desc(rows.createdAt), desc(rows.id));
      return c.json(proposals.map(publicProposal), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/proposals/{id}/decision",
      middleware: projectAuth,
      request: projectBody(DecideProposalInput),
      responses: {
        200: { description: "Proposal decided", content: json(ProposalResponse) },
        ...projectErrors,
        409: { description: "Proposal already decided", content: json(ErrorResponse) },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const actor = c.get("actor");
      const status = c.req.valid("json").decision === "approve" ? "approved" : "rejected";
      return c.json(
        await getDatabase().db.transaction(async (tx) => {
          const [proposal] = await tx
            .select({ projectId: rows.projectId })
            .from(rows)
            .where(eq(rows.id, id));
          if (!proposal) throw new ApiError(404, ErrorCode.NOT_FOUND, "Proposal not found");
          const { projectId } = proposal;
          await requireProjectAccess(tx, actor, projectId, ["owner"]);
          const [row] = await tx
            .update(rows)
            .set({ status, decidedBy: actor.userId, decidedAt: new Date() })
            .where(and(eq(rows.id, id), eq(rows.projectId, projectId), eq(rows.status, "pending")))
            .returning();
          if (!row) throw new ApiError(409, ErrorCode.CONFLICT, "Proposal already decided");
          await recordAudit(tx, {
            projectId,
            actorId: actor.userId,
            action: status,
            entity: "proposal",
            entityId: id,
          });
          return publicProposal(row);
        }),
        200,
      );
    },
  );
