import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Tint the found-passage bar with --signal. Off for tiny or single-color uses. */
  signal?: boolean;
};

/**
 * A page with its corner turned back, and one passage marked inside it.
 * The bar is the citation — the thing the machine found — so it carries
 * --signal wherever there is room for two colors.
 */
export function LogoMark({ className, signal = true }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <path
        d="M4.75 4.25A1.5 1.5 0 0 1 6.25 2.75h7.19L19.25 8.56v11.19a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5V4.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13.44 2.75v4.31a1.5 1.5 0 0 0 1.5 1.5h4.31"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x="8"
        y="13.4"
        width="8"
        height="2.6"
        rx="1.3"
        fill={signal ? "hsl(var(--signal))" : "currentColor"}
      />
    </svg>
  );
}

type LogoProps = LogoMarkProps & {
  /** Render the wordmark beside the mark. */
  wordmark?: boolean;
  markClassName?: string;
};

export function Logo({ className, markClassName, wordmark = true, signal = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={cn("h-6 w-6", markClassName)} signal={signal} />
      {wordmark && (
        <span className="inline-flex items-baseline gap-1">
          <span className="font-display text-[1.05em] leading-none">Jyoma</span>
          <span className="font-mono text-[0.62em] leading-none tracking-[0.14em] opacity-60">
            AI
          </span>
        </span>
      )}
    </span>
  );
}
