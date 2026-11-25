import { z } from "zod";
import { DailyRatePaise, Id, Label, Timestamp } from "./common";

export const DeactivateWorkerInput = z.strictObject({ reason: z.string().trim().min(5).max(2000) });
export const WorkerParams = z.strictObject({ id: Id, workerId: Id });

export const CreateWorkerInput = z.strictObject({
  name: Label,
  category: Label,
  dailyRatePaise: DailyRatePaise,
});
export const WorkerResponse = z.strictObject({
  id: Id,
  name: Label,
  category: Label,
  dailyRatePaise: DailyRatePaise,
  active: z.boolean(),
  removedReason: DeactivateWorkerInput.shape.reason.optional(),
  removedOn: Timestamp.optional(),
});
export const WorkersResponse = z.array(WorkerResponse);

export type CreateWorkerInput = z.infer<typeof CreateWorkerInput>;
export type DeactivateWorkerInput = z.infer<typeof DeactivateWorkerInput>;
export type WorkerResponse = z.infer<typeof WorkerResponse>;
export type WorkersResponse = z.infer<typeof WorkersResponse>;
