import type { StockMovementsResponse } from "@/shared/schemas/stock";
import { addDays } from "./dates";

/**
 * End-of-day balance for each of the last `days` days, ending today, walked back from the current
 * balance through the dated movements. Movements are signed (deliveries +, usage −, fixes ±).
 */
export function stockSeries(
  movements: StockMovementsResponse,
  materialId: string,
  currentBalance: number,
  today: string,
  days: number,
): number[] {
  const byDay = new Map<string, number>();
  for (const m of movements) {
    if (m.materialId !== materialId) continue;
    byDay.set(m.occurredOn, (byDay.get(m.occurredOn) ?? 0) + m.qty);
  }
  const series: number[] = [];
  let balance = currentBalance;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    series.unshift(Math.max(0, Math.round(balance * 1000) / 1000));
    balance -= byDay.get(day) ?? 0;
  }
  return series;
}

/** A tick step near a quarter of `max`, on a 1–2–5 scale. */
export function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
