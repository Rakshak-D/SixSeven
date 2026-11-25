import { createRouter } from "../lib/router";

// Lane A: GET /projects/:id/stock, /movements
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const stock = createRouter();
