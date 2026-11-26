import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createAuth } from "@/server/auth";
import { user } from "./auth-schema";
import { getDatabase } from "./client";
import { databaseUrl } from "./config";
import { projectInvitations } from "./schema";

const options = z.strictObject({
  invitationId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(16).max(64),
});

async function main() {
  const url = databaseUrl();
  if (url.pathname.slice(1) !== process.env.SLATE_PROVISION_DATABASE) {
    throw new Error("Set SLATE_PROVISION_DATABASE to the explicitly selected database name");
  }
  const input = options.safeParse({
    invitationId: process.argv[2],
    name: process.argv[3],
    password: process.env.SLATE_PROVISION_PASSWORD,
  });
  if (!input.success) throw new Error("Supply an invitation ID, name and 16–64 character password");
  const { db, sql } = getDatabase();
  try {
    const created = await db.transaction(async (tx) => {
      const [invite] = await tx
        .select({ email: projectInvitations.email })
        .from(projectInvitations)
        .where(
          and(
            eq(projectInvitations.id, input.data.invitationId),
            isNull(projectInvitations.acceptedAt),
          ),
        )
        .for("update");
      if (!invite?.email) return false;
      const [account] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, invite.email));
      if (account) return false;
      await createAuth(tx, { provisioning: true }).api.signUpEmail({
        body: { email: invite.email, name: input.data.name, password: input.data.password },
      });
      return true;
    });
    if (!created) throw new Error("A pending email invitation and a new account are required");
    console.log("Account provisioned. Project access still requires accepting the invitation.");
  } finally {
    await sql.end();
  }
}

main().catch(() => {
  console.error(
    "Provisioning failed. Check the selected database, pending email invitation, account and credential inputs.",
  );
  process.exitCode = 1;
});
