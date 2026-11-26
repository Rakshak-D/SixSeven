import { and, eq, isNull, lt, or } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import type { Db } from "@/db/client";
import { ErrorCode } from "@/shared/errors";
import { ApiError } from "../middleware/errors";

function config() {
  const {
    TWILIO_ACCOUNT_SID: account,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_VERIFY_SERVICE_SID: service,
  } = process.env;
  if (!account?.match(/^AC[0-9a-f]{32}$/i) || !service?.match(/^VA[0-9a-f]{32}$/i) || !token)
    return undefined;
  return { account, token, service };
}
const invalid = () =>
  new ApiError(
    400,
    ErrorCode.VALIDATION_ERROR,
    "The code is invalid or expired. Request a new SMS.",
  );
const unavailable = () =>
  new ApiError(503, ErrorCode.INTERNAL, "SMS verification is unavailable right now.");

async function twilio(route: string, fields: URLSearchParams) {
  const settings = config();
  if (!settings) throw unavailable();
  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${settings.service}/${route}`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${settings.account}:${settings.token}`).toString("base64")}`,
        },
        body: fields,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      },
    );
    if (route === "VerificationCheck" && [400, 404].includes(response.status)) throw invalid();
    if (!response.ok) throw unavailable();
    return (await response.json()) as { sid?: string; status?: string; to?: string };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

export async function phoneVerificationStatus(db: Db, id: string) {
  const [row] = await db
    .select({ phone: user.phone, verified: user.verifiedPhone })
    .from(user)
    .where(eq(user.id, id));
  return {
    phone: row?.phone ?? null,
    verified: Boolean(row?.phone && row.phone === row.verified),
    available: Boolean(config()),
  };
}

export async function startPhoneVerification(db: Db, id: string) {
  if (!config()) throw unavailable();
  const now = new Date();
  const [account] = await db
    .update(user)
    .set({ phoneVerificationStarted: now, phoneVerificationSid: null })
    .where(
      and(
        eq(user.id, id),
        or(
          isNull(user.phoneVerificationStarted),
          lt(user.phoneVerificationStarted, new Date(now.getTime() - 60000)),
        ),
      ),
    )
    .returning({ phone: user.phone });
  if (!account)
    throw new ApiError(
      429,
      ErrorCode.VALIDATION_ERROR,
      "Wait a minute before requesting another code.",
    );
  if (!account.phone)
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Save a contact number first.");
  const result = await twilio(
    "Verifications",
    new URLSearchParams({ To: account.phone, Channel: "sms" }),
  );
  if (
    !result.sid?.match(/^VE[0-9a-f]{32}$/i) ||
    result.to !== account.phone ||
    result.status !== "pending"
  )
    throw unavailable();
  const [saved] = await db
    .update(user)
    .set({ phoneVerificationSid: result.sid })
    .where(
      and(eq(user.id, id), eq(user.phone, account.phone), eq(user.phoneVerificationStarted, now)),
    )
    .returning({ id: user.id });
  if (!saved) throw invalid();
  return phoneVerificationStatus(db, id);
}

export async function checkPhoneVerification(db: Db, id: string, code: string) {
  if (!config()) throw unavailable();
  const [account] = await db.select().from(user).where(eq(user.id, id));
  if (
    !account?.phone ||
    !account.phoneVerificationSid ||
    !account.phoneVerificationStarted ||
    Date.now() - account.phoneVerificationStarted.getTime() > 600000
  )
    throw invalid();
  const result = await twilio(
    "VerificationCheck",
    new URLSearchParams({ VerificationSid: account.phoneVerificationSid, Code: code }),
  );
  if (
    result.status !== "approved" ||
    result.to !== account.phone ||
    result.sid !== account.phoneVerificationSid
  )
    throw invalid();
  try {
    const [saved] = await db
      .update(user)
      .set({ verifiedPhone: account.phone, phoneVerificationSid: null })
      .where(
        and(
          eq(user.id, id),
          eq(user.phone, account.phone),
          eq(user.phoneVerificationSid, account.phoneVerificationSid),
        ),
      )
      .returning({ id: user.id });
    if (!saved) throw invalid();
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      throw new ApiError(409, ErrorCode.CONFLICT, "That number cannot be linked to this account.");
    }
    throw error;
  }
  return phoneVerificationStatus(db, id);
}
