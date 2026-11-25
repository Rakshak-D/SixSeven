import type { Transaction } from "@/db/client";
import { auditLog } from "@/db/schema";

export async function recordAudit(
  tx: Transaction,
  event: Omit<typeof auditLog.$inferInsert, "id" | "createdAt">,
) {
  await tx.insert(auditLog).values({ ...event, id: crypto.randomUUID() });
}
