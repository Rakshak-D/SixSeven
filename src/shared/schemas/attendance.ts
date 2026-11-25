import { z } from "zod";
import { DailyRatePaise, HalfDays, Id, IsoDate } from "./common";

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
