import { and, eq, sql as expression } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import { appendStockMovement } from "@/server/services/stock-ledger";
import { DemoAccountEmail } from "@/shared/schemas/auth";
import { CreateDeliveryInput } from "@/shared/schemas/deliveries";
import { CreateUsageInput } from "@/shared/schemas/usages";
import { account, user } from "./auth-schema";
import { getDatabase } from "./client";
import { disposableDatabase } from "./config";
import { materials, projectMembers, projects, stockMovements, workers } from "./schema";

const identities = {
  owner: { email: DemoAccountEmail.owner, name: "Demo Owner" },
  contractor: { email: DemoAccountEmail.contractor, name: "Demo Contractor" },
  engineer: { email: DemoAccountEmail.engineer, name: "Demo Engineer" },
  isolated: { email: "isolated@demo.invalid", name: "Demo Isolation Contractor" },
};

const demoDeliveries = [
  {
    id: "demo-stock-cement-in",
    materialId: "demo-cement",
    qty: 120,
    unitCostPaise: 41_500,
    supplier: "Demo Supply Yard",
    challanNo: "DEMO-001",
    occurredOn: "2026-11-19",
  },
  {
    id: "demo-stock-sand-in",
    materialId: "demo-sand",
    qty: 12.375,
    unitCostPaise: 125_000,
    supplier: "Demo Supply Yard",
    challanNo: "DEMO-002",
    occurredOn: "2026-11-20",
  },
  {
    id: "demo-stock-steel-in",
    materialId: "demo-steel",
    qty: 850,
    unitCostPaise: 6_800,
    supplier: "Demo Supply Yard",
    challanNo: "DEMO-003",
    occurredOn: "2026-11-21",
  },
];

const demoUsages = [
  {
    id: "demo-stock-cement-out",
    materialId: "demo-cement",
    qty: 104,
    occurredOn: "2026-11-22",
    note: "Foundation concrete",
  },
  {
    id: "demo-stock-sand-out",
    materialId: "demo-sand",
    qty: 3.125,
    occurredOn: "2026-11-23",
    note: "Masonry mortar",
  },
  {
    id: "demo-stock-steel-out",
    materialId: "demo-steel",
    qty: 325,
    occurredOn: "2026-11-24",
    note: "Plinth reinforcement",
  },
];

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
      const recorded = await tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.projectId, projectId));
      const existingMovementIds = new Set(recorded.map(({ id }) => id));
      for (const { id, ...input } of demoDeliveries) {
        if (!existingMovementIds.has(id)) {
          await appendStockMovement(
            tx,
            { userId: contractor },
            projectId,
            {
              ...CreateDeliveryInput.parse(input),
              type: "delivery",
            },
            id,
          );
        }
      }
      for (const { id, ...input } of demoUsages) {
        if (!existingMovementIds.has(id)) {
          await appendStockMovement(
            tx,
            { userId: contractor },
            projectId,
            {
              ...CreateUsageInput.parse(input),
              type: "usage",
            },
            id,
          );
        }
      }

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
