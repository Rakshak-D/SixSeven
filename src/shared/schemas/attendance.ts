import { z } from "zod";
import { DailyRatePaise, HalfDays, Id, IsoDate, Timestamp } from "./common";

export const CreateAttendanceInput = z
  .strictObject({
    workDate: IsoDate,
    entries: z.array(z.strictObject({ workerId: Id, halfDays: HalfDays })).min(1),
  })
  .refine(
    ({ entries }) => new Set(entries.map(({ workerId }) => workerId)).size === entries.length,
    {
      path: ["entries"],
      message: "A worker can appear only once per date",
    },
  );
export const AttendanceResponse = z.strictObject({
  workDate: IsoDate,
  entries: z
    .array(
      z.strictObject({
        id: Id,
        workerId: Id,
        halfDays: HalfDays,
        ratePaise: DailyRatePaise,
      }),
    )
    .min(1),
});

export type CreateAttendanceInput = z.infer<typeof CreateAttendanceInput>;
export type AttendanceResponse = z.infer<typeof AttendanceResponse>;

export const AttendanceListQuery = z
  .strictObject({ from: IsoDate.optional(), to: IsoDate.optional(), workerId: Id.optional() })
  .refine(({ from, to }) => !from || !to || from <= to, {
    path: ["to"],
    message: "End date must be on or after start date",
  });
export const AttendanceRecord = z.strictObject({
  id: Id,
  workerId: Id,
  workDate: IsoDate,
  halfDays: HalfDays,
  effectiveHalfDays: HalfDays,
  ratePaise: DailyRatePaise,
  createdAt: Timestamp,
});
export const AttendanceListResponse = z.array(AttendanceRecord);
export type AttendanceListQuery = z.infer<typeof AttendanceListQuery>;
export type AttendanceRecord = z.infer<typeof AttendanceRecord>;
export type AttendanceListResponse = z.infer<typeof AttendanceListResponse>;
