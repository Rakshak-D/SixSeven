"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/api/auth";
import { api } from "@/lib/api/client";
import { mocksEnabled } from "@/mocks";
import { DemoAccountEmail } from "@/shared/schemas/auth";
import { InvitationSignUpInput, InvitationSignUpResponse } from "@/shared/schemas/projects";

/**
 * Email and password sign-in, plus account creation for someone the engineer invited by email.
 * On demo data there is no session, so it points at the demo projects.
 */
export function LoginForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || (joining && !name.trim())) {
      setError(
        joining ? "Enter your name, email and a password." : "Enter your email and password.",
      );
      return;
    }
    const account = InvitationSignUpInput.safeParse({ email, name, password });
    if (joining && !account.success) {
      setError("Use a valid email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (joining && account.success) {
        await api("POST", "/invitations/signup", {
          body: account.data,
          schema: InvitationSignUpResponse,
        });
      }
      await signIn(email.trim(), password);
      await client.invalidateQueries();
      router.replace("/projects");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-5xl">{joining ? "Join your project" : "Sign in"}</h1>
      <p className="mt-2 text-ink-2">
        {joining
          ? "Use the email your engineer invited. You accept the invitation after signing in."
          : "Slate, every detail accounted for."}
      </p>
      {mocksEnabled ? (
        <div className="mt-6 rounded-2xl border border-dashed px-4 py-3 text-[15px] text-muted-foreground">
          This copy runs on demo data, so there is nothing to sign in to.{" "}
          <Link href="/projects" className="font-semibold text-foreground underline">
            Open the demo projects
          </Link>
          .
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-[1.75rem] border bg-card p-5 sm:p-6"
        >
          {joining ? (
            <Field label="Your name">
              {(id) => (
                <Input
                  id={id}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Field label="Email">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label="Password" hint={joining ? "At least 8 characters." : undefined}>
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete={joining ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? joining
                ? "Creating…"
                : "Signing in…"
              : joining
                ? "Create account"
                : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setJoining(!joining);
              setError(null);
            }}
          >
            {joining ? "I already have an account" : "Invited? Create your account"}
          </Button>
          {joining ? null : (
            <p className="text-[14px] text-muted-foreground">
              Demo accounts: {Object.values(DemoAccountEmail).join(", ")}. The password is
              SLATE_DEMO_PASSWORD in your local .env.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
