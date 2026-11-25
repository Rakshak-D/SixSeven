import { ProjectsResponse } from "@/shared/schemas/projects";
import type { MockRoute } from "./types";

/**
 * Development fixtures: one demo project per role, so switching project switches the role.
 * Parsed with the shared contract at load, so a contract change breaks these loudly.
 */
export const demoProjects = ProjectsResponse.parse([
  {
    id: "demo-greenfield",
    name: "Greenfield Home",
    location: "Whitefield, Bengaluru",
    startDate: "2026-08-18",
    budgetPaise: 400_000_000,
    role: "owner",
  },
  {
    id: "demo-lakeview",
    name: "Lakeview Duplex",
    location: "Hebbal, Bengaluru",
    startDate: "2026-09-07",
    budgetPaise: 650_000_000,
    role: "contractor",
  },
  {
    id: "demo-hillside",
    name: "Hillside Villa",
    location: "Mysuru",
    startDate: "2026-07-01",
    budgetPaise: 900_000_000,
    role: "engineer",
  },
]);

export const projectMocks: MockRoute[] = [
  { method: "GET", path: "/projects", respond: () => demoProjects },
];
