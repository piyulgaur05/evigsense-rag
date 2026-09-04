import { cn } from "@/lib/utils";
import { formatDate } from "../lib/format";
import type { ProcurementStage, StageConfig, StageHistoryEntry } from "../types";

/**
 * The case's own contents page: every stage in order, where the case is now,
 * and when it passed through the ones behind it. Lives inside the case file
 * rather than as app chrome, so the reader never loses the case while moving
 * between stages.
 */
export function StageIndex({
  stages,
  current,
  history,
  selected,
  onSelect,
}: {
  stages: StageConfig[];
  current: ProcurementStage;
  history: StageHistoryEntry[];
  selected: ProcurementStage;
  onSelect: (stage: ProcurementStage) => void;
}) {
  const currentSeq = stages.find((s) => s.stage === current)?.sequence ?? 0;

  // Last time the case entered each stage — a re-entry after a send-back should
  // read as the newer visit, not the original one.
  const enteredAt = new Map<string, string>();
  for (const entry of history) enteredAt.set(entry.to_stage, entry.entered_at);

  return (
    <nav aria-label="Stages" className="flex flex-col">
      {stages
        .filter((s) => s.stage !== "draft")
        .map((s) => {
          const isCurrent = s.stage === current;
          const isPast = s.sequence < currentSeq;
          const isSelected = s.stage === selected;
          const visited = enteredAt.get(s.stage);

          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => onSelect(s.stage)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "group flex items-baseline gap-3 border-l-2 py-2 pl-3 pr-2 text-left transition-colors",
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                !isPast && !isCurrent && "opacity-55",
              )}
            >
              <span
                className={cn(
                  "w-5 shrink-0 font-mono text-[11px] tabular-nums",
                  isCurrent ? "text-primary" : "text-muted-foreground",
                )}
              >
                {String(s.sequence).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[13px]",
                    isCurrent ? "font-semibold text-foreground" : "text-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {isCurrent
                    ? "here now"
                    : visited
                      ? formatDate(visited)
                      : s.mandatory
                        ? "not reached"
                        : "optional"}
                </span>
              </span>
            </button>
          );
        })}
    </nav>
  );
}
