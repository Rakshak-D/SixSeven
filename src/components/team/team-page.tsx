"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
import { Field, FormError, NativeSelect, SavedNotice } from "@/components/forms";
import { useCurrentProject } from "@/components/shell/project-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvite, useSentInvitations, useTeam } from "@/hooks/use-team";
import { CreateProjectInvitationInput } from "@/shared/schemas/projects";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;
const card = "rounded-[1.75rem] border bg-card p-5 sm:p-6";

function InviteForm({ projectId }: { projectId: string }) {
  const invite = useInvite(projectId);
  const [contact, setContact] = useState("");
  const sent = useSentInvitations(projectId);
  const [role, setRole] = useState<"owner" | "contractor">("owner");
  const [problem, setProblem] = useState<string>();
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const candidate = contact.includes("@") ? { email: contact, role } : { phone: contact, role };
    const parsed = CreateProjectInvitationInput.safeParse(candidate);
    setProblem(parsed.success ? undefined : "Enter a valid email or Indian mobile number.");
    if (parsed.success && !invite.isPending) {
      invite.mutate(parsed.data, { onSuccess: () => setContact("") });
    }
  }

  return (
    <section className={card} aria-label="Invite someone">
      <h2 className="text-3xl">Invite someone</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Email invitees sign in and accept. Tell them about the invitation directly. Phone redemption
        requires verified ownership and is currently unavailable.
      </p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <Field label="Their email or mobile number">
          {(id) => (
            <Input
              id={id}
              type="text"
              autoComplete="off"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          )}
        </Field>
        <Field label="Their role">
          {(id) => (
            <NativeSelect id={id} value={role} onChange={(v) => setRole(v as typeof role)}>
              <option value="owner">Owner</option>
              <option value="contractor">Contractor</option>
            </NativeSelect>
          )}
        </Field>
        <FormError error={problem ?? invite.error} />
        {invite.isSuccess ? <SavedNotice>Invite created.</SavedNotice> : null}
        <Button type="submit" size="lg" className="w-full" disabled={invite.isPending}>
          {invite.isPending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <FormError error={sent.error} />
      {sent.data?.length ? (
        <ul className="mt-4 divide-y">
          {sent.data.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 truncate">
                {"email" in i ? i.email : i.phone} · {roleLabel[i.role]}
              </span>
              <Badge variant="outline">{i.status === "accepted" ? "Accepted" : "Pending"}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Everyone on the project, with tap-to-call. The engineer also invites from here. */
export function TeamPage() {
  const project = useCurrentProject();
  const team = useTeam(project.id);
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
                <li key={m.userId} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block text-[15px] text-muted-foreground">
                      {roleLabel[m.role]}
                      {m.phone ? ` · ${m.phone}` : " · no number shared"}
                    </span>
                  </span>
                  {m.phone ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`}>
                        <Phone aria-hidden="true" />
                        Call
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        {project.role === "engineer" ? <InviteForm projectId={project.id} /> : null}
      </div>
    </div>
  );
}
