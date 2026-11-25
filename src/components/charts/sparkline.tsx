/** A tiny trend line for list rows. Decorative: the row's text carries the numbers. */
export function Sparkline({
  values,
  tone = "muted",
}: {
  values: number[];
  tone?: "muted" | "warning";
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => [
    (i * 80) / (values.length - 1),
    25 - ((v - lo) / (hi - lo || 1)) * 22,
  ]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return (
    <svg viewBox="0 0 80 28" aria-hidden="true" className="h-7 w-20 shrink-0 overflow-visible">
      <path
        d={d}
        fill="none"
        strokeWidth="1.8"
        strokeLinecap="round"
        className={tone === "warning" ? "stroke-warning" : "stroke-ink-2"}
      />
    </svg>
  );
}
