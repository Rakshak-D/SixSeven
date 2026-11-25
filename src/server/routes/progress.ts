import { createRouter } from "../lib/router";

// Lane C: POST /projects/:id/progress, GET /projects/:id/timeline
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const progress = createRouter();
