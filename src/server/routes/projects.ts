import { createRouter } from "../lib/router";

// Lane A: POST/GET /projects, GET /projects/:id, POST /projects/:id/members
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const projects = createRouter();
