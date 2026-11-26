"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError, firstProblem, rupeesToPaise } from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAcceptInvitation,
  useCreateProject,
  useMyInvitations,
  useMyPermissions,
} from "@/hooks/use-team";
import { todayIst } from "@/lib/dates";

const roleName = { owner: "owner", contractor: "contractor" } as const;

/** Projects you are invited to. Nothing is shared with you until you accept. */
export function Invitations() {
  const invitations = useMyInvitations(true);
  const accept = useAcceptInvitation();
  if (!invitations.data?.length) return null;
  return (
    <section className="mt-8" aria-label="Your invitations">
      <h2 className="text-3xl">Invitations</h2>
      <ul className="mt-3 space-y-3">
        {invitations.data
          .filter((i) => "email" in i && i.status === "pending")
          .map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-3xl border bg-band p-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-2xl leading-tight">{i.projectName}</span>
                <span className="block text-muted-foreground">
                  Join as {roleName[i.role]} · invited {"email" in i ? i.email : i.phone}
                </span>
              </span>
              <Button
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate(i.id, { onSuccess: () => toast.success(`Joined ${i.projectName}`) })
                }
              >
                Accept
              </Button>
            </li>
          ))}
      </ul>
      <div className="mt-3">
        <FormError error={accept.error} />
      </div>
    </section>
  );
}

/** Whoever starts a project is its site engineer. Owners and contractors never see this. */
export function StartProject() {
  const [open, setOpen] = useState(false);
  const permissions = useMyPermissions();
  if (!permissions.data?.canCreateProjects) return null;
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Start a project
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Start a project"
        description="You become its site engineer, then invite the owner and the contractor."
      >
        {open ? <ProjectForm /> : null}
      </Sheet>
    </>
  );
}

function ProjectForm() {
  const router = useRouter();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(todayIst());
  const [budget, setBudget] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const budgetPaise = rupeesToPaise(budget);
    const found = firstProblem([
      [!name.trim(), "Name the project."],
      [!location.trim(), "Say where the site is."],
      [!startDate, "Pick the start date."],
      [!budgetPaise || budgetPaise <= 0, "Enter the budget in rupees."],
    ]);
    setProblem(found);
    if (found) return;
    create.mutate(
      { name, location, startDate, budgetPaise: budgetPaise as number },
      {
        onSuccess: (p) => {
          toast.success(`Started ${p.name}. Now invite your team.`);
          router.push(`/projects/${encodeURIComponent(p.id)}/team`);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Project name">
        {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Site location">
        {(id) => <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Budget (₹)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          )}
        </Field>
      </div>
      <FormError error={problem ?? create.error} />
      <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
        {create.isPending ? "Starting…" : "Start project"}
      </Button>
    </form>
  );
}
