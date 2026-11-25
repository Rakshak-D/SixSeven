import type { ZodType } from "zod";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import { requireActor } from "../middleware/auth";

export const projectAuth: [typeof requireActor] = [requireActor];
export const json = <T extends ZodType>(schema: T) => ({ "application/json": { schema } });
export const projectBody = <T extends ZodType>(schema: T) => ({
  params: IdParams,
  body: { required: true, content: json(schema) },
});
const error = (description: string) => ({ description, content: json(ErrorResponse) });
export const projectErrors = {
  400: error("Invalid request"),
  401: error("Sign in required"),
  403: error("Forbidden"),
  404: error("Not found"),
  500: error("Unexpected error"),
};
