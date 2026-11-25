const PAISE_PER_RUPEE = 100;
const LAKH = 1_00_000 * PAISE_PER_RUPEE;
const CRORE = 1_00_00_000 * PAISE_PER_RUPEE;

const exact = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Exact amount in Indian grouping: 223145000 paise → "₹22,31,450". */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "−" : "";
  return `${sign}₹${exact.format(Math.abs(paise) / PAISE_PER_RUPEE)}`;
}

/** Short Indian units for big numbers: "₹22.3 L", "₹4.5 Cr"; under a lakh stays exact. */
export function formatPaiseShort(paise: number): string {
  const abs = Math.abs(paise);
  const sign = paise < 0 ? "−" : "";
  const short = (value: number, unit: string) => {
    const rounded = Math.round(value * 10) / 10;
    return `${sign}₹${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${unit}`;
  };
  if (abs >= CRORE) return short(abs / CRORE, "Cr");
  if (abs >= LAKH) return short(abs / LAKH, "L");
  return formatPaise(paise);
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A calendar date from the API ("2026-08-18") as "18 Aug 2026", without time-zone drift. */
export function formatIsoDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** A material quantity in Indian grouping, up to three decimals: 6000 → "6,000", 2.5 → "2.5". */
export function formatQty(qty: number): string {
  return qtyFormat.format(qty);
}

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** Site (IST) time of a timestamp: "4:10 pm". */
export function formatTimeIst(timestamp: string): string {
  return timeFormat.format(new Date(timestamp)).replace(/\s+/g, " ").toLowerCase();
}

const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "25 Nov" for an ISO date. */
export function formatShortDate(isoDate: string): string {
  return shortDate.format(new Date(`${isoDate}T00:00:00Z`));
}
