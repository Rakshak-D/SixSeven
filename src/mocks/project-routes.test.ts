import { describe, expect, it } from "vitest";
import { projectRoutes } from "./project-routes";
import { demoRoutes } from "./routes";
import { MockError, type MockRoute } from "./types";

function call(method: MockRoute["method"], path: string, body?: unknown) {
  const parts = path.split("/");
  for (const route of [...projectRoutes, ...demoRoutes]) {
    const pattern = route.path.split("/");
    if (route.method !== method || pattern.length !== parts.length) continue;
    if (!pattern.every((seg, i) => seg.startsWith(":") || seg === parts[i])) continue;
    const params = Object.fromEntries(
      pattern.flatMap((seg, i) => (seg.startsWith(":") ? [[seg.slice(1), parts[i]]] : [])),
    );
    return route.respond({ params, query: new URLSearchParams(), body });
  }
  throw new Error(`no mock for ${method} ${path}`);
}
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    if (e instanceof MockError) return e.status;
    throw e;
  }
};
type Project = { id: string; role: string };

describe("starting a project and invites", () => {
  const details = {
    name: "New House",
    location: "Udupi",
    startDate: "2027-01-05",
    budgetPaise: 100_000_000,
  };

  it("makes the creator the engineer, with an empty project that every read can serve", () => {
    const made = call("POST", "/projects", details) as Project;
    expect(made.role).toBe("engineer");
    expect((call("GET", "/projects") as Project[]).map((p) => p.id)).toContain(made.id);
    for (const read of ["stock", "movements", "summary", "checklists", "timeline", "activity"]) {
      expect(() => call("GET", `/projects/${made.id}/${read}`)).not.toThrow();
    }
    expect(call("GET", `/projects/${made.id}/members`)).toHaveLength(1);
  });

  it("lets only the engineer invite, once per email", () => {
    const made = call("POST", "/projects", details) as Project;
    const invite = () =>
      call("POST", `/projects/${made.id}/invitations`, { email: "a@b.in", role: "owner" });
    expect(status(invite)).toBe(200);
    expect(status(invite)).toBe(409);
    expect(
      status(() =>
        call("POST", "/projects/demo-lakeview/invitations", { email: "a@b.in", role: "owner" }),
      ),
    ).toBe(403);
    expect(
      status(() =>
        call("POST", `/projects/${made.id}/invitations`, { email: "c@d.in", role: "engineer" }),
      ),
    ).toBe(400);
  });

  it("joins a project by accepting an invite, once", () => {
    expect(call("GET", "/invitations")).toHaveLength(1);
    call("POST", "/invitations/inv-riverside/accept");
    expect(
      (call("GET", "/projects") as Project[]).find((p) => p.id === "demo-riverside")?.role,
    ).toBe("contractor");
    expect(status(() => call("POST", "/invitations/inv-riverside/accept"))).toBe(404);
  });
});
