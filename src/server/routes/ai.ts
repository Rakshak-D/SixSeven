import { createRoute, z } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { calculateMaterialEstimates, MaterialCalculationSchema } from "../ai/calculations";
import { streamAssistantChat } from "../ai/chat";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import { requireProjectAccess } from "../services/projects";

const database = () => getDatabase().db;

const CalculateMaterialInput = z.strictObject({
  structureType: z.string().min(2).max(100).describe("e.g. RCC Slab, Brick Masonry Wall, Footing"),
  dimensionsDescription: z
    .string()
    .min(3)
    .max(500)
    .describe("e.g. 30ft x 40ft x 5inch or 12m x 6m x 0.15m"),
  customMixRatio: z.string().max(50).optional().describe("e.g. M20 (1:1.5:3)"),
  wasteMarginPercent: z
    .number()
    .min(0)
    .max(50)
    .optional()
    .describe("Percentage buffer for site wastage"),
});

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
});

const ChatInputSchema = z.strictObject({
  messages: z.array(ChatMessageSchema).min(1).max(50),
  projectContext: z
    .object({
      name: z.string().optional(),
      location: z.string().optional(),
      role: z.string().optional(),
    })
    .optional(),
});

export const aiRouter = createRouter()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/ai/calculate-materials",
      middleware: projectAuth,
      request: projectBody(CalculateMaterialInput),
      responses: {
        200: {
          description: "Calculated structural material estimates",
          content: json(
            z.object({
              source: z.enum(["ai", "fallback"]),
              calculation: MaterialCalculationSchema.nullable(),
              message: z.string().optional(),
            }),
          ),
        },
        ...projectErrors,
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      const projectId = c.req.valid("param").id;
      await requireProjectAccess(database(), actor, projectId, ["owner", "contractor", "engineer"]);

      const input = c.req.valid("json");
      const calculation = await calculateMaterialEstimates({
        structureType: input.structureType,
        dimensionsDescription: input.dimensionsDescription,
        customMixRatio: input.customMixRatio,
        wasteMarginPercent: input.wasteMarginPercent,
      });

      if (!calculation) {
        return c.json(
          {
            source: "fallback" as const,
            calculation: null,
            message:
              "AI calculation provider is not configured or unavailable. Set AI_API_KEY in .env.",
          },
          200,
        );
      }

      return c.json(
        {
          source: "ai" as const,
          calculation,
        },
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/ai/chat",
      middleware: projectAuth,
      request: projectBody(ChatInputSchema),
      responses: {
        200: {
          description: "AI assistant response payload",
          content: json(
            z.object({
              reply: z.string(),
            }),
          ),
        },
        ...projectErrors,
      },
    }),
    async (c) => {
      const actor = c.get("actor");
      const projectId = c.req.valid("param").id;
      const membership = await requireProjectAccess(database(), actor, projectId, [
        "owner",
        "contractor",
        "engineer",
      ]);

      const input = c.req.valid("json");
      const stream = await streamAssistantChat({
        messages: input.messages,
        projectContext: {
          ...input.projectContext,
          role: membership.role,
        },
      });

      if (!stream) {
        return c.json(
          {
            reply:
              "AI Copilot is in offline mode (AI_API_KEY is not set). You can still view automated template checklists and standard calculations in your project.",
          },
          200,
        );
      }

      const text = await stream.text;
      return c.json({ reply: text }, 200);
    },
  );
