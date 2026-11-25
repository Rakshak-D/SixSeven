import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/auth/[...auth]/route";
import { account, session } from "@/db/auth-schema";
import { getDatabase } from "@/db/client";
import { auditLog, projectMembers, projects } from "@/db/schema";
import { app } from "@/server/app";
import { getAuth } from "@/server/auth";
import { ErrorResponse } from "@/shared/errors";
import {
  AuthErrorResponse,
  DemoAccountEmail,
  SessionResponse,
  SignInResponse,
} from "@/shared/schemas/auth";
import {
  ProjectMemberResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectTeamResponse,
} from "@/shared/schemas/projects";
import { testDatabase } from "./database-fixture";

beforeAll(() => {
  testDatabase();
});

function authRequest(
  path: string,
  options: { body?: unknown; cookie?: string; origin?: string; post?: boolean } = {},
) {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("Set BETTER_AUTH_URL for tests");
  const headers = new Headers({ origin: options.origin ?? base, "sec-fetch-site": "same-origin" });
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(new URL(`/api/auth/${path}`, base), {
    method: options.post || options.body !== undefined ? "POST" : "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return request.method === "GET" ? GET(request) : POST(request);
}

function password() {
  const value = process.env.SLATE_DEMO_PASSWORD;
  if (!value) throw new Error("Seed the disposable database and set SLATE_DEMO_PASSWORD");
  return value;
}

async function login(email: string) {
  const response = await authRequest("sign-in/email", { body: { email, password: password() } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const body: unknown = await response.json();
  const data = SignInResponse.parse(body);
  expect(body).toEqual(data);
  expect(data.user.email).toBe(email);
  const cookies = response.headers.getSetCookie();
  expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.some((cookie) => /; httponly/i.test(cookie))).toBe(true);
  return { cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "), userId: data.user.id };
}

function call(path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...headers,
      ...(cookie && { cookie }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(ErrorResponse.parse(await response.json()).error.code).toBe(code);
}

describe("email/password authentication", () => {
  it.each(
    Object.entries(DemoAccountEmail),
  )("logs in the seeded %s and returns only allowlisted fields", async (role, email) => {
    const { cookie, userId } = await login(email);
    const response = await authRequest("get-session", { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body: unknown = await response.json();
    const data = SessionResponse.parse(body);
    expect(data?.user).toMatchObject({ id: userId, email });
    expect(body).toEqual(data);
    const { db } = getDatabase();
    const [credential] = await db
      .select({ hash: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
    expect(Boolean(credential?.hash)).toBe(true);
    expect(credential?.hash === password()).toBe(false);
    const membership = ProjectResponse.parse(
      await (await call("/projects/demo-greenfield", cookie)).json(),
    );
    expect(membership.role).toBe(role);
  });

  it("returns native errors for invalid credentials and rejects registration and untrusted origins", async () => {
    const bad = await authRequest("sign-in/email", {
      body: { email: DemoAccountEmail.owner, password: `wrong-${password()}` },
    });
    expect(bad.status).toBe(401);
    expect(AuthErrorResponse.parse(await bad.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
    const rejected = await authRequest("sign-in/email", {
      origin: "https://untrusted.invalid",
      body: { email: DemoAccountEmail.owner, password: password() },
    });
    expect(rejected.status).toBe(403);
    expect(AuthErrorResponse.parse(await rejected.json()).code).toBe("INVALID_ORIGIN");
    const register = await authRequest("sign-up/email", {
      body: { email: "other@demo.invalid", password: password(), name: "Other" },
    });
    expect(register.status).toBe(404);
  });

  it("rejects missing, tampered and expired cookies", async () => {
    const { cookie } = await login(DemoAccountEmail.engineer);
    const result = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    if (!result) throw new Error("Expected persisted session");
    const tampered = `${cookie}x`;
    for (const value of [undefined, tampered]) {
      const response = await authRequest("get-session", { cookie: value });
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
      await error(await call("/projects", value), 401, "UNAUTHENTICATED");
    }
    await getDatabase()
      .db.update(session)
      .set({ expiresAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(session.id, result.session.id));
    const expired = await authRequest("get-session", { cookie });
    expect(expired.status).toBe(200);
    expect(await expired.json()).toBeNull();
    await error(await call("/projects", cookie), 401, "UNAUTHENTICATED");
  });

  it("revokes the persisted session on logout and rejects the old cookie", async () => {
    const { cookie } = await login(DemoAccountEmail.contractor);
    const current = await getAuth().api.getSession({ headers: new Headers({ cookie }) });
    if (!current) throw new Error("Expected persisted session");
    const rejected = await authRequest("sign-out", {
      origin: "https://untrusted.invalid",
      cookie,
      post: true,
    });
    expect(rejected.status).toBe(403);
    expect(AuthErrorResponse.parse(await rejected.json()).code).toBe("INVALID_ORIGIN");
    const response = await POST(
      new Request(new URL("/api/auth/sign-out", process.env.BETTER_AUTH_URL), {
        method: "POST",
        headers: {
          cookie,
          origin: process.env.BETTER_AUTH_URL ?? "",
          "sec-fetch-site": "same-origin",
          "content-length": "0",
        },
        body: new Uint8Array(0),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.getSetCookie().some((line) => /max-age=0/i.test(line))).toBe(true);
    expect(
      await getDatabase()
        .db.select({ id: session.id })
        .from(session)
        .where(eq(session.id, current.session.id)),
    ).toEqual([]);
    expect(await (await authRequest("get-session", { cookie })).json()).toBeNull();
    await error(await call("/projects", cookie), 401, "UNAUTHENTICATED");
  });
});

describe("projects and scoped access", () => {
  it("shares only an opted-in phone with project teammates and lets the caller clear it", async () => {
    const owner = await login(DemoAccountEmail.owner);
    const engineer = await login(DemoAccountEmail.engineer);
    const outsider = await login("isolated@demo.invalid");
    const update = (value: unknown, cookie?: string, origin = process.env.BETTER_AUTH_URL) =>
      app.request("/api/v1/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(cookie && { cookie }),
          ...(origin && { origin }),
        },
        body: JSON.stringify(value),
      });
    const url = "/projects/demo-greenfield/members";
    await error(await call(url), 401, "UNAUTHENTICATED");
    await error(await call(url, outsider.cookie), 404, "NOT_FOUND");
    await error(await update({ phone: "9876543210" }), 401, "UNAUTHENTICATED");
    await error(await update({ phone: "12345" }, owner.cookie), 400, "VALIDATION_ERROR");
    await error(
      await update({ phone: "9876543210", userId: engineer.userId }, owner.cookie),
      400,
      "VALIDATION_ERROR",
    );
    await error(
      await update({ phone: "9876543210" }, owner.cookie, "https://untrusted.invalid"),
      403,
      "FORBIDDEN",
    );
    try {
      const changed = await update({ phone: "9876543210" }, owner.cookie);
      expect(changed.status).toBe(200);
      expect(await changed.json()).toEqual({ phone: "+919876543210" });
      const members = await call(url, engineer.cookie);
      expect(members.status).toBe(200);
      const roster = ProjectTeamResponse.parse(await members.json());
      expect(roster.find(({ userId }) => userId === owner.userId)).toEqual({
        userId: owner.userId,
        name: "Demo Owner",
        role: "owner",
        phone: "+919876543210",
      });
      expect(roster.find(({ userId }) => userId === engineer.userId)).not.toHaveProperty("phone");
      expect(
        SessionResponse.parse(
          await (await authRequest("get-session", { cookie: owner.cookie })).json(),
        )?.user,
      ).not.toHaveProperty("phone");
    } finally {
      expect(await (await update({ phone: null }, owner.cookie)).json()).toEqual({ phone: null });
    }
    expect(
      ProjectTeamResponse.parse(await (await call(url, engineer.cookie)).json()).find(
        ({ userId }) => userId === owner.userId,
      ),
    ).not.toHaveProperty("phone");
  });
  const input = {
    name: "Museum Annex",
    location: "Hassan",
    startDate: "2026-11-25",
    budgetPaise: 1_500_000,
  };

  it("creates a project and membership atomically, and scopes roles and listings per project", async () => {
    const owner = await login(DemoAccountEmail.owner);
    const unauthorized = await call("/projects", undefined, input);
    await error(unauthorized, 401, "UNAUTHENTICATED");
    const response = await call("/projects", owner.cookie, input);
    expect(response.status).toBe(201);
    const created = ProjectResponse.parse(await response.json());
    expect(created.role).toBe("contractor");
    expect(created.name).toBe(input.name);

    const { db } = getDatabase();
    const [member] = await db
      .select()
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, created.id), eq(projectMembers.userId, owner.userId)),
      );
    expect(member?.role).toBe("contractor");
    const audit = await db.select().from(auditLog).where(eq(auditLog.projectId, created.id));
    expect(audit.map(({ entity }) => entity).sort()).toEqual(["member", "project"]);
    expect(audit.every(({ actorId }) => actorId === owner.userId)).toBe(true);

    const own = ProjectsResponse.parse(await (await call("/projects", owner.cookie)).json());
    expect(own).toEqual(
      expect.arrayContaining([
        created,
        expect.objectContaining({ id: "demo-greenfield", role: "owner" }),
      ]),
    );
    expect(own.some(({ id }) => id === "demo-isolated")).toBe(false);
    const isolated = await login("isolated@demo.invalid");
    const other = ProjectsResponse.parse(await (await call("/projects", isolated.cookie)).json());
    expect(other.map(({ id }) => id)).toEqual(["demo-isolated"]);
    expect(
      ProjectResponse.parse(await (await call(`/projects/${created.id}`, owner.cookie)).json()),
    ).toEqual(created);
    await error(await call(`/projects/${created.id}`, isolated.cookie), 404, "NOT_FOUND");
    await error(await call("/projects/missing-project", isolated.cookie), 404, "NOT_FOUND");
  });

  it("enrolls owner and engineer once, rejects unauthorized or invalid enrollment, and writes only matching audits", async () => {
    const contractor = await login(DemoAccountEmail.contractor);
    const owner = await login(DemoAccountEmail.owner);
    const engineer = await login(DemoAccountEmail.engineer);
    const project = ProjectResponse.parse(
      await (await call("/projects", contractor.cookie, input)).json(),
    );
    const path = `/projects/${project.id}/members`;
    const ownerInput = { email: DemoAccountEmail.owner, role: "owner" };
    const engineerInput = { email: DemoAccountEmail.engineer, role: "engineer" };
    await error(await call(path, owner.cookie, engineerInput), 404, "NOT_FOUND");
    await error(
      await call(path, contractor.cookie, { email: "missing@demo.invalid", role: "owner" }),
      404,
      "NOT_FOUND",
    );
    await error(
      await call(path, contractor.cookie, { ...ownerInput, role: "contractor" }),
      400,
      "VALIDATION_ERROR",
    );
    await error(
      await call(path, contractor.cookie, { ...ownerInput, actorId: contractor.userId }),
      400,
      "VALIDATION_ERROR",
    );
    await error(
      await call(path, contractor.cookie, ownerInput, { origin: "https://untrusted.invalid" }),
      403,
      "FORBIDDEN",
    );

    const pair = await Promise.all([
      call(path, contractor.cookie, ownerInput),
      call(path, contractor.cookie, ownerInput),
    ]);
    expect(pair.map(({ status }) => status).sort()).toEqual([201, 409]);
    for (const response of pair) {
      if (response.status === 201)
        expect(ProjectMemberResponse.parse(await response.json())).toEqual({
          userId: owner.userId,
          role: "owner",
        });
      else await error(response, 409, "CONFLICT");
    }
    await error(
      await call(path, owner.cookie, engineerInput, {
        "x-role": "contractor",
        "x-user-id": contractor.userId,
      }),
      403,
      "FORBIDDEN",
    );
    const added = await call(path, contractor.cookie, engineerInput);
    expect(added.status).toBe(201);
    expect(ProjectMemberResponse.parse(await added.json())).toEqual({
      userId: engineer.userId,
      role: "engineer",
    });
    await error(await call(path, engineer.cookie, ownerInput), 403, "FORBIDDEN");
    const entries = await getDatabase()
      .db.select()
      .from(auditLog)
      .where(and(eq(auditLog.projectId, project.id), eq(auditLog.entity, "member")));
    expect(entries.map(({ entityId }) => entityId).sort()).toEqual(
      [contractor.userId, owner.userId, engineer.userId].sort(),
    );
    expect(entries.every(({ actorId }) => actorId === contractor.userId)).toBe(true);
  });

  it("rolls back a project and its creator membership when audit recording fails", async () => {
    const { cookie } = await login(DemoAccountEmail.contractor);
    const { db, sql } = getDatabase();
    const name = `Rollback ${crypto.randomUUID()}`;
    await sql`create function slate_test_reject_project_audit() returns trigger language plpgsql as $$
      begin raise exception 'test audit failure'; end; $$`;
    try {
      await sql`create trigger slate_test_reject_project_audit before insert on audit_log
        for each row when (new.entity = 'project') execute function slate_test_reject_project_audit()`;
      await error(await call("/projects", cookie, { ...input, name }), 500, "INTERNAL");
      expect(await db.select().from(projects).where(eq(projects.name, name))).toEqual([]);
      // The membership's non-null foreign key prevents an orphan after project rollback.
    } finally {
      await sql`drop trigger if exists slate_test_reject_project_audit on audit_log`;
      await sql`drop function slate_test_reject_project_audit()`;
    }
  });

  it("registers the implemented operations in the OpenAPI document", async () => {
    const spec = await (await call("/doc")).json();
    expect(spec.paths["/api/v1/projects"]).toHaveProperty("get");
    expect(spec.paths["/api/v1/projects"]).toHaveProperty("post");
    expect(spec.paths["/api/v1/projects/{id}"]).toHaveProperty("get");
    expect(spec.paths["/api/v1/projects/{id}/members"]).toHaveProperty("post");
  });
});
