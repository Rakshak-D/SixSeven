// Client-only: imported from client components.
import { useState } from "react";
import { toast } from "sonner";
import { ChangeList } from "@/components/approvals/change-list";
import { Button } from "@/components/ui/button";
import { useChangeRequests, useDecideProposal, useProposals } from "@/hooks/use-project-data";
import { ApiClientError } from "@/lib/api/client";
import { actionFor } from "@/lib/change-requests";
import { istDateOf } from "@/lib/dates";
import { formatPaise, formatShortDate } from "@/lib/format";
import { DecideProposalInput, type ProposalResponse } from "@/shared/schemas/proposals";

function impact(p: ProposalResponse) {
  if (p.costImpactPaise === 0) return "No cost change";
  return p.costImpactPaise > 0
    ? `Adds ${formatPaise(p.costImpactPaise)}`
    : `Saves ${formatPaise(-p.costImpactPaise)}`;
}

/** Proposed changes: pending ones first with approve and reject, then the decided ones. */
export function ApprovalsList({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const proposals = useProposals(projectId);
  const decide = useDecideProposal(projectId);
  const changes = useChangeRequests(projectId);
  const waitingChanges = (changes.data ?? []).filter((r) => actionFor("owner", r)).length;

  if (proposals.isPending) return <p className="text-muted-foreground">Loading proposals…</p>;
  if (proposals.isError) return <p className="text-destructive">{proposals.error.message}</p>;

  const pending = proposals.data.filter((p) => p.status === "pending");
  const decided = proposals.data.filter((p) => p.status !== "pending");

  function choose(p: ProposalResponse, decision: "approve" | "reject") {
    const input = DecideProposalInput.safeParse({ decision, note: notes[p.id] ?? "" });
    if (!input.success || decide.isPending) return;
    decide.mutate(
      { proposalId: p.id, ...input.data },
      {
        onSuccess: (r) =>
          toast.success(`${r.status === "approved" ? "Approved" : "Rejected"}: ${r.title}`),
        onError: (e) =>
          toast.error(e instanceof ApiClientError ? e.message : "Couldn't save the decision"),
      },
    );
  }

  return (
    <div className="space-y-6">
      <ChangeList projectId={projectId} viewer="owner" mine />
      {pending.length === 0 && waitingChanges === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-3 text-muted-foreground">
          Nothing is waiting for you.
        </p>
      ) : pending.length === 0 ? null : (
        <ul className="space-y-3">
          {pending.map((p) => {
            const busy = decide.isPending || !notes[p.id]?.trim();
            return (
              <li key={p.id} className="animate-rise rounded-3xl border bg-secondary p-4">
                <p className="font-semibold text-[17px]">{p.title}</p>
                <p className="mt-1 text-[15px] text-ink-2">{p.description}</p>
                <p
                  className={`num mt-2 font-semibold ${p.costImpactPaise > 0 ? "text-primary" : "text-success"}`}
                >
                  {impact(p)}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Proposed {formatShortDate(istDateOf(p.createdAt))}
                </p>
                <label className="mt-3 block text-sm font-medium">
                  Decision note
                  <textarea
                    className="mt-1 block w-full rounded-xl border bg-background px-3 py-2"
                    required
                    maxLength={2000}
                    value={notes[p.id] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNotes((current) => ({ ...current, [p.id]: value }));
                    }}
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1" disabled={busy} onClick={() => choose(p, "approve")}>
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => choose(p, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {decided.length > 0 ? (
        <div>
          <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
            Decided
          </p>
          <ul className="divide-y">
            {decided.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="num block text-[15px] text-muted-foreground">{impact(p)}</span>
                </span>
                <span
                  className={`shrink-0 font-semibold text-sm ${p.status === "approved" ? "text-success" : "text-destructive"}`}
                >
                  {p.status === "approved" ? "Approved" : "Rejected"}
                  {p.decidedAt ? ` · ${formatShortDate(istDateOf(p.decidedAt))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
