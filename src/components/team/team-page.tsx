"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, NativeSelect, SavedNotice } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { useCurrentProject } from "@/components/shell/project-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useInvite,
  useRemoveMember,
  useRevokeInvitation,
  useSentInvitations,
  useTeam,
} from "@/hooks/use-team";
import type { ProjectTeamResponse } from "@/shared/schemas/projects";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;
const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";
type Member = ProjectTeamResponse[number];
type InviteRole = keyof typeof roleLabel;

function InviteForm({ projectId }: { projectId: string }) {
  const invite = useInvite(projectId);
  const revoke = useRevokeInvitation(projectId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("owner");
  const [problem, setProblem] = useState<string>();
  const sent = useSentInvitations(projectId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = firstProblem([[!email.includes("@"), "Enter their email address."]]);
    setProblem(found);
    if (found) return;
    invite.mutate(
      { email, role },
      {
        onSuccess: () => setEmail(""),
      },
    );
  }

  return (
    <section className={card} aria-label="Invite someone">
      <h2 className="text-3xl">Invite someone</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        They sign in with this email and accept. Slate does not send an email; tell them yourself.
      </p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <Field label="Their email">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="Their role">
          {(id) => (
            <NativeSelect id={id} value={role} onChange={(v) => setRole(v as InviteRole)}>
              <option value="owner">Owner</option>
              <option value="contractor">Contractor</option>
              <option value="engineer">Site engineer</option>
            </NativeSelect>
          )}
        </Field>
        <FormError error={problem ?? invite.error} />
        {invite.isSuccess ? <SavedNotice>Invite created.</SavedNotice> : null}
        <Button type="submit" size="lg" className="w-full" disabled={invite.isPending}>
          {invite.isPending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <FormError error={sent.error ?? revoke.error} />
      {sent.data?.length ? (
        <ul className="mt-4 divide-y">
          {sent.data.map((i) => {
            const who = "email" in i ? i.email : i.phone;
            return (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate">
                  {who} · {roleLabel[i.role]}
                </span>
                {i.status === "accepted" ? (
                  <Badge variant="outline">Accepted</Badge>
                ) : (
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">Waiting</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      aria-label={`Revoke the invite for ${who}`}
                      onClick={() =>
                        revoke.mutate(i.id, {
                          onSuccess: () => toast.success(`Invite for ${who} revoked`),
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** Asks before taking someone off the project: they lose access straight away. */
function RemoveSheet({
  projectId,
  member,
  onClose,
}: {
  projectId: string;
  member: Member | null;
  onClose: () => void;
}) {
  const remove = useRemoveMember(projectId);
  return (
    <Sheet
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset();
          onClose();
        }
      }}
      title={member ? `Remove ${member.name}?` : "Remove"}
      description="They lose access to this project at once. Everything they already logged stays, with their name on it. You can invite them again later."
    >
      {member ? (
        <div className="space-y-4">
          <p className="text-[15px]">
            {member.name} · {roleLabel[member.role]}
          </p>
          <FormError error={remove.error} />
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(member.userId, {
                onSuccess: () => {
                  toast.success(`${member.name} removed`);
                  onClose();
                },
              })
            }
          >
            {remove.isPending ? "Removing…" : "Remove from project"}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Everyone on the project, with tap-to-call. Engineers also invite and remove people here. */
export function TeamPage() {
  const project = useCurrentProject();
  const team = useTeam(project.id);
  const isEngineer = project.role === "engineer";
  const [removing, setRemoving] = useState<Member | null>(null);
  return (
    <div className="animate-rise space-y-4">
      <div>
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          {project.name}
        </p>
        <h1 className="mt-2 text-5xl">Team</h1>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={card} aria-label="People on this project">
          <h2 className="text-3xl">People</h2>
          {team.isPending ? (
            <Skeleton className="mt-4 h-40 rounded-2xl" />
          ) : team.isError ? (
            <div className="mt-4">
              <FormError error={team.error} />
            </div>
          ) : (
            <ul className="mt-2 divide-y">
              {team.data.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block text-[15px] text-muted-foreground">
                      {roleLabel[m.role]}
                      {m.phone ? ` · ${m.phone}` : " · no number shared"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    {m.phone ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`}>
                          <Phone aria-hidden="true" />
                          Call
                        </a>
                      </Button>
                    ) : null}
                    {isEngineer && !m.isMe ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${m.name} from the project`}
                        onClick={() => setRemoving(m)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {isEngineer ? <InviteForm projectId={project.id} /> : null}
      </div>
      {isEngineer ? (
        <RemoveSheet projectId={project.id} member={removing} onClose={() => setRemoving(null)} />
      ) : null}
    </div>
  );
}
