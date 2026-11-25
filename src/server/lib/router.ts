import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../middleware/errors";

/**
 * Every route file must build its router with this, never `new OpenAPIHono()` directly:
 * sub-routers do not inherit the parent's defaultHook, so Zod errors would skip the standard shape.
 */
export const createRouter = () => new OpenAPIHono({ defaultHook: validationHook });
