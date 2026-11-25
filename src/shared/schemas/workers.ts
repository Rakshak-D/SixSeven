import { z } from "zod";
import { DailyRatePaise, Id, Label } from "./common";

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
});
export const WorkersResponse = z.array(WorkerResponse);

export type CreateWorkerInput = z.infer<typeof CreateWorkerInput>;
export type WorkerResponse = z.infer<typeof WorkerResponse>;
export type WorkersResponse = z.infer<typeof WorkersResponse>;
