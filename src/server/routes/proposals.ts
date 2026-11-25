import { createRouter } from "../lib/router";

// Lane C: POST /projects/:id/proposals, POST /proposals/:id/decision
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const proposals = createRouter();
