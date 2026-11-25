import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { adjustments, attendance, changeRequestEvents, changeRequests } from "@/db/schema";

export type EffectiveAttendanceRow = {
  workerId: string;
  workDate: string;
  halfDays: string;
  paidHalfDays: string;
  ratePaise: string;
};

/** Read original attendance with its latest append-only correction in the same DB snapshot. */
export async function loadEffectiveAttendance(
  tx: Transaction,
  projectId: string,
  from: string,
  to: string,
) {
  const rows = await tx
    .select({
      id: attendance.id,
      workerId: attendance.workerId,
      workDate: attendance.workDate,
      halfDays: attendance.halfDays,
      ratePaise: sql<string>`${attendance.ratePaise}::text`,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.projectId, projectId),
        sql`${attendance.workDate} >= ${from}::date`,
        sql`${attendance.workDate} <= ${to}::date`,
      ),
    );

  const corrections = rows.length
    ? await tx
        .select({
          targetId: adjustments.targetId,
          newValue: sql<string>`${adjustments.newValue}::integer::text`,
        })
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
  const effective = new Map<string, string>();
  for (const correction of corrections) effective.set(correction.targetId, correction.newValue);

  const overrides = rows.length
    ? await tx
        .select({
          targetId: changeRequests.targetId,
          payFullDay: sql<boolean>`(${changeRequests.payload}->>'payFullDay') = 'true'`,
        })
        .from(changeRequests)
        .innerJoin(
          changeRequestEvents,
          and(
            eq(changeRequestEvents.projectId, changeRequests.projectId),
            eq(changeRequestEvents.requestId, changeRequests.id),
            eq(changeRequestEvents.kind, "owner_accepted"),
          ),
        )
        .where(
          and(
            eq(changeRequests.projectId, projectId),
            eq(changeRequests.kind, "attendance_fix"),
            inArray(
              changeRequests.targetId,
              rows.map(({ id }) => id),
            ),
          ),
        )
        .orderBy(asc(changeRequestEvents.sequence))
    : [];
  const fullPay = new Map(overrides.map(({ targetId, payFullDay }) => [targetId, payFullDay]));

  return rows.map((row) => ({
    workerId: row.workerId,
    workDate: row.workDate,
    halfDays: effective.get(row.id) ?? String(row.halfDays),
    paidHalfDays: fullPay.get(row.id) ? "2" : (effective.get(row.id) ?? String(row.halfDays)),
    ratePaise: row.ratePaise,
  }));
}

/** The schema requires an even-paise daily rate, making each half-day exactly divisible. */
export function accruedPaise(halfDays: bigint, dailyRatePaise: bigint) {
  return halfDays * (dailyRatePaise / BigInt(2));
}
