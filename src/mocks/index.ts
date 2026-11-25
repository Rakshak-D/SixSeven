/**
 * Frontend mocks, one entry per API route the UI calls before it can use the live one.
 * The API client answers from here when NEXT_PUBLIC_USE_MOCKS=1 and the route is listed.
 * Delete an entry the moment the live route works for the UI (most need login first).
 * Every response is parsed with the route's shared Zod schema (src/shared/schemas/*).
 */
import { changeRoutes } from "./change-routes";
import { checklistRoutes } from "./checklist-routes";
import { demoRoutes } from "./routes";
import type { MockRoute } from "./types";
import { writeRoutes } from "./write-routes";

export type { MockRoute } from "./types";

/** True when the app is running on these fixtures; the UI must say so. */
export const mocksEnabled = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

export const mocks: MockRoute[] = [
  ...demoRoutes,
  ...writeRoutes,
  ...checklistRoutes,
  ...changeRoutes,
];
