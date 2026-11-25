/**
 * The Slate mark: an orange top slab over two ink courses (the lower one fainter), from the final
 * "J" lockup. The ink follows the theme through currentColor; the slab is the action orange.
 */
export function SlateMark({
  className = "h-7 w-[30px]",
  strokeWidth = 6,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 64 60" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M32 4L60 18L32 32L4 18Z" fill="var(--primary)" />
      <path
        d="M8 30L32 42L56 30"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 44L32 56L56 44"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

type LockupProps = {
  /** "nav" for bars, "hero" for the sign-in and splash screens. */
  size?: "nav" | "hero";
  tagline?: boolean;
  /** Stack the mark over the wordmark (sign-in, splash). */
  stacked?: boolean;
};

/** Mark, a thin divider and the serif wordmark; optionally the tagline under them. */
export function SlateLockup({ size = "nav", tagline = false, stacked = false }: LockupProps) {
  const hero = size === "hero";
  return (
    <span className={`inline-flex flex-col gap-3 ${stacked ? "items-center" : "items-start"}`}>
      <span
        className={`inline-flex items-center ${stacked ? "flex-col gap-3" : hero ? "gap-5" : "gap-3"}`}
      >
        <SlateMark className={hero ? "h-[60px] w-16" : "h-7 w-[30px]"} strokeWidth={hero ? 6 : 7} />
        {stacked ? null : (
          <span
            aria-hidden="true"
            className={`w-px bg-line-strong ${hero ? "h-16" : "h-[26px]"}`}
          />
        )}
        <span
          className={`font-serif leading-[0.9] ${hero ? "text-7xl sm:text-8xl" : "text-[32px]"}`}
        >
          Slate
        </span>
      </span>
      {tagline ? (
        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.36em]">
          Every detail · accounted for
        </span>
      ) : null}
    </span>
  );
}

/** The tagline on its own line, kept to one line on phones. */
export function SlateTagline({ className = "" }: { className?: string }) {
  return (
    <p
      className={`whitespace-nowrap font-semibold text-muted-foreground text-xs uppercase tracking-[0.22em] sm:tracking-[0.36em] ${className}`}
    >
      Every detail · accounted for
    </p>
  );
}
