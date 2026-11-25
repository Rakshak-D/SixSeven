/** Calendar-day helpers on ISO dates ("2026-11-25"). Site days are IST calendar days. */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's IST calendar date. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** The Monday that starts the week containing this date. */
export function mondayOf(isoDate: string): string {
  return addDays(isoDate, -((weekday(isoDate) + 6) % 7));
}

/** An IST wall-clock time on a site day as a UTC timestamp with millisecond precision. */
export function istTimestamp(isoDate: string, hour: number, minute = 0): string {
  const utc = Date.parse(`${isoDate}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - IST_OFFSET_MS;
  return new Date(utc).toISOString();
}

/** IST calendar date of a UTC timestamp. */
export function istDateOf(timestamp: string): string {
  return new Date(Date.parse(timestamp) + IST_OFFSET_MS).toISOString().slice(0, 10);
}
