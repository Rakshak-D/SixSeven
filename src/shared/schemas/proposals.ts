import { z } from "zod";
import { Id, Label, Note, SignedPaise, Timestamp } from "./common";

const proposal = { title: Label, description: Note, costImpactPaise: SignedPaise };
export const CreateProposalInput = z.strictObject(proposal);
export const DecideProposalInput = z.strictObject({ decision: z.enum(["approve", "reject"]) });
export const ProposalResponse = z.discriminatedUnion("status", [
  z.strictObject({
    ...proposal,
    id: Id,
    createdAt: Timestamp,
    status: z.literal("pending"),
    decidedAt: z.null(),
  }),
  z.strictObject({
    ...proposal,
    id: Id,
    createdAt: Timestamp,
    status: z.enum(["approved", "rejected"]),
    decidedAt: Timestamp,
  }),
]);

export type CreateProposalInput = z.infer<typeof CreateProposalInput>;
export type DecideProposalInput = z.infer<typeof DecideProposalInput>;
export type ProposalResponse = z.infer<typeof ProposalResponse>;
export const ProposalsResponse = z.array(ProposalResponse);
export type ProposalsResponse = z.infer<typeof ProposalsResponse>;
