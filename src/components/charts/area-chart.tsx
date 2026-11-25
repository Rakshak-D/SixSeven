// Client-only: imported from client components.
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";

export type AreaPoint = {
  /** 0–1 position along the x axis. */
  x: number;
  value: number;
  /** Shown under the value when this point is selected, e.g. "week 14 · today". */
  caption: string;
};

export type AxisLabel = { x: number; title: string; sub?: string; now?: boolean };

type Props = {
  points: AreaPoint[];
  xLabels: AxisLabel[];
  yTicks: { value: number; label: string }[];
  yMin: number;
  yMax: number;
  /** Value text and its small unit, e.g. ["₹22.3", "L"]. */
  format: (value: number) => [string, string];
  label: string;
  height?: number;
};

const W = 1000;
const H = 300;

/** Catmull-Rom through the points as cubic Béziers, kept inside the plot. */
function smoothPath(points: [number, number][]) {
  const clamp = (v: number) => Math.min(H, Math.max(0, v)).toFixed(1);
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${clamp(p1[1] + (p2[1] - p0[1]) / 6)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${clamp(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * A level over time: smooth line, fading area, light vertical guides, a ringed dot with the value
 * above it. Drag (or use the arrow keys) to look back; the latest point shows by default.
 */
export function AreaChart({
  points,
  xLabels,
  yTicks,
  yMin,
  yMax,
  format,
  label,
  height = 240,
}: Props) {
  const gradientId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  if (points.length < 2) return null;

  const yFrac = (v: number) => 1 - (v - yMin) / (yMax - yMin || 1);
  const line = smoothPath(points.map((p) => [p.x * W, yFrac(p.value) * H]));
  const index = selected ?? points.length - 1;
  const point = points[index];
  const left = point.x * 100;
  const top = yFrac(point.value) * 100;
  const [value, unit] = format(point.value);
  const align =
    point.x > 0.75
      ? "-translate-x-[calc(100%-28px)] text-right"
      : point.x < 0.2
        ? "-translate-x-7"
        : "-translate-x-1/2 text-center";

  function nearest(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const f = (event.clientX - box.left) / box.width;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - f) < Math.abs(points[best].x - f)) best = i;
    });
    if (best !== selected) setSelected(best);
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") setSelected(Math.max(0, index - 1));
    else if (event.key === "ArrowRight") setSelected(Math.min(points.length - 1, index + 1));
    else if (event.key === "Home") setSelected(0);
    else if (event.key === "End") setSelected(null);
    else return;
    event.preventDefault();
  }

  return (
    <div className="relative mt-20 mr-6 ml-14 sm:mr-10 sm:ml-16">
      <div className="relative" style={{ height }}>
        {xLabels.map((l) => (
          <span
            key={`g${l.x}`}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${l.x * 100}%` }}
          />
        ))}
        {yTicks.map((t) => (
          <span
            key={t.label}
            aria-hidden="true"
            className="num absolute -left-14 -translate-y-1/2 text-[13px] text-muted-foreground sm:-left-16"
            style={{ top: `${yFrac(t.value) * 100}%` }}
          >
            {t.label}
          </span>
        ))}
        <div className="absolute inset-0 animate-[chart-reveal_1500ms_var(--ease-slate)_250ms_both]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--primary)" stopOpacity="0.42" />
                <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 -ml-px w-0.5 animate-[fade_500ms_var(--ease-slate)_1400ms_both] bg-primary/50 transition-[left,top] duration-[420ms] ease-slate"
          style={{ left: `${left}%`, top: `${top}%` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-5.5 -translate-x-1/2 -translate-y-1/2 animate-[fade_500ms_var(--ease-slate)_1400ms_both] rounded-full border-4 border-foreground bg-primary shadow-[0_0_0_7px_color-mix(in_oklab,var(--primary)_20%,transparent)] transition-[left,top] duration-[420ms] ease-slate"
          style={{ left: `${left}%`, top: `${top}%` }}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -translate-y-[calc(100%+22px)] animate-[fade_500ms_var(--ease-slate)_1500ms_both] whitespace-nowrap transition-[left,top,transform] duration-[420ms] ease-slate ${align}`}
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <span className="num font-serif text-4xl leading-none tracking-tight sm:text-[44px]">
            {value}
          </span>
          <span className="ml-1 font-semibold text-ink-2 sm:text-[17px]">{unit}</span>
          <span className="mt-1 block text-[13px] text-muted-foreground">{point.caption}</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={points.length - 1}
          aria-valuenow={index}
          aria-valuetext={`${value} ${unit}, ${point.caption}`}
          onPointerMove={nearest}
          onPointerDown={nearest}
          onPointerLeave={() => setSelected(null)}
          onKeyDown={onKey}
          className="absolute -inset-x-2 -top-20 bottom-0 cursor-crosshair touch-pan-y rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <div aria-hidden="true" className="relative h-14">
        {xLabels.map((l, i) => (
          <span
            key={`x${l.x}`}
            className={`absolute top-3 whitespace-nowrap text-center text-[13px] leading-tight ${i === 0 ? "" : i === xLabels.length - 1 ? "-translate-x-full text-right" : "-translate-x-1/2"} ${l.now ? "font-bold text-primary" : "text-muted-foreground"}`}
            style={{ left: `${l.x * 100}%` }}
          >
            <b className={`block font-semibold ${l.now ? "" : "text-ink-2"}`}>{l.title}</b>
            {l.sub ? <span className="max-sm:hidden">{l.sub}</span> : null}
            {l.now ? (
              <span className="mx-auto mt-1.5 block size-1.5 rounded-full bg-primary" />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
