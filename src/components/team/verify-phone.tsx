"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Field, FormError } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { mocksEnabled } from "@/mocks";
import {
  MyPhoneResponse,
  PhoneVerificationStatus,
  UpdateMyPhoneInput,
  VerifyPhoneCodeInput,
} from "@/shared/schemas/projects";

export function VerifyPhone() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const client = useQueryClient();
  const key = ["phone-verification"];
  const base = "/me/phone-verification";
  const status = useQuery({
    queryKey: key,
    enabled: !mocksEnabled,
    queryFn: () => api("GET", base, { schema: PhoneVerificationStatus }),
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ["invitations"] }),
      client.invalidateQueries({ predicate: ({ queryKey }) => queryKey[1] === "team" }),
    ]);
  const start = useMutation({
    mutationFn: () => api("POST", `${base}/start`, { schema: PhoneVerificationStatus }),
    onSuccess: refresh,
  });
  const check = useMutation({
    mutationFn: () =>
      api("POST", `${base}/check`, {
        body: VerifyPhoneCodeInput.parse({ code }),
        schema: PhoneVerificationStatus,
      }),
    onSuccess: () => {
      setCode("");
      return refresh();
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api("PATCH", "/me", { body: UpdateMyPhoneInput.parse({ phone }), schema: MyPhoneResponse }),
    onSuccess: refresh,
  });
  if (mocksEnabled) return null;
  const busy = start.isPending || check.isPending || save.isPending;
  return (
    <details className="rounded-2xl border bg-card p-4">
      <summary className="cursor-pointer font-medium">Verify a phone invitation</summary>
      <div className="mt-3 space-y-2">
        {status.data?.verified ? (
          <output>Verified phone. Any pending invitations are listed with your projects.</output>
        ) : null}
        {status.data && !status.data.available ? (
          <p>SMS verification is unavailable until the service is configured.</p>
        ) : null}
        {status.data?.available && !status.data.verified ? (
          <>
            <Field label="Phone for invitation verification">
              {(id) => (
                <Input
                  id={id}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              )}
            </Field>
            <Button disabled={busy || !phone.trim()} onClick={() => save.mutate()}>
              Save number to verify
            </Button>
            {status.data.phone ? (
              <Button variant="outline" disabled={busy} onClick={() => start.mutate()}>
                Send code to {status.data.phone}
              </Button>
            ) : null}
            {start.isSuccess ? (
              <>
                <Field label="SMS verification code">
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  )}
                </Field>
                <Button
                  disabled={busy || !VerifyPhoneCodeInput.safeParse({ code }).success}
                  onClick={() => check.mutate()}
                >
                  Verify phone
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        <FormError error={status.error ?? save.error ?? start.error ?? check.error} />
      </div>
    </details>
  );
}
