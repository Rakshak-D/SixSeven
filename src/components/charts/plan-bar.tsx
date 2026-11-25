/**
 * Planned vs used for one material: the hatched track is the plan, the solid bar is what was used.
 * Over the plan's tolerance, the bar turns amber and the words say so.
 */
export function PlanBar({ used, planned, over }: { used: number; planned: number; over: boolean }) {
  const scale = Math.max(planned, used) || 1;
  return (
    <div aria-hidden="true" className="relative h-3 overflow-hidden rounded-full">
      <div
        className="absolute inset-y-0 left-0 rounded-full [background:repeating-linear-gradient(135deg,var(--line-strong)_0_1.5px,transparent_1.5px_6px)] shadow-[inset_0_0_0_1px_var(--line-strong)]"
        style={{ width: `${(planned / scale) * 100}%` }}
      />
      <div
        className={`absolute inset-y-0 left-0 origin-left animate-grow-x rounded-full ${over ? "bg-warning" : "bg-foreground"}`}
        style={{ width: `${(used / scale) * 100}%` }}
      />
    </div>
  );
}
