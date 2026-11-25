"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api/auth";
import { formatPaiseShort } from "@/lib/format";
import { mocksEnabled } from "@/mocks";
import type { ProjectResponse } from "@/shared/schemas/projects";

const roleLabel = { owner: "Owner", contractor: "Contractor", engineer: "Engineer" } as const;

/** Switch between projects; with per-project roles this also switches the role. */
export function ProjectSwitcher({
  current,
  projects,
}: {
  current: ProjectResponse;
  projects: ProjectResponse[];
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const client = useQueryClient();

  async function leave() {
    setSigningOut(true);
    try {
      await signOut();
      client.clear();
      router.replace("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="max-w-full justify-start px-3"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Switch project, current ${current.name}`}
      >
        <span className="truncate">{current.name}</span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground" />
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Projects"
        description="Your role differs per project."
      >
        <ul className="-mx-3 space-y-1">
          {projects.map((p) => {
            const isCurrent = p.id === current.id;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${encodeURIComponent(p.id)}`}
                  onClick={() => setOpen(false)}
                  aria-current={isCurrent ? "page" : undefined}
                  className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-(--duration-fast) ease-slate hover:bg-secondary aria-[current=page]:bg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-[15px] text-muted-foreground">
                      {roleLabel[p.role]} · {p.location} · {formatPaiseShort(p.budgetPaise)}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Check aria-label="Current project" className="size-5 text-primary" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          This project
        </p>
        <Link
          href={`/projects/${encodeURIComponent(current.id)}/team`}
          onClick={() => setOpen(false)}
          className="-mx-3 mt-2 flex min-h-12 items-center rounded-2xl px-3 font-semibold hover:bg-secondary"
        >
          {current.role === "engineer" ? "Team and invites" : "Team"}
        </Link>
        <Link
          href="/projects"
          onClick={() => setOpen(false)}
          className="-mx-3 flex min-h-12 items-center rounded-2xl px-3 font-semibold hover:bg-secondary"
        >
          All projects and invitations
        </Link>
        <ul className="space-y-1 text-muted-foreground">
          {["Project settings"].map((item) => (
            <li key={item} className="flex min-h-12 items-center justify-between">
              <span>{item}</span>
              <span className="text-sm">Not built yet</span>
            </li>
          ))}
        </ul>
        {mocksEnabled ? null : (
          <Button variant="outline" className="mt-6 w-full" onClick={leave} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        )}
      </Sheet>
    </>
  );
}
