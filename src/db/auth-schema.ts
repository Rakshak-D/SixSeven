import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

const authTime = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text(),
    phone: text(),
    verifiedPhone: text("verified_phone").unique(),
    phoneVerificationSid: text("phone_verification_sid"),
    phoneVerificationStarted: authTime("phone_verification_started"),
    createdAt: authTime("created_at").notNull().defaultNow(),
    updatedAt: authTime("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "user_verified_phone_matches",
      sql`${t.verifiedPhone} is null or (${t.phone} is not null and ${t.verifiedPhone} = ${t.phone})`,
    ),
    check("user_indian_mobile", sql`${t.phone} is null or ${t.phone} ~ '^[+]91[6-9][0-9]{9}$'`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: authTime("expires_at").notNull(),
    token: text().notNull().unique(),
    createdAt: authTime("created_at").notNull().defaultNow(),
    updatedAt: authTime("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId), index("session_expiry_idx").on(t.expiresAt)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: authTime("access_token_expires_at"),
    refreshTokenExpiresAt: authTime("refresh_token_expires_at"),
    scope: text(),
    password: text(),
    createdAt: authTime("created_at").notNull().defaultNow(),
    updatedAt: authTime("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("account_user_idx").on(t.userId),
    unique("account_provider_identity_unique").on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: authTime("expires_at").notNull(),
    createdAt: authTime("created_at").notNull().defaultNow(),
    updatedAt: authTime("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
