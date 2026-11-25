import { and, eq, sql as expression } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { DemoAccountEmail } from "@/shared/schemas/auth";
import { account, user } from "./auth-schema";
import { getDatabase } from "./client";
import { disposableDatabase } from "./config";
import { materials, projectMembers, projects, workers } from "./schema";

const identities = {
  owner: { email: DemoAccountEmail.owner, name: "Demo Owner" },
  contractor: { email: DemoAccountEmail.contractor, name: "Demo Contractor" },
  engineer: { email: DemoAccountEmail.engineer, name: "Demo Engineer" },
  isolated: { email: "isolated@demo.invalid", name: "Demo Isolation Contractor" },
};

async function seed() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (process.env.NODE_ENV === "production" || process.env.SLATE_DEMO_SEED !== "1") {
    throw new Error("Enable the seed explicitly for the disposable demo database");
  }
  disposableDatabase(process.env.CI === "true" ? "test" : "demo");
  const password = process.env.SLATE_DEMO_PASSWORD;
  if (
    !password ||
    password.length < 12 ||
    password.length > 64 ||
    password.startsWith("replace-with-")
  ) {
    throw new Error("Set SLATE_DEMO_PASSWORD to a local secret of 12–64 characters");
  }
  const demoPassword: string = password;

  const { db, sql } = getDatabase();
  try {
    await db.transaction(async (tx) => {
      // Serialize repeat seeds without touching unrelated records.
      await tx.execute(expression`select pg_advisory_xact_lock(1936482661)`);
      const auth = createAuth(tx, { provisioning: true });

      async function provision(identity: { email: string; name: string }) {
        let [existing] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, identity.email));
        if (!existing) {
          await auth.api.signUpEmail({ body: { ...identity, password: demoPassword } });
          [existing] = await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, identity.email));
        }
        if (!existing) throw new Error("Demo account provisioning did not persist");
        const [credential] = await tx
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
        if (!credential) throw new Error("Demo account has no password credential");
        return existing.id;
      }

      const owner = await provision(identities.owner);
      const contractor = await provision(identities.contractor);
      const engineer = await provision(identities.engineer);
      const isolated = await provision(identities.isolated);
      const projectId = "demo-greenfield";
      const isolatedId = "demo-isolated";
      await tx
        .insert(projects)
        .values([
          {
            id: projectId,
            name: "Greenfield Home",
            location: "Chikkamagaluru",
            startDate: "2026-11-18",
            budgetPaise: 250_000_000,
            createdBy: contractor,
          },
          {
            id: isolatedId,
            name: "Hillview Annex",
            location: "Hassan",
            startDate: "2026-11-19",
            budgetPaise: 85_000_000,
            createdBy: isolated,
          },
        ])
        .onConflictDoNothing();

      for (const [id, creator] of [
        [projectId, contractor],
        [isolatedId, isolated],
      ]) {
        const [project] = await tx
          .select({ createdBy: projects.createdBy })
          .from(projects)
          .where(eq(projects.id, id));
        if (project?.createdBy !== creator)
          throw new Error("Reserved demo project ID is already in use");
      }

      await tx
        .insert(projectMembers)
        .values([
          { projectId, userId: owner, role: "owner" },
          { projectId, userId: contractor, role: "contractor" },
          { projectId, userId: engineer, role: "engineer" },
          { projectId: isolatedId, userId: isolated, role: "contractor" },
        ])
        .onConflictDoNothing();

      await tx
        .insert(materials)
        .values([
          {
            id: "demo-cement",
            projectId,
            name: "Cement",
            unit: "bag",
            plannedQty: "350",
            unitCostPaise: 41_500,
            tolerancePct: 5,
            lowStockQty: "20",
          },
          {
            id: "demo-sand",
            projectId,
            name: "M-sand",
            unit: "tonne",
            plannedQty: "25.500",
            unitCostPaise: 125_000,
            tolerancePct: 10,
            lowStockQty: "2.500",
          },
          {
            id: "demo-steel",
            projectId,
            name: "TMT steel",
            unit: "kg",
            plannedQty: "3500",
            unitCostPaise: 6_800,
            tolerancePct: 5,
            lowStockQty: "250",
          },
        ])
        .onConflictDoNothing();
      await tx
        .insert(workers)
        .values([
          {
            id: "demo-mason",
            projectId,
            name: "Demo Mason",
            category: "mason",
            dailyRatePaise: 90_000,
          },
          {
            id: "demo-helper",
            projectId,
            name: "Demo Helper",
            category: "helper",
            dailyRatePaise: 60_000,
          },
        ])
        .onConflictDoNothing();
    });
    console.log("Demo records are ready");
  } finally {
    await sql.end();
  }
}

seed().catch(() => {
  // An adapter error can contain query parameters, including authentication data.
  console.error(
    "Demo seed failed. Check local configuration, migrations and reserved demo identities.",
  );
  process.exitCode = 1;
});
