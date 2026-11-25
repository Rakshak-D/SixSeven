import { createRouter } from "../lib/router";

// Lane C: GET /projects/:id/activity
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const activity = createRouter();
