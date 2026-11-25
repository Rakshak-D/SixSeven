import { and, eq, sql as expression } from "drizzle-orm";
import sharp from "sharp";
import { createAuth } from "@/server/auth";
import { recordAudit } from "@/server/services/audit";
import {
  persistValidatedPhotos,
  readStoredPhoto,
  validateImageUpload,
} from "@/server/services/photo-storage";
import { appendStockMovement } from "@/server/services/stock-ledger";
import { CreateAdjustmentInput } from "@/shared/schemas/adjustments";
import { CreateAttendanceInput } from "@/shared/schemas/attendance";
import { DemoAccountEmail } from "@/shared/schemas/auth";
import { CreateDeliveryInput } from "@/shared/schemas/deliveries";
import { CreateUsageInput } from "@/shared/schemas/usages";
import { CreateWagePaymentInput } from "@/shared/schemas/wages";
import { account, user } from "./auth-schema";
import { getDatabase } from "./client";
import { disposableDatabase } from "./config";
import {
  adjustments,
  attendance,
  checklistDrafts,
  checklistItems,
  checklistRecords,
  expenses,
  materials,
  progressPhotos,
  progressUpdates,
  projectMembers,
  projects,
  proposals,
  stockMovements,
  wagePayments,
  workers,
} from "./schema";

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
  let cleanupDemoPhoto: (() => Promise<void>) | undefined;
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

      const demoAttendance = [
        {
          id: "demo-attendance-mason-full",
          workerId: "demo-mason",
          workDate: "2026-11-20",
          halfDays: 2,
          ratePaise: 90_000,
        },
        {
          id: "demo-attendance-mason-half",
          workerId: "demo-mason",
          workDate: "2026-11-21",
          halfDays: 1,
          ratePaise: 90_000,
        },
        {
          id: "demo-attendance-helper-absent",
          workerId: "demo-helper",
          workDate: "2026-11-21",
          halfDays: 0,
          ratePaise: 60_000,
        },
      ] as const;
      for (const fixture of demoAttendance) {
        const [existing] = await tx.select().from(attendance).where(eq(attendance.id, fixture.id));
        if (existing) {
          if (
            existing.projectId !== projectId ||
            existing.workerId !== fixture.workerId ||
            existing.workDate !== fixture.workDate ||
            existing.halfDays !== fixture.halfDays ||
            existing.ratePaise !== fixture.ratePaise
          )
            throw new Error("A reserved demo attendance ID is already in use");
          continue;
        }
        const input = CreateAttendanceInput.parse({
          workDate: fixture.workDate,
          entries: [{ workerId: fixture.workerId, halfDays: fixture.halfDays }],
        });
        const [entry] = input.entries;
        const [worker] = await tx
          .select({ dailyRatePaise: workers.dailyRatePaise })
          .from(workers)
          .where(and(eq(workers.projectId, projectId), eq(workers.id, entry.workerId)));
        if (!worker || worker.dailyRatePaise !== fixture.ratePaise)
          throw new Error("Reserved demo worker daily rate changed");
        await tx.insert(attendance).values({
          id: fixture.id,
          projectId,
          workerId: entry.workerId,
          workDate: input.workDate,
          halfDays: entry.halfDays,
          ratePaise: worker.dailyRatePaise,
          createdBy: contractor,
        });
        await recordAudit(tx, {
          projectId,
          actorId: contractor,
          action: "created",
          entity: "attendance",
          entityId: fixture.id,
        });
      }

      const demoPayments = [
        {
          id: "demo-wage-payment-mason",
          input: {
            workerId: "demo-mason",
            amountPaise: 90_000,
            kind: "wage",
            mode: "bank",
            paidOn: "2026-11-22",
            reference: "DEMO-WAGE-001",
          },
        },
        {
          id: "demo-wage-advance-mason",
          input: {
            workerId: "demo-mason",
            amountPaise: 20_000,
            kind: "advance",
            mode: "cash",
            paidOn: "2026-11-23",
          },
        },
      ] as const;
      for (const fixture of demoPayments) {
        const input = CreateWagePaymentInput.parse(fixture.input);
        const [existing] = await tx
          .select()
          .from(wagePayments)
          .where(eq(wagePayments.id, fixture.id));
        if (existing) {
          if (
            existing.projectId !== projectId ||
            existing.workerId !== input.workerId ||
            existing.amountPaise !== input.amountPaise ||
            existing.kind !== input.kind ||
            existing.mode !== input.mode ||
            existing.paidOn !== input.paidOn
          )
            throw new Error("A reserved demo wage payment ID is already in use");
          continue;
        }
        await tx.insert(wagePayments).values({
          id: fixture.id,
          projectId,
          ...input,
          reference: input.reference ?? null,
          createdBy: contractor,
        });
        await recordAudit(tx, {
          projectId,
          actorId: contractor,
          action: "created",
          entity: "wagePayment",
          entityId: fixture.id,
        });
      }

      const attendanceCorrection = CreateAdjustmentInput.parse({
        targetTable: "attendance",
        targetId: "demo-attendance-mason-half",
        newValue: 2,
        reason: "Verified signed attendance register",
      });
      const [attendanceCorrectionRow] = await tx
        .select()
        .from(adjustments)
        .where(eq(adjustments.id, "demo-correction-attendance-mason"));
      if (!attendanceCorrectionRow) {
        const existingTargetCorrection = await tx
          .select({ id: adjustments.id })
          .from(adjustments)
          .where(
            and(
              eq(adjustments.projectId, projectId),
              eq(adjustments.targetTable, attendanceCorrection.targetTable),
              eq(adjustments.targetId, attendanceCorrection.targetId),
            ),
          );
        if (existingTargetCorrection.length > 0)
          throw new Error("Reserved demo attendance already has an unrelated correction");
        await tx.insert(adjustments).values({
          id: "demo-correction-attendance-mason",
          projectId,
          targetTable: attendanceCorrection.targetTable,
          targetId: attendanceCorrection.targetId,
          oldValue: "1",
          newValue: String(attendanceCorrection.newValue),
          reason: attendanceCorrection.reason,
          actorId: contractor,
        });
        await recordAudit(tx, {
          projectId,
          actorId: contractor,
          action: "corrected",
          entity: "adjustment",
          entityId: "demo-correction-attendance-mason",
          payload: {
            targetTable: attendanceCorrection.targetTable,
            targetId: attendanceCorrection.targetId,
          },
        });
      } else if (
        attendanceCorrectionRow.targetId !== attendanceCorrection.targetId ||
        attendanceCorrectionRow.targetTable !== attendanceCorrection.targetTable ||
        attendanceCorrectionRow.oldValue !== "1.000" ||
        attendanceCorrectionRow.newValue !== "2.000"
      ) {
        throw new Error("Reserved demo attendance correction ID is already in use");
      }

      const stockCorrectionInput = CreateAdjustmentInput.parse({
        targetTable: "stock_movements",
        targetId: "demo-stock-cement-in",
        newValue: 118,
        reason: "Corrected the cement delivery quantity",
      });
      const [stockCorrectionRow] = await tx
        .select()
        .from(adjustments)
        .where(eq(adjustments.id, "demo-correction-stock-cement"));
      const [compensationMovement] = await tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.id, "demo-stock-cement-correction"));
      if (Boolean(stockCorrectionRow) !== Boolean(compensationMovement))
        throw new Error("Reserved demo stock correction is incomplete");
      if (!stockCorrectionRow && !compensationMovement) {
        const existingTargetCorrection = await tx
          .select({ id: adjustments.id })
          .from(adjustments)
          .where(
            and(
              eq(adjustments.projectId, projectId),
              eq(adjustments.targetTable, stockCorrectionInput.targetTable),
              eq(adjustments.targetId, stockCorrectionInput.targetId),
            ),
          );
        if (existingTargetCorrection.length > 0)
          throw new Error("Reserved demo delivery already has an unrelated correction");
        await appendStockMovement(
          tx,
          { userId: contractor },
          projectId,
          {
            type: "adjustment",
            materialId: "demo-cement",
            occurredOn: "2026-11-19",
            note: "Compensating stock correction",
            quantityMilli: BigInt(-2_000),
          },
          "demo-stock-cement-correction",
          {
            targetTable: stockCorrectionInput.targetTable,
            targetId: stockCorrectionInput.targetId,
          },
        );
        await tx.insert(adjustments).values({
          id: "demo-correction-stock-cement",
          projectId,
          targetTable: stockCorrectionInput.targetTable,
          targetId: stockCorrectionInput.targetId,
          oldValue: "120.000",
          newValue: "118.000",
          reason: stockCorrectionInput.reason,
          actorId: contractor,
        });
        await recordAudit(tx, {
          projectId,
          actorId: contractor,
          action: "corrected",
          entity: "adjustment",
          entityId: "demo-correction-stock-cement",
          payload: {
            targetTable: stockCorrectionInput.targetTable,
            targetId: stockCorrectionInput.targetId,
          },
        });
      } else if (
        stockCorrectionRow?.targetId !== stockCorrectionInput.targetId ||
        stockCorrectionRow.targetTable !== stockCorrectionInput.targetTable ||
        stockCorrectionRow.oldValue !== "120.000" ||
        stockCorrectionRow.newValue !== "118.000"
      ) {
        throw new Error("Reserved demo stock correction ID is already in use");
      }

      const demoExpenses = [
        {
          id: "demo-expense-site-water",
          amountPaise: 85_000,
          occurredOn: "2026-11-19",
          description: "Temporary site water and sanitation",
        },
        {
          id: "demo-expense-material-handling",
          amountPaise: 125_000,
          occurredOn: "2026-11-24",
          description: "Material handling and site transport",
        },
      ] as const;
      for (const fixture of demoExpenses) {
        const [existing] = await tx.select().from(expenses).where(eq(expenses.id, fixture.id));
        if (existing) {
          if (
            existing.projectId !== projectId ||
            existing.amountPaise !== fixture.amountPaise ||
            existing.occurredOn !== fixture.occurredOn ||
            existing.description !== fixture.description ||
            existing.createdBy !== contractor
          )
            throw new Error("A reserved demo expense ID is already in use");
          continue;
        }
        await tx.insert(expenses).values({
          ...fixture,
          projectId,
          createdBy: contractor,
        });
      }

      const [proposal] = await tx
        .insert(proposals)
        .values({
          id: "demo-proposal-drainage",
          projectId,
          createdBy: engineer,
          title: "Extend courtyard drain",
          description: "Add a drain line before courtyard flooring.",
          costImpactPaise: 1285000,
        })
        .onConflictDoNothing()
        .returning();
      if (proposal)
        await recordAudit(tx, {
          projectId,
          actorId: engineer,
          action: "created",
          entity: "proposal",
          entityId: proposal.id,
        });
      const draftId = "demo-checklist-draft";
      const checklistId = "demo-checklist-record";
      await tx
        .insert(checklistDrafts)
        .values({ id: draftId, projectId, createdBy: engineer })
        .onConflictDoNothing();
      const [checklist] = await tx
        .insert(checklistRecords)
        .values({
          id: checklistId,
          draftId,
          projectId,
          createdBy: engineer,
          title: "Greenfield site verification",
        })
        .onConflictDoNothing()
        .returning();
      if (checklist) {
        await tx.insert(checklistItems).values([
          {
            id: "demo-checklist-footing",
            projectId,
            checklistId,
            phase: "foundation",
            position: 0,
            task: "Confirm footing layout",
            materials: [],
          },
          {
            id: "demo-checklist-plinth",
            projectId,
            checklistId,
            phase: "plinth",
            position: 1,
            task: "Record plinth level",
            materials: [],
          },
        ]);
        await recordAudit(tx, {
          projectId,
          actorId: engineer,
          action: "created",
          entity: "checklist",
          entityId: checklist.id,
        });
      }

      const demoProgressId = "demo-progress-foundation";
      const [existingProgress] = await tx
        .select()
        .from(progressUpdates)
        .where(eq(progressUpdates.id, demoProgressId));
      const progressNote = "Foundation reinforcement inspected before the next concrete pour.";
      const demoSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#dceaf2"/><circle cx="520" cy="78" r="34" fill="#f2bf62"/><rect y="278" width="640" height="122" fill="#caa878"/><path d="M0 280h640" stroke="#806546" stroke-width="8"/><path d="M148 278V154h352v124M148 154l176-92 176 92M214 278V188h94v90m54 0V188h94v90" fill="none" stroke="#4d6470" stroke-width="14"/><path d="M148 154h352M324 62v216M148 154l176 124 176-124" fill="none" stroke="#b04e3a" stroke-width="7"/><text x="24" y="368" font-family="Arial" font-size="20" fill="#3e433d">Synthetic Slate demo illustration</text></svg>',
      );
      const demoPng = await sharp(demoSvg).png().toBuffer();
      const validatedDemoPhoto = await validateImageUpload(
        new File([new Uint8Array(demoPng)], "synthetic-foundation.png", {
          type: "image/png",
        }),
      );
      if (existingProgress) {
        if (
          existingProgress.projectId !== projectId ||
          existingProgress.note !== progressNote ||
          existingProgress.checklistItemId !== null ||
          existingProgress.createdBy !== contractor
        )
          throw new Error("Reserved demo progress ID is already in use");
        const existingPhotos = await tx
          .select()
          .from(progressPhotos)
          .where(
            and(
              eq(progressPhotos.projectId, projectId),
              eq(progressPhotos.progressId, demoProgressId),
            ),
          );
        const existingPhoto = existingPhotos[0];
        if (
          existingPhotos.length !== 1 ||
          !existingPhoto ||
          existingPhoto.id !== "demo-progress-photo-foundation" ||
          existingPhoto.mime !== "image/png" ||
          existingPhoto.sizeBytes !== demoPng.byteLength ||
          existingPhoto.takenOn !== "2026-11-25"
        )
          throw new Error("Reserved demo progress photo metadata is missing or changed");
        const existingBytes = await readStoredPhoto(existingPhoto.storageKey);
        if (!existingBytes || !existingBytes.equals(demoPng))
          throw new Error("Reserved demo progress photo file is missing or changed");
      } else {
        const stored = await persistValidatedPhotos([validatedDemoPhoto]);
        cleanupDemoPhoto = stored.cleanup;
        await tx.insert(progressUpdates).values({
          id: demoProgressId,
          projectId,
          note: progressNote,
          checklistItemId: null,
          createdBy: contractor,
        });
        await tx.insert(progressPhotos).values({
          id: "demo-progress-photo-foundation",
          projectId,
          progressId: demoProgressId,
          mime: validatedDemoPhoto.mime,
          sizeBytes: validatedDemoPhoto.sizeBytes,
          takenOn: "2026-11-25",
          storageKey: stored.photos[0].storageKey,
        });
        await recordAudit(tx, {
          projectId,
          actorId: contractor,
          action: "created",
          entity: "progress",
          entityId: demoProgressId,
        });
      }
    });
    cleanupDemoPhoto = undefined;
    console.log("Demo records are ready");
  } catch (error) {
    if (cleanupDemoPhoto) {
      await cleanupDemoPhoto().catch(() => {
        console.error("[seed] unable to clean a staged demo photo after a failed seed");
      });
    }
    throw error;
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
