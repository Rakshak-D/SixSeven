import { createRouter } from "../lib/router";

// Lane C: GET /projects/:id/summary
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const summary = createRouter();
