import { createRouter } from "../lib/router";

// Lane C: POST /projects/:id/wage-payments
// Already mounted in src/server/app.ts. Add routes with .openapi(createRoute({...}), handler).
export const wagePayments = createRouter();
