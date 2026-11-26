import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, inArray } from "drizzle-orm";
import { DemoAccountEmail } from "@/shared/schemas/auth";
import { account, user } from "./auth-schema";
import type { Db, Transaction } from "./client";
import { disposableDatabase } from "./config";

export const demoEmails = [...Object.values(DemoAccountEmail), "isolated@demo.invalid"];

/** The demo password from .env, checked against the same limits as sign-up. */
export function demoPassword() {
  const password = process.env.SLATE_DEMO_PASSWORD;
  if (
    !password ||
    password.length < 8 ||
    password.length > 64 ||
    password.startsWith("replace-with-")
  ) {
    throw new Error("Set SLATE_DEMO_PASSWORD to a local password of 8–64 characters");
  }
  return password;
}

/** True only outside production, with a demo password set, on the loopback slate_demo database. */
export function demoSyncAllowed() {
  if (process.env.NODE_ENV === "production" || !process.env.SLATE_DEMO_PASSWORD) return false;
  try {
    disposableDatabase(process.env.CI === "true" ? "test" : "demo");
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes every existing demo account's password match SLATE_DEMO_PASSWORD, so changing .env and
 * restarting is enough. Accounts that already match are left alone. Returns how many changed.
 */
export async function syncDemoPasswords(db: Db | Transaction) {
  const password = demoPassword();
  const rows = await db
    .select({ id: account.id, hash: account.password })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(inArray(user.email, demoEmails), eq(account.providerId, "credential")));
  let changed = 0;
  for (const row of rows) {
    if (row.hash && (await verifyPassword({ hash: row.hash, password }))) continue;
    await db
      .update(account)
      .set({ password: await hashPassword(password) })
      .where(eq(account.id, row.id));
    changed++;
  }
  return changed;
}
