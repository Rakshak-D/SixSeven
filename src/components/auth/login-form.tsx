"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/api/auth";
import { mocksEnabled } from "@/mocks";
import { DemoAccountEmail } from "@/shared/schemas/auth";

/** Email and password sign-in. On demo data there is no session, so it points at the demo projects. */
export function LoginForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
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
      <h1 className="text-5xl">Sign in</h1>
      <p className="mt-2 text-ink-2">Slate, every detail accounted for.</p>
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
          <Field label="Password">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-[14px] text-muted-foreground">
            Demo accounts: {Object.values(DemoAccountEmail).join(", ")}. The password is
            SLATE_DEMO_PASSWORD in your local .env.
          </p>
        </form>
      )}
    </main>
  );
}
