import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { Db } from "@/db/client";
import { adjustments, projects, wagePayments, workers } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import { PositivePaise } from "@/shared/schemas/common";
import type {
  CreateWagePaymentInput,
  WagePaymentListQuery,
  WagePaymentListResponse,
  WagePaymentResponse,
  WageSheetQuery,
  WageSheetResponse,
} from "@/shared/schemas/wages";
import { WageSheetResponse as WageSheetSchema } from "@/shared/schemas/wages";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";
import { accruedPaise, loadEffectiveAttendance } from "./wage-calculations";

export async function recordWagePayment(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateWagePaymentInput,
): Promise<WagePaymentResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const [worker] = await tx
      .select({ id: workers.id })
      .from(workers)
      .where(and(eq(workers.projectId, projectId), eq(workers.id, input.workerId)));
    if (!worker) throw new ApiError(404, ErrorCode.NOT_FOUND, "Worker not found in this project");

    const id = crypto.randomUUID();
    await tx.insert(wagePayments).values({
      id,
      projectId,
      workerId: worker.id,
      amountPaise: input.amountPaise,
      kind: input.kind,
      mode: input.mode,
      paidOn: input.paidOn,
      reference: input.reference ?? null,
      createdBy: actor.userId,
    });
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "wagePayment",
      entityId: id,
    });
    return { id, ...input, reference: input.reference ?? null };
  });
}

export async function listWagePayments(
  db: Db,
  actor: Actor,
  projectId: string,
  query: WagePaymentListQuery,
): Promise<WagePaymentListResponse> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId, ["owner", "contractor"]);
    const rows = await tx
      .select({
        id: wagePayments.id,
        workerId: wagePayments.workerId,
        amountPaise: wagePayments.amountPaise,
        kind: wagePayments.kind,
        mode: wagePayments.mode,
        paidOn: wagePayments.paidOn,
        reference: wagePayments.reference,
        createdAt: wagePayments.createdAt,
      })
      .from(wagePayments)
      .where(
        and(
          eq(wagePayments.projectId, projectId),
          query.from ? sql`${wagePayments.paidOn} >= ${query.from}::date` : undefined,
          query.to ? sql`${wagePayments.paidOn} <= ${query.to}::date` : undefined,
          query.workerId ? eq(wagePayments.workerId, query.workerId) : undefined,
        ),
      )
      .orderBy(desc(wagePayments.paidOn), desc(wagePayments.createdAt), desc(wagePayments.id));

    const corrections = rows.length
      ? await tx
          .select({ targetId: adjustments.targetId, newValue: adjustments.newValue })
          .from(adjustments)
          .where(
            and(
              eq(adjustments.projectId, projectId),
              eq(adjustments.targetTable, "wage_payments"),
              inArray(
                adjustments.targetId,
                rows.map((row) => row.id),
              ),
            ),
          )
          .orderBy(asc(adjustments.sequenceNo))
      : [];
    const effective = new Map<string, number>();
    for (const correction of corrections)
      effective.set(correction.targetId, Number(correction.newValue));

    return rows.map((row) => ({
      ...row,
      amountPaise: PositivePaise.parse(row.amountPaise),
      effectiveAmountPaise: PositivePaise.parse(effective.get(row.id) ?? row.amountPaise),
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function parseInteger(value: string, field: string) {
  if (!/^-?\d+$/.test(value)) throw new Error(`Database returned an invalid ${field}`);
  return BigInt(value);
}

function safeNumber(value: bigint, field: string) {
  if (value < -MAX_SAFE || value > MAX_SAFE) {
    throw new ApiError(409, ErrorCode.CONFLICT, `The ${field} total exceeds the supported range`);
  }
  return Number(value);
}

export async function buildWageSheet(
  db: Db,
  actor: Actor,
  projectId: string,
  query: WageSheetQuery,
): Promise<{ projectName: string; sheet: WageSheetResponse }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId, ["owner", "contractor"]);
    const [project] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new ApiError(404, ErrorCode.NOT_FOUND, "Project not found");

    const projectWorkers = await tx
      .select({ id: workers.id, name: workers.name })
      .from(workers)
      .where(eq(workers.projectId, projectId))
      .orderBy(asc(workers.name), asc(workers.id));
    const attendanceRows = await loadEffectiveAttendance(tx, projectId, query.from, query.to);
    const paymentRows = await tx
      .select({
        workerId: wagePayments.workerId,
        kind: wagePayments.kind,
        effectiveAmountPaise: sql<string>`coalesce((
          select new_value::bigint from adjustments
          where project_id = ${wagePayments.projectId} and target_table = 'wage_payments'
            and target_id = ${wagePayments.id}
          order by sequence_no desc limit 1
        ), ${wagePayments.amountPaise})::text`,
      })
      .from(wagePayments)
      .where(
        and(
          eq(wagePayments.projectId, projectId),
          sql`${wagePayments.paidOn} >= ${query.from}::date`,
          sql`${wagePayments.paidOn} <= ${query.to}::date`,
        ),
      );

    const totals = new Map<
      string,
      { halfDays: bigint; accrued: bigint; paid: bigint; advances: bigint }
    >();
    for (const worker of projectWorkers) {
      totals.set(worker.id, {
        halfDays: BigInt(0),
        accrued: BigInt(0),
        paid: BigInt(0),
        advances: BigInt(0),
      });
    }
    for (const row of attendanceRows) {
      const current = totals.get(row.workerId);
      if (!current) throw new Error("Attendance references a worker outside its project");
      const halfDays = parseInteger(row.halfDays, "attendance units");
      const rate = parseInteger(row.ratePaise, "attendance rate");
      current.halfDays += halfDays;
      current.accrued += accruedPaise(halfDays, rate);
    }
    for (const row of paymentRows) {
      const current = totals.get(row.workerId);
      if (!current) throw new Error("Payment references a worker outside its project");
      const amount = parseInteger(row.effectiveAmountPaise, "payment amount");
      if (row.kind === "wage") current.paid += amount;
      else current.advances += amount;
    }

    let accrued = BigInt(0);
    let paid = BigInt(0);
    let advances = BigInt(0);
    const sheetWorkers = projectWorkers.map((worker) => {
      const current = totals.get(worker.id);
      if (!current) throw new Error("Wage totals are missing a project worker");
      const due = current.accrued - current.paid - current.advances;
      accrued += current.accrued;
      paid += current.paid;
      advances += current.advances;
      return {
        workerId: worker.id,
        name: worker.name,
        halfDays: safeNumber(current.halfDays, "worker attendance"),
        accruedPaise: safeNumber(current.accrued, "worker accrued wage"),
        paidWagesPaise: safeNumber(current.paid, "worker wage payment"),
        advancesPaise: safeNumber(current.advances, "worker advance"),
        duePaise: safeNumber(due, "worker outstanding balance"),
      };
    });
    const totalDue = accrued - paid - advances;
    const sheet = WageSheetSchema.parse({
      from: query.from,
      to: query.to,
      workers: sheetWorkers,
      totals: {
        accruedPaise: safeNumber(accrued, "accrued wage"),
        paidWagesPaise: safeNumber(paid, "wage payment"),
        advancesPaise: safeNumber(advances, "advance"),
        duePaise: safeNumber(totalDue, "outstanding balance"),
      },
    });
    return { projectName: project.name, sheet };
  });
}

function csvCell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function wageSheetCsv(projectName: string, sheet: WageSheetResponse) {
  const rows: (string | number)[][] = [
    ["Slate wage sheet"],
    ["Project", projectName],
    ["Reporting period", sheet.from, sheet.to],
    [],
    [
      "Worker ID",
      "Worker",
      "Half days",
      "Accrued paise",
      "Paid wages paise",
      "Advances paise",
      "Outstanding paise",
    ],
    ...sheet.workers.map((worker) => [
      worker.workerId,
      worker.name,
      worker.halfDays,
      worker.accruedPaise,
      worker.paidWagesPaise,
      worker.advancesPaise,
      worker.duePaise,
    ]),
    [
      "TOTAL",
      "",
      "",
      sheet.totals.accruedPaise,
      sheet.totals.paidWagesPaise,
      sheet.totals.advancesPaise,
      sheet.totals.duePaise,
    ],
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function inr(amountPaise: number) {
  const value = BigInt(amountPaise);
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}INR ${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

export function wageSheetPdf(projectName: string, sheet: WageSheetResponse): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 42, compress: false });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.fontSize(17).text("Slate Wage Sheet");
    document.moveDown(0.35).fontSize(10).text(`Project: ${projectName}`);
    document.text(`Reporting period: ${sheet.from} to ${sheet.to}`);
    document.moveDown();
    for (const worker of sheet.workers) {
      if (document.y > 700) document.addPage();
      document.fontSize(11).text(`${worker.name} (${worker.workerId})`);
      document
        .fontSize(9)
        .text(
          `Half days: ${worker.halfDays} | Accrued: ${inr(worker.accruedPaise)} | Wages paid: ${inr(worker.paidWagesPaise)}`,
        );
      document.text(
        `Advances: ${inr(worker.advancesPaise)} | Outstanding: ${inr(worker.duePaise)}`,
      );
      document.moveDown(0.65);
    }
    document.moveDown(0.4).fontSize(11).text("Project totals");
    document
      .fontSize(9)
      .text(
        `Accrued: ${inr(sheet.totals.accruedPaise)} | Wages paid: ${inr(sheet.totals.paidWagesPaise)}`,
      );
    document.text(
      `Advances: ${inr(sheet.totals.advancesPaise)} | Outstanding: ${inr(sheet.totals.duePaise)}`,
    );
    document.end();
  });
}
