import { Package, Wallet } from "lucide-react";
import { formatPaise, formatShortDate } from "@/lib/format";
import type { Spend } from "@/lib/spends";

/** One money-out line: kind icon, what and who, amount, date. */
export function SpendRow({ spend, showDate = true }: { spend: Spend; showDate?: boolean }) {
  const Icon = spend.kind === "materials" ? Package : Wallet;
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${spend.kind === "materials" ? "bg-materials/15 text-materials" : "bg-wages/15 text-wages"}`}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{spend.title}</span>
        <span className="block truncate text-[15px] text-muted-foreground">
          {spend.detail}
          {spend.fixed ? " · fixed" : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="num block font-semibold">−{formatPaise(spend.amountPaise)}</span>
        {showDate ? (
          <span className="block text-[13px] text-muted-foreground">
            {formatShortDate(spend.date)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** A day's wage payments as one line that opens to show each worker. */
export function WageDayRow({ rows, amountPaise }: { rows: Spend[]; amountPaise: number }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-wages/15 text-wages"
          >
            <Wallet className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">Wages · {rows.length} payments</span>
            <span className="block truncate text-[15px] text-muted-foreground">
              <span className="group-open:hidden">Show each worker</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </span>
          <span className="num shrink-0 font-semibold">−{formatPaise(amountPaise)}</span>
        </summary>
        <ul className="mb-2 ml-14 divide-y border-l pl-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
              <span className="min-w-0 truncate">
                {r.title.replace(/^Wages · /, "")}
                <span className="text-muted-foreground">
                  {" "}
                  · {r.detail}
                  {r.fixed ? " · fixed" : ""}
                </span>
              </span>
              <span className="num shrink-0">{formatPaise(r.amountPaise)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
