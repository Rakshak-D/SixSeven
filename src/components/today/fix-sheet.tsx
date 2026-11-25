"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Field,
  FormError,
  firstProblem,
  NativeSelect,
  parseQty,
  rupeesToPaise,
  TextArea,
} from "@/components/forms";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateAdjustment, useCreateChange } from "@/hooks/use-project-data";
import type { AdjustmentResponse } from "@/shared/schemas/adjustments";

/** What is being fixed. `current` is the value in force now, in the unit the form shows. */
export type FixTarget =
  | { table: "stock_movements"; id: string; title: string; current: number; unit: string }
  | { table: "attendance"; id: string; title: string; current: 0 | 1 | 2 }
  | { table: "wage_payments"; id: string; title: string; currentPaise: number };

const halfDayLabel = { 0: "Absent", 1: "Half day", 2: "Full day" } as const;

/**
 * The newest correction for a record, or its original value. Corrections are append-only, so the
 * list is newest first and the first match for a target is the value in force.
 */
export function effectiveValue<T extends number>(
  adjustments: AdjustmentResponse[] | undefined,
  targetId: string,
  original: T,
): number {
  return adjustments?.find((a) => a.targetId === targetId)?.newValue ?? original;
}

/** One form for all three kinds of fix. The original stays on record; the reason is required. */
export function FixSheet({
  projectId,
  target,
  onClose,
}: {
  projectId: string;
  target: FixTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Fix an entry"
      description="The original stays on record with your reason next to it."
    >
      {target ? (
        <FixForm key={target.id} projectId={projectId} target={target} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

function FixForm({
  projectId,
  target,
  onClose,
}: {
  projectId: string;
  target: FixTarget;
  onClose: () => void;
}) {
  const direct = useCreateAdjustment(projectId);
  const request = useCreateChange(projectId);
  const attendance = target.table === "attendance";
  const save = attendance ? request : direct;
  const [reasonKind, setReasonKind] = useState<"other" | "medical_emergency">("other");
  const [payFullDay, setPayFullDay] = useState(false);
  const [value, setValue] = useState(
    target.table === "stock_movements"
      ? String(target.current)
      : target.table === "attendance"
        ? String(target.current)
        : String(target.currentPaise / 100),
  );
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = firstProblem([
      [
        target.table === "stock_movements"
          ? parseQty(value) === undefined
          : target.table === "wage_payments"
            ? !rupeesToPaise(value)
            : false,
        "Enter the correct value as a number.",
      ],
      [reason.trim().length < 10, "Say why it is wrong, in at least 10 characters."],
    ]);
    setProblem(found);
    if (found) return;
    // The hooks check the body with the shared schema and show its message for a bad value.
    if (target.table === "attendance") {
      const payload = {
        newValue: Number(value) as 0 | 1 | 2,
        reasonKind,
        payFullDay: reasonKind === "medical_emergency" && payFullDay,
      };
      request.mutate(
        { kind: "attendance_fix", targetId: target.id, payload, note: reason },
        {
          onSuccess: () => {
            toast.success("Fix sent for approval");
            onClose();
          },
        },
      );
      return;
    }
    const common = { targetId: target.id, reason };
    const body =
      target.table === "stock_movements"
        ? { ...common, targetTable: target.table, newValue: parseQty(value) }
        : { ...common, targetTable: target.table, newValue: rupeesToPaise(value) };
    direct.mutate(body as never, { onSuccess: onClose });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="font-semibold">{target.title}</p>
      {target.table === "attendance" ? (
        <Field label="Correct value">
          {(id) => (
            <NativeSelect id={id} value={value} onChange={setValue}>
              {([0, 1, 2] as const).map((v) => (
                <option key={v} value={v}>
                  {halfDayLabel[v]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ) : (
        <Field
          label={
            target.table === "stock_movements"
              ? `Correct quantity (${target.unit})`
              : "Correct amount (₹)"
          }
          hint={target.table === "stock_movements" ? "Enter 0 to reverse the entry." : undefined}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </Field>
      )}
      {attendance ? (
        <>
          <Field label="Kind of fix">
            {(id) => (
              <NativeSelect
                id={id}
                value={reasonKind}
                onChange={(v) => setReasonKind(v as typeof reasonKind)}
              >
                <option value="other">Marked wrong</option>
                <option value="medical_emergency">Medical emergency</option>
              </NativeSelect>
            )}
          </Field>
          {reasonKind === "medical_emergency" ? (
            <label className="flex min-h-11 items-center gap-3 font-semibold text-[15px]">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={payFullDay}
                onChange={(e) => setPayFullDay(e.target.checked)}
              />
              Pay full day
            </label>
          ) : null}
          <p className="text-[14px] text-muted-foreground">
            Attendance changes only after the owner accepts.
          </p>
        </>
      ) : null}
      <Field
        label="Why is it wrong?"
        hint="At least 10 characters. Everyone on the project can read this."
      >
        {(id) => (
          <TextArea
            id={id}
            value={reason}
            onChange={setReason}
            placeholder="Miscounted bags at the gate"
          />
        )}
      </Field>
      <FormError error={problem ?? save.error} />
      <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Saving…" : attendance ? "Send for approval" : "Save fix"}
      </Button>
    </form>
  );
}
