/**
 * Money is always an integer number of paise (₹1 = 100 paise).
 * DB columns are bigint (drizzle mode "number"); JSON carries plain integers.
 * Never store or add rupees as floats. Convert only at the edges with these helpers.
 */
export type Paise = number;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function assertPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Not an integer paise amount: ${value}`);
  }
  return value;
}

/** "420" or "420.5" (rupees, as typed in a form) -> 42050 paise. Rejects more than 2 decimals. */
export function rupeesToPaise(rupees: string | number): Paise {
  const text = String(rupees).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError(`Not a rupee amount: ${text}`);
  const [, sign, whole, frac = ""] = match;
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return assertPaise(sign ? -paise : paise);
}

/** 250000000 paise -> "₹25,00,000" (Indian grouping, whole rupees). */
export function formatINR(paise: Paise): string {
  return inr.format(Math.round(assertPaise(paise) / 100));
}
