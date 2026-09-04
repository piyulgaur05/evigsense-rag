import { cn } from "@/lib/utils";
import type { CaseStatus } from "../types";

/**
 * Status is set in machine type against a hairline rule, not a coloured pill —
 * the register shows a hundred of these at once and pills turn it into confetti.
 */
export function StageBadge({
  status,
  caseStatus = "open",
  className,
}: {
  status: string;
  caseStatus?: CaseStatus;
  className?: string;
}) {
  const tone =
    caseStatus === "rejected"
      ? "border-destructive/50 text-destructive"
      : caseStatus === "closed"
        ? "border-border text-muted-foreground"
        : "border-primary/40 text-foreground";

  return (
    <span
      className={cn(
        "inline-block border-l-2 pl-2 font-mono text-[11px] uppercase leading-tight tracking-[0.14em]",
        tone,
        className,
      )}
    >
      {status}
    </span>
  );
}
