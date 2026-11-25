import { createRouter } from "../lib/router";

// Lane A: POST /projects/:id/deliveries
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const deliveries = createRouter();
