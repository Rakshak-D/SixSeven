import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { attendance } from "@/db/schema";

export type EffectiveAttendanceRow = {
  workerId: string;
  workDate: string;
  halfDays: string;
  ratePaise: string;
};

/** Read original attendance with its latest append-only correction in the same DB snapshot. */
export function loadEffectiveAttendance(
  tx: Transaction,
  projectId: string,
  from: string,
  to: string,
) {
  return tx
    .select({
      workerId: attendance.workerId,
      workDate: attendance.workDate,
      halfDays: sql<string>`coalesce((
        select new_value::integer from adjustments
        where project_id = ${attendance.projectId} and target_table = 'attendance'
          and target_id = ${attendance.id}
        order by sequence_no desc limit 1
      ), ${attendance.halfDays})::text`,
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
}

/** The schema requires an even-paise daily rate, making each half-day exactly divisible. */
export function accruedPaise(halfDays: bigint, dailyRatePaise: bigint) {
  return halfDays * (dailyRatePaise / BigInt(2));
}
