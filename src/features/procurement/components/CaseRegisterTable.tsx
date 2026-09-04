import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatAge, formatMoneyShort } from "../lib/format";
import { StageBadge } from "./StageBadge";
import type { CaseListItem, StageConfig } from "../types";

/**
 * One register for every case, whatever stage it sits at. The reference system
 * this replaces kept thirteen separate lists; a buyer wants one place to look.
 */
export function CaseRegisterTable({
  rows,
  stages,
  loading,
  emptyTitle,
  emptyHint,
}: {
  rows: CaseListItem[] | undefined;
  stages: StageConfig[] | undefined;
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  const navigate = useNavigate();
  const stageLabel = new Map((stages ?? []).map((s) => [s.stage, s.label]));

  if (loading) {
    return (
      <div className="space-y-px overflow-hidden rounded-lg border border-border bg-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card p-4">
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-foreground">{emptyTitle}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {["Case", "Title", "Department", "Value", "Stage", "Status", "Waiting"].map((h) => (
              <th
                key={h}
                className={cn(
                  "px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
                  h === "Value" && "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={0}
              onClick={() => navigate(`/procurement/case/${row.case_no}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/procurement/case/${row.case_no}`);
              }}
              className="cursor-pointer bg-card transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] tabular-nums text-foreground">
                {row.case_no}
              </td>
              <td className="max-w-[22rem] px-4 py-3 text-[13px] text-foreground">
                <span className="block truncate">{row.title}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted-foreground">
                {row.department?.name ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-[12px] tabular-nums text-foreground">
                {formatMoneyShort(row.estimated_cost)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-[13px] text-foreground">
                {stageLabel.get(row.stage) ?? row.stage}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <StageBadge status={row.status_label} caseStatus={row.case_status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] tabular-nums text-muted-foreground">
                {formatAge(row.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
