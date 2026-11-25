/**
 * Frontend mocks, one entry per API route that is not live yet.
 * The API client answers from here when NEXT_PUBLIC_USE_MOCKS=1 and the route is listed.
 * Delete an entry the moment docs/API.md marks its route `live`.
 * Fixtures must pass the route's shared Zod schema (src/shared/schemas/*).
 */
import { projectMocks } from "./projects";
import type { MockRoute } from "./types";

export type { MockRoute } from "./types";

/** True when the app is running on these fixtures; the UI must say so. */
export const mocksEnabled = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

// GET /projects is live, but it needs a session and login is not built yet.
export const mocks: MockRoute[] = [...projectMocks];
