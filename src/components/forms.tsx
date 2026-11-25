"use client";

import { type ReactNode, useId } from "react";

/** Same look as the Input primitive, shared by native selects and textareas. */
export const controlClass =
  "w-full min-w-0 rounded-xl border border-input bg-secondary px-4 text-base outline-none transition-colors duration-(--duration-fast) ease-slate placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/** A labelled control. The label is tied to the control through the id passed to `children`. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold text-[15px]">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-[14px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Native select: the best picker on a phone, and styled like the other controls. */
export function NativeSelect({
  id,
  value,
  onChange,
  children,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`${controlClass} h-12`}
    >
      {children}
    </select>
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={3}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${controlClass} py-3`}
    />
  );
}

/** The message of a failed save, in plain words. Only API and validation errors carry safe text. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Something went wrong. Try again.";
  return (
    <p
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[15px]"
    >
      {message}
    </p>
  );
}

export function SavedNotice({ children }: { children: ReactNode }) {
  return (
    <output className="block rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-[15px]">
      {children}
    </output>
  );
}

/** "12.5" → 12.5, "" or "abc" → undefined. Rounded to the thousandths the API stores. */
export function parseQty(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined;
}

/** Rupees as typed ("415.50") to whole paise; undefined when it is not a number. */
export function rupeesToPaise(text: string): number | undefined {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

/** The first failed check's message, so a blank field gets a plain sentence, not a schema error. */
export function firstProblem(checks: [failed: boolean, message: string][]): string | undefined {
  return checks.find(([failed]) => failed)?.[1];
}
