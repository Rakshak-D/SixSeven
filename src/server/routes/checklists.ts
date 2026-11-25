import { createRouter } from "../lib/router";

// Lane D: POST /projects/:id/checklists, PATCH /checklist-items/:id
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const checklists = createRouter();
