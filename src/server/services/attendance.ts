import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adjustments, attendance, workers } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import type {
  AttendanceListQuery,
  AttendanceListResponse,
  AttendanceResponse,
  CreateAttendanceInput,
} from "@/shared/schemas/attendance";
import { DailyRatePaise, HalfDays } from "@/shared/schemas/common";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

function isAttendanceConflict(error: unknown) {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (
      "code" in cause &&
      cause.code === "23505" &&
      "constraint_name" in cause &&
      cause.constraint_name === "attendance_project_worker_date_unique"
    )
      return true;
  }
  return false;
}

export async function recordAttendance(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateAttendanceInput,
): Promise<AttendanceResponse> {
  try {
    return await db.transaction(async (tx) => {
      await requireProjectAccess(tx, actor, projectId, ["contractor"]);
      const workerIds = input.entries.map(({ workerId }) => workerId);
      const projectWorkers = await tx
        .select({ id: workers.id, dailyRatePaise: workers.dailyRatePaise, active: workers.active })
        .from(workers)
        .where(and(eq(workers.projectId, projectId), inArray(workers.id, workerIds)))
        .orderBy(asc(workers.id))
        .for("share");
      if (projectWorkers.length !== workerIds.length) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, "Worker not found in this project");
      }
      if (projectWorkers.some(({ active }) => !active)) {
        throw new ApiError(409, ErrorCode.CONFLICT, "Inactive workers cannot receive attendance");
      }
      const byId = new Map(projectWorkers.map((worker) => [worker.id, worker]));
      const created = await tx
        .insert(attendance)
        .values(
          input.entries.map(({ workerId, halfDays }) => {
            const worker = byId.get(workerId);
            if (!worker)
              throw new ApiError(404, ErrorCode.NOT_FOUND, "Worker not found in this project");
            return {
              id: crypto.randomUUID(),
              projectId,
              workerId,
              workDate: input.workDate,
              halfDays,
              ratePaise: worker.dailyRatePaise,
              createdBy: actor.userId,
            };
          }),
        )
        .returning({
          id: attendance.id,
          workerId: attendance.workerId,
          halfDays: attendance.halfDays,
          ratePaise: attendance.ratePaise,
        });

      for (const entry of created) {
        await recordAudit(tx, {
          projectId,
          actorId: actor.userId,
          action: "created",
          entity: "attendance",
          entityId: entry.id,
        });
      }

      const byWorker = new Map(created.map((entry) => [entry.workerId, entry]));
      return {
        workDate: input.workDate,
        entries: input.entries.map(({ workerId }) => {
          const entry = byWorker.get(workerId);
          if (!entry) throw new Error("Attendance insert did not return every requested entry");
          return {
            id: entry.id,
            workerId,
            halfDays: HalfDays.parse(entry.halfDays),
            ratePaise: DailyRatePaise.parse(entry.ratePaise),
          };
        }),
      };
    });
  } catch (error) {
    if (isAttendanceConflict(error)) {
      throw new ApiError(
        409,
        ErrorCode.CONFLICT,
        "Attendance already exists for this worker and date",
      );
    }
    throw error;
  }
}

export async function listAttendance(
  db: Db,
  actor: Actor,
  projectId: string,
  query: AttendanceListQuery,
): Promise<AttendanceListResponse> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await requireProjectAccess(tx, actor, projectId, ["owner", "contractor"]);
    const rows = await tx
      .select({
        id: attendance.id,
        workerId: attendance.workerId,
        workDate: attendance.workDate,
        halfDays: attendance.halfDays,
        ratePaise: attendance.ratePaise,
        createdAt: attendance.createdAt,
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.projectId, projectId),
          query.from ? sql`${attendance.workDate} >= ${query.from}::date` : undefined,
          query.to ? sql`${attendance.workDate} <= ${query.to}::date` : undefined,
          query.workerId ? eq(attendance.workerId, query.workerId) : undefined,
        ),
      )
      .orderBy(desc(attendance.workDate), desc(attendance.createdAt), desc(attendance.id));

    const corrections = rows.length
      ? await tx
          .select({ targetId: adjustments.targetId, newValue: adjustments.newValue })
          .from(adjustments)
          .where(
            and(
              eq(adjustments.projectId, projectId),
              eq(adjustments.targetTable, "attendance"),
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
      halfDays: HalfDays.parse(row.halfDays),
      effectiveHalfDays: HalfDays.parse(effective.get(row.id) ?? row.halfDays),
      ratePaise: DailyRatePaise.parse(row.ratePaise),
      createdAt: row.createdAt.toISOString(),
    }));
  });
}
