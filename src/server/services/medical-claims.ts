import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db, Transaction } from "@/db/client";
import { changeRequests, expenses, medicalBillPhotos, medicalClaims, workers } from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import type { MedicalExpenseFields } from "@/shared/schemas/change-requests";
import { PhotoMime } from "@/shared/schemas/progress";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import type { StoredPhoto } from "./photo-storage";
import { readStoredPhoto } from "./photo-storage";
import { requireProjectAccess } from "./projects";

const missing = () => new ApiError(404, ErrorCode.NOT_FOUND, "Medical claim or evidence not found");

export async function requireClaimWorker(tx: Transaction, projectId: string, workerId: string) {
  const [worker] = await tx
    .select({ id: workers.id })
    .from(workers)
    .where(and(eq(workers.projectId, projectId), eq(workers.id, workerId)));
  if (!worker) throw missing();
}

export async function insertMedicalClaim(
  tx: Transaction,
  projectId: string,
  requestId: string,
  input: MedicalExpenseFields,
  photos: StoredPhoto[],
  captures: Date[],
  receivedAt: Date,
) {
  await tx.insert(medicalClaims).values({
    projectId,
    requestId,
    workerId: input.workerId,
    billPaise: input.billPaise,
    incidentOn: input.incidentOn,
  });
  await tx.insert(medicalBillPhotos).values(
    photos.map((photo, i) => ({
      ...photo,
      id: crypto.randomUUID(),
      projectId,
      requestId,
      capturedAt: captures[i],
      receivedAt,
    })),
  );
}

export async function medicalClaimView(tx: Transaction, projectId: string, requestId: string) {
  const [claim] = await tx
    .select()
    .from(medicalClaims)
    .where(and(eq(medicalClaims.projectId, projectId), eq(medicalClaims.requestId, requestId)));
  if (!claim) throw missing();
  const photos = await tx
    .select()
    .from(medicalBillPhotos)
    .where(
      and(eq(medicalBillPhotos.projectId, projectId), eq(medicalBillPhotos.requestId, requestId)),
    )
    .orderBy(asc(medicalBillPhotos.capturedAt), asc(medicalBillPhotos.id));
  return {
    payPaise: claim.reimbursementPaise,
    reimbursementProvider: "mock" as const,
    payload: {
      workerId: claim.workerId,
      billPaise: claim.billPaise,
      incidentOn: claim.incidentOn,
      billPhotos: photos.map((photo) => ({
        id: photo.id,
        mime: photo.mime,
        sizeBytes: photo.sizeBytes,
        capturedAt: photo.capturedAt.toISOString(),
        receivedAt: photo.receivedAt.toISOString(),
        takenOn: new Date(photo.capturedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10),
        url: `/api/v1/projects/${projectId}/medical-expenses/${requestId}/photos/${photo.id}`,
      })),
    },
  };
}

export async function reimburseMedicalClaim(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  requestId: string,
  amount: number | undefined,
) {
  const [claim] = await tx
    .select()
    .from(medicalClaims)
    .where(and(eq(medicalClaims.projectId, projectId), eq(medicalClaims.requestId, requestId)))
    .for("update");
  if (!claim) throw missing();
  if (amount === undefined || amount < 1 || amount > claim.billPaise) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "Reimbursement must be between one paise and the bill amount",
    );
  }
  const [updated] = await tx
    .update(medicalClaims)
    .set({ reimbursementPaise: amount })
    .where(and(eq(medicalClaims.requestId, requestId), isNull(medicalClaims.reimbursementPaise)))
    .returning({ id: medicalClaims.requestId });
  if (!updated) throw new ApiError(409, ErrorCode.CONFLICT, "Claim has already been reimbursed");
  // The claim ID is the unique expense ID. The mock reimbursement and owner decision share a transaction.
  await tx.insert(expenses).values({
    id: requestId,
    projectId,
    amountPaise: amount,
    occurredOn: claim.incidentOn,
    description: "Mock medical reimbursement",
    createdBy: actor.userId,
  });
}

export async function getMedicalBillPhoto(
  db: Db,
  actor: Actor,
  projectId: string,
  requestId: string,
  photoId: string,
) {
  const photo = await db.transaction(
    async (tx) => {
      const { role } = await requireProjectAccess(tx, actor, projectId);
      const [row] = await tx
        .select({ authorId: changeRequests.authorId, photo: medicalBillPhotos })
        .from(medicalBillPhotos)
        .innerJoin(
          changeRequests,
          and(
            eq(changeRequests.projectId, medicalBillPhotos.projectId),
            eq(changeRequests.id, medicalBillPhotos.requestId),
          ),
        )
        .where(
          and(
            eq(medicalBillPhotos.projectId, projectId),
            eq(medicalBillPhotos.requestId, requestId),
            eq(medicalBillPhotos.id, photoId),
          ),
        );
      if (!row || (role === "engineer" && row.authorId !== actor.userId)) throw missing();
      return row.photo;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const bytes = await readStoredPhoto(photo.storageKey);
  if (!bytes) throw missing();
  if (bytes.byteLength !== photo.sizeBytes)
    throw new Error("Stored medical photo size does not match metadata");
  return { bytes, mime: PhotoMime.parse(photo.mime) };
}
