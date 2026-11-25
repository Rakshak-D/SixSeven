// Client-only: imported from client components.
import { X } from "lucide-react";
import { useId } from "react";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/format";
import { defaultSpendFilter, kindLabel, type SpendFilter, windowLabel } from "@/lib/spends";

function Choice<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  options: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="border-b py-4 first:pt-0">
      <legend className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
        {legend}
      </legend>
      {(Object.keys(options) as T[]).map((key) => (
        <label
          key={key}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-2 has-checked:text-foreground"
        >
          <input
            type="radio"
            name={name}
            checked={value === key}
            onChange={() => onChange(key)}
            className="size-5 cursor-pointer accent-(--primary)"
          />
          {options[key]}
        </label>
      ))}
    </fieldset>
  );
}

/** Filters for any list of spends: type, date window and amount range. */
export function SpendFilterSheet({
  open,
  onOpenChange,
  value,
  onChange,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SpendFilter;
  onChange: (value: SpendFilter) => void;
  resultCount: number;
}) {
  const id = useId();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filter"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onChange({ ...defaultSpendFilter, window: "all" })}
          >
            Reset
          </Button>
          <Button size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Show {resultCount} {resultCount === 1 ? "entry" : "entries"}
          </Button>
        </>
      }
    >
      <Choice
        name={`${id}-kind`}
        legend="Type"
        options={kindLabel}
        value={value.kind}
        onChange={(kind) => onChange({ ...value, kind })}
      />
      <Choice
        name={`${id}-window`}
        legend="Date"
        options={windowLabel}
        value={value.window}
        onChange={(window) => onChange({ ...value, window })}
      />
      <div className="pt-4">
        <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-[0.1em]">
          Amount
        </p>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`${id}-min`}>From ₹</Label>
            <Input
              id={`${id}-min`}
              inputMode="numeric"
              placeholder="0"
              value={value.min}
              onChange={(e) => onChange({ ...value, min: e.target.value })}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`${id}-max`}>To ₹</Label>
            <Input
              id={`${id}-max`}
              inputMode="numeric"
              placeholder="Any"
              value={value.max}
              onChange={(e) => onChange({ ...value, max: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** The active filters as removable chips above a list. */
export function SpendFilterChips({
  value,
  onChange,
}: {
  value: SpendFilter;
  onChange: (value: SpendFilter) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (value.kind !== "all")
    chips.push({ label: kindLabel[value.kind], clear: () => onChange({ ...value, kind: "all" }) });
  if (value.window !== "all")
    chips.push({
      label: windowLabel[value.window],
      clear: () => onChange({ ...value, window: "all" }),
    });
  if (value.min || value.max) {
    const min = Number.parseInt(value.min.replace(/\D/g, ""), 10);
    const max = Number.parseInt(value.max.replace(/\D/g, ""), 10);
    const text = `${Number.isNaN(min) ? "₹0" : formatPaise(min * 100)} – ${Number.isNaN(max) ? "any" : formatPaise(max * 100)}`;
    chips.push({ label: text, clear: () => onChange({ ...value, min: "", max: "" }) });
  }
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c.label}>
          <button
            type="button"
            onClick={c.clear}
            aria-label={`Remove filter: ${c.label}`}
            className="inline-flex h-11 animate-fade items-center gap-1.5 rounded-full border border-line-strong pr-3 pl-4 font-semibold text-sm transition-colors duration-(--duration-fast) ease-slate hover:bg-secondary"
          >
            {c.label}
            <X aria-hidden="true" className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
