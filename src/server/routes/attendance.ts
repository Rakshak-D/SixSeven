import { createRouter } from "../lib/router";

// Lane A: POST /projects/:id/attendance
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const attendance = createRouter();
