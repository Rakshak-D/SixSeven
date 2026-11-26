import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import { AssistantInput, AssistantResponse } from "@/shared/schemas/assistant";
import {
  MaterialCalculationInput,
  MaterialCalculationResponse,
} from "@/shared/schemas/material-calculation";
import { calculateMaterialEstimates } from "../ai/calculations";
import { answerAssistant, limitAssistantChat } from "../ai/chat";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { requireProjectAccess } from "../services/projects";

const database = () => getDatabase().db;

const limitInput = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) =>
      c.json(
        { error: { code: ErrorCode.VALIDATION_ERROR, message: "Assistant request is too large" } },
        413,
      ),
  });
const tooLarge = { 413: { description: "Request is too large", content: json(ErrorResponse) } };

export const aiRouter = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/ai/calculate-materials",
      middleware: [...projectAuth, limitInput(4096)],
      request: projectBody(MaterialCalculationInput),
      responses: {
        200: {
          description: "Deterministic rectangular concrete estimate",
          content: json(MaterialCalculationResponse),
        },
        ...projectErrors,
        ...tooLarge,
      },
    }),
    async (c) => {
      await requireProjectAccess(database(), c.get("actor"), c.req.valid("param").id);
      return c.json(calculateMaterialEstimates(c.req.valid("json")), 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/ai/chat",
      middleware: [...projectAuth, limitInput(512000)],
      request: projectBody(AssistantInput),
      responses: {
        200: {
          description: "Assistant answer or explicit offline state",
          content: json(AssistantResponse),
        },
        ...projectErrors,
        ...tooLarge,
        429: { description: "Request limit reached", content: json(ErrorResponse) },
        503: { description: "Provider failed", content: json(ErrorResponse) },
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      const { name, location, role } = await requireProjectAccess(
        database(),
        actor,
        c.req.valid("param").id,
      );
      limitAssistantChat(actor.userId);
      try {
        const reply = await answerAssistant(c.req.valid("json").messages, { name, location, role });
        return c.json(
          reply
            ? { source: "ai" as const, reply }
            : {
                source: "offline" as const,
                message: "Ask Slate is offline. A provider key and model are required.",
              },
          200,
        );
      } catch {
        throw new ApiError(
          503,
          ErrorCode.INTERNAL,
          "The assistant provider did not return an answer. Try again later.",
        );
      }
    },
  );
