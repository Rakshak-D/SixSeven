import { createRouter } from "../lib/router";

// Lane A: POST /projects/:id/usages
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const usages = createRouter();
