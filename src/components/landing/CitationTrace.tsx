import { cn } from "@/lib/utils";

/** Text lines standing in for a page. `w` is a percentage width. */
// Line pitch is 5px of bar + 7px of gap = 12px, which is what positions the
// marked band below. Lines 5-7 sit at the vertical middle so the leader can
// run straight across from the passage to the answer at any pane height.
const LINE_PITCH = 12;
const MARKED_FROM = 5;
const MARKED_TO = 7;

const PAGE_LINES = [
  { w: 96 }, { w: 88 }, { w: 92 }, { w: 61 }, { w: 84 },
  { w: 94, marked: true }, { w: 90, marked: true }, { w: 44, marked: true },
  { w: 89 }, { w: 93 }, { w: 78 }, { w: 52 },
];

// Pre-broken so each line fits the pane and reveals cleanly in sequence.
const ANSWER_LINES = [
  "60 days' written notice,",
  "from either party. Unused",
  "prepaid fees are refunded.",
];

/**
 * The landing hero. Shows the thing the product is actually for: an answer
 * you can walk back to the page it came from.
 *
 * Decorative as a whole, so the composition is hidden from assistive tech and
 * the same claim is stated in prose beside it.
 */
export function CitationTrace({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "select-none overflow-hidden rounded-lg border border-border bg-card shadow-lift",
        className,
      )}
    >
      {/* Document bar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        <span className="font-mono text-[11px] text-foreground">contract.pdf</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          indexed &middot; 41 pages
        </span>
      </div>

      <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1.05fr)]">
        {/* ---------------- The page ---------------- */}
        <div className="relative overflow-hidden border-b border-border p-5 sm:border-b-0 sm:border-r">
          <div className="relative space-y-[7px]">
            {PAGE_LINES.map((line, i) => (
              <div key={i} className="relative">
                <div
                  className={cn(
                    "h-[5px] rounded-full transition-colors",
                    line.marked ? "bg-signal/50" : "bg-foreground/10",
                  )}
                  style={{ width: `${line.w}%` }}
                />
              </div>
            ))}

            {/* The marked passage: a tinted band with a bracket on its edge. */}
            <div
              className="ct-mark pointer-events-none absolute -inset-x-2 rounded-sm bg-signal/10 ring-1 ring-signal/30"
              style={{
                top: `${MARKED_FROM * LINE_PITCH}px`,
                height: `${(MARKED_TO - MARKED_FROM) * LINE_PITCH + 5}px`,
                transformOrigin: "left center",
              }}
            >
              <span className="absolute -left-px top-0 h-full w-[2px] rounded-full bg-signal" />
            </div>

            {/* Scan sweep */}
            <span className="ct-scan pointer-events-none absolute inset-x-[-8px] h-px bg-gradient-to-r from-transparent via-signal to-transparent" />
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              page 14
            </span>
            <span className="font-mono text-[10px] text-signal">chunk 0412</span>
          </div>
        </div>

        {/* ---------------- The leader ---------------- */}
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="0 0 40 8"
            preserveAspectRatio="none"
            className="h-2 w-full"
            style={{ ["--ct-len" as string]: "40" }}
          >
            <path
              className="ct-leader"
              d="M0 4 H40"
              fill="none"
              stroke="hsl(var(--signal))"
              strokeWidth="1.25"
              strokeDasharray="40"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="ct-cite absolute h-1.5 w-1.5 rounded-full bg-signal shadow-glow" />
        </div>

        {/* ---------------- The answer ---------------- */}
        <div className="flex flex-col justify-center gap-3 border-t border-border p-5 sm:border-l-0 sm:border-t-0">
          <div className="ct-ask self-start rounded-md bg-muted px-2.5 py-1.5 text-[13px] text-muted-foreground">
            How much notice to terminate?
          </div>

          <div className="space-y-1.5">
            {ANSWER_LINES.map((line, i) => (
              <div
                key={line}
                className="ct-line text-[13px] leading-snug text-foreground"
                style={{ animationDelay: `${i * 0.16}s` }}
              >
                {line}
                {i === ANSWER_LINES.length - 1 && (
                  <span className="ct-caret ml-0.5 inline-block h-[13px] w-[2px] translate-y-[2px] bg-signal" />
                )}
              </div>
            ))}
          </div>

          <div className="ct-cite mt-1 inline-flex items-center gap-2 self-start rounded-md border border-signal/40 bg-signal/10 px-2 py-1">
            <span className="font-mono text-[11px] font-medium text-foreground">p. 14</span>
            <span className="h-3 w-px bg-signal/40" />
            <span className="font-mono text-[11px] text-muted-foreground">0.91</span>
          </div>
        </div>
      </div>
    </div>
  );
}
