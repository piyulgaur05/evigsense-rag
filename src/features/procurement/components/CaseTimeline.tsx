import { CornerUpLeft, FileText, HelpCircle, Loader2, MoveRight, Stamp } from "lucide-react";
import { useCaseActivity } from "../hooks/useProcurement";
import { formatDateTime } from "../lib/format";
import type { CaseActivityEntry } from "../types";

const KIND_ICON = {
  decision: Stamp,
  movement: MoveRight,
  question: HelpCircle,
  send_back: CornerUpLeft,
  document: FileText,
} as const;

const KIND_LABEL: Record<string, string> = {
  decision: "decision",
  movement: "moved",
  question: "clarification",
  send_back: "sent back",
  document: "document",
};

/** "4 days later" reads better on a trail than two absolute timestamps. */
function gapBetween(newer: string, older: string): string | null {
  const ms = new Date(newer).getTime() - new Date(older).getTime();
  if (ms < 60 * 60 * 1000) return null;
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 48) return `${hours} hours later`;
  return `${Math.round(hours / 24)} days later`;
}

function stageWords(stage: string | null) {
  return stage ? stage.replace(/_/g, " ") : null;
}

function Entry({ entry, gap }: { entry: CaseActivityEntry; gap: string | null }) {
  const Icon = KIND_ICON[entry.kind as keyof typeof KIND_ICON] ?? Stamp;
  const movement =
    entry.kind === "movement" && entry.to_stage
      ? `${stageWords(entry.stage) ?? "start"} → ${stageWords(entry.to_stage)}`
      : stageWords(entry.stage);

  return (
    <li className="relative pl-8">
      {/* The rail, drawn per entry so the last one stops rather than trailing off. */}
      <span
        className="absolute left-[11px] top-6 h-[calc(100%-0.5rem)] w-px bg-border"
        aria-hidden="true"
      />
      <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </span>

      <div className="pb-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium text-foreground">{entry.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {KIND_LABEL[entry.kind] ?? entry.kind}
          </span>
          {movement && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {movement}
            </span>
          )}
        </div>

        <p className="mt-1 text-[12px] text-muted-foreground">
          {entry.actor_name ?? "Name not recorded"}
          {entry.actor_role && entry.actor_role !== entry.actor_name
            ? ` · ${entry.actor_role.replace(/_/g, " ")}`
            : ""}
          {" · "}
          {formatDateTime(entry.happened_at)}
          {gap ? ` · ${gap}` : ""}
        </p>

        {entry.detail && (
          <p className="mt-2 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground">
            {entry.detail}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Everything that happened to a case, newest first — decisions, movements,
 * questions, send-backs and paperwork on one rail rather than in four separate
 * panels. The same component serves every stage: a tender's activity and a
 * payment's activity are the same shape of fact.
 */
export function CaseTimeline({ caseId, limit }: { caseId: string; limit?: number }) {
  const { data: entries, isLoading } = useCaseActivity(caseId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = limit ? (entries ?? []).slice(0, limit) : (entries ?? []);

  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Nothing has happened yet.</p>;
  }

  return (
    <ol className="mt-1">
      {rows.map((entry, index) => (
        <Entry
          key={`${entry.kind}-${entry.happened_at}-${index}`}
          entry={entry}
          gap={
            index < rows.length - 1
              ? gapBetween(entry.happened_at, rows[index + 1].happened_at)
              : null
          }
        />
      ))}
    </ol>
  );
}
