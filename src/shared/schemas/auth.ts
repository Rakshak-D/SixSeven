import { z } from "zod";
import { Id, Timestamp } from "./common";

export const SignInInput = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});
export const SignOutInput = z.strictObject({}).optional();
const SessionUser = z.object({ id: Id, name: z.string(), email: z.email() });

// Allowlisted browser payloads. The auth bridge projects native success bodies through these schemas.
export const SignInResponse = z.object({ redirect: z.literal(false), user: SessionUser });
export const SignOutResponse = z.object({ success: z.literal(true) });
export const SessionResponse = z
  .object({
    session: z.object({ expiresAt: Timestamp }),
    user: SessionUser,
  })
  .nullable();
export const AuthErrorResponse = z.object({ code: z.string().optional(), message: z.string() });

export const DemoAccountEmail = {
  owner: "owner@demo.invalid",
  contractor: "contractor@demo.invalid",
  engineer: "engineer@demo.invalid",
} as const;

export type SignInInput = z.infer<typeof SignInInput>;
export type SignOutInput = z.infer<typeof SignOutInput>;
export type SignInResponse = z.infer<typeof SignInResponse>;
export type SignOutResponse = z.infer<typeof SignOutResponse>;
export type SessionResponse = z.infer<typeof SessionResponse>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponse>;
