"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  rupeesToPaise,
  TextArea,
} from "@/components/forms";
import { ProofPhoto } from "@/components/photos/proof-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useChangeRequests,
  useChecklists,
  useDecideChange,
  useReopenChange,
  useRoster,
  useVoteChange,
} from "@/hooks/use-project-data";
import { actionFor, describeChange, eventText, roleText, statusText } from "@/lib/change-requests";
import { istDateOf } from "@/lib/dates";
import { formatPaise, formatShortDate, formatTimeIst } from "@/lib/format";
import type { ChangeRequest } from "@/shared/schemas/change-requests";
import type { Role } from "@/shared/schemas/common";

const statusClass: Record<ChangeRequest["status"], string> = {
  pending_contractor: "bg-warning/15 text-warning",
  pending_owner: "bg-warning/15 text-warning",
  rejected_contractor: "bg-destructive/15 text-destructive",
  rejected_owner: "bg-destructive/15 text-destructive",
  accepted: "bg-success/15 text-success",
};

/** Every step so far, oldest first. Steps are only ever added. */
function Trail({ events }: { events: ChangeRequest["events"] }) {
  return (
    <ol className="mt-3 space-y-2 border-l-2 pl-3">
      {events.map((e) => (
        <li key={`${e.kind}-${e.at}`} className="text-[15px]">
          <span className="font-semibold">{eventText[e.kind]}</span>
          <span className="text-muted-foreground">
            {" "}
            · {roleText[e.role]}, {formatShortDate(istDateOf(e.at))} {formatTimeIst(e.at)}
          </span>
          <span className="block break-words text-ink-2">“{e.note}”</span>
        </li>
      ))}
    </ol>
  );
}

/** The note and buttons for whoever has to act now: vote, reopen, or the owner's final decision. */
function Actions({
  projectId,
  request,
  action,
  title,
}: {
  projectId: string;
  request: ChangeRequest;
  action: "vote" | "reopen" | "decide";
  title: string;
}) {
  const vote = useVoteChange(projectId);
  const reopen = useReopenChange(projectId);
  const decide = useDecideChange(projectId);
  const [note, setNote] = useState("");
  const [payChoice, setPayChoice] = useState<"full" | "part">("full");
  const [part, setPart] = useState("");
  const [problem, setProblem] = useState<string>();
  const bill = request.kind === "medical_expense" ? request.payload.billPaise : undefined;
  const busy = vote.isPending || reopen.isPending || decide.isPending;

  function run(yes: boolean) {
    const paying = action === "decide" && yes && bill !== undefined;
    const pay = payChoice === "full" ? bill : rupeesToPaise(part);
    const found = firstProblem([
      [!note.trim(), "Add a note first."],
      [
        paying && (!pay || pay <= 0 || pay > (bill ?? 0)),
        `Enter an amount up to ${formatPaise(bill ?? 0)}.`,
      ],
    ]);
    setProblem(found);
    if (found) return;
    const requestId = request.id;
    const done = (message: string) => ({ onSuccess: () => toast.success(`${message}: ${title}`) });
    if (action === "vote") {
      vote.mutate(
        { requestId, body: { approve: yes, note } },
        done(yes ? "Sent to the owner" : "Rejected"),
      );
    } else if (action === "reopen") {
      reopen.mutate({ requestId, body: { note } }, done("Reopened"));
    } else {
      decide.mutate(
        {
          requestId,
          body: yes
            ? { accept: true, note, ...(paying ? { payPaise: pay } : {}) }
            : { accept: false, note },
        },
        done(yes ? "Accepted" : "Rejected"),
      );
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {action === "decide" && bill !== undefined ? (
        <>
          <Field label="If you accept, pay" hint="Mock payment. No real money moves.">
            {(id) => (
              <NativeSelect
                id={id}
                value={payChoice}
                onChange={(v) => setPayChoice(v as typeof payChoice)}
              >
                <option value="full">In full · {formatPaise(bill)}</option>
                <option value="part">Part of the bill</option>
              </NativeSelect>
            )}
          </Field>
          {payChoice === "part" ? (
            <Field label="Amount to pay (₹)">
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={part}
                  onChange={(e) => setPart(e.target.value)}
                />
              )}
            </Field>
          ) : null}
        </>
      ) : null}
      <Field
        label="Your note"
        hint={action === "decide" ? "Required. Your decision is final." : "Required."}
      >
        {(id) => <TextArea id={id} value={note} onChange={setNote} />}
      </Field>
      <FormError error={problem ?? vote.error ?? reopen.error ?? decide.error} />
      {action === "reopen" ? (
        <Button className="w-full" disabled={busy} onClick={() => run(true)}>
          Reopen for a new vote
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(false)}>
            {action === "vote" ? "Vote no" : "Reject"}
          </Button>
          <Button disabled={busy} onClick={() => run(true)}>
            {action === "vote" ? "Vote yes" : "Accept"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Changes that need approval. `mine` shows only what this role must act on now; otherwise all of
 * them, with the ones to act on first.
 */
export function ChangeList({
  projectId,
  viewer,
  mine = false,
  settled = false,
}: {
  projectId: string;
  viewer: Role;
  mine?: boolean;
  /** Only what this role has nothing to do on: the history beside a `mine` list. */
  settled?: boolean;
}) {
  const changes = useChangeRequests(projectId);
  const checklists = useChecklists(projectId);
  const roster = useRoster(projectId);

  if (changes.isPending) return <Skeleton className="h-32 rounded-3xl" />;
  if (changes.isError) return <FormError error={changes.error} />;

  // Every item, removed ones too, so the history can still name them.
  const items = (checklists.data ?? []).flatMap((c) => c.items);
  const lookups = { items, roster: roster.data };
  const all = changes.data.map((request) => ({ request, action: actionFor(viewer, request) }));
  const shown = mine
    ? all.filter((c) => c.action)
    : settled
      ? all.filter((c) => !c.action)
      : [...all].sort((a, b) => Number(Boolean(b.action)) - Number(Boolean(a.action)));
  if (shown.length === 0) {
    return mine || settled ? null : (
      <p className="text-muted-foreground">No changes have been asked for.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {shown.map(({ request, action }) => {
        const { title, detail } = describeChange(request, lookups);
        return (
          <li key={request.id} className="rounded-3xl border bg-secondary p-4">
            <p className="font-semibold text-[17px]">{title}</p>
            <p className="mt-1 break-words text-[15px] text-ink-2">{detail}</p>
            <p
              className={`mt-2 inline-block rounded-full px-3 py-1 font-semibold text-[13px] ${statusClass[request.status]}`}
            >
              {statusText[request.status]}
            </p>
            {request.kind === "medical_expense" ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {request.payload.billPhotos.map((photo) => (
                  <ProofPhoto key={photo.id} url={photo.url} alt="Photo of the medical bill" />
                ))}
              </div>
            ) : null}
            <Trail events={request.events} />
            {action ? (
              <Actions projectId={projectId} request={request} action={action} title={title} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
