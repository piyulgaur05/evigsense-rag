import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { CaseRegisterTable } from "@/features/procurement/components/CaseRegisterTable";
import {
  useLookups,
  useStageConfig,
  useStageCounts,
  useWorklist,
} from "@/features/procurement/hooks/useProcurement";
import { formatMoneyShort } from "@/features/procurement/lib/format";
import { QUEUES, ROLE_NAMES, WORKFLOW_STEPS, resolvePortal } from "@/features/procurement/lib/portals";
import type { CaseListItem } from "@/features/procurement/types";

/**
 * The portal's front page, cut to the desk the signed-in account holds: what
 * that role is for, where it sits in the chain, the counts it cares about, and
 * the cases currently waiting on it.
 */
export default function ProcurementHome() {
  const navigate = useNavigate();
  const { procurementRoles, can } = useAuth();
  const portal = resolvePortal(procurementRoles);

  const { data: stages } = useStageConfig();
  const { data: departments } = useLookups("department");
  const { data: counts, isLoading: countsLoading } = useStageCounts();
  const { data: worklist, isLoading: worklistLoading } = useWorklist();

  const stageLabel = new Map((stages ?? []).map((s) => [s.stage, s.label]));
  const countByStage = new Map((counts ?? []).map((c) => [c.stage, c]));

  const deptById = new Map((departments ?? []).map((d) => [d.id, d]));
  const waiting: CaseListItem[] = (worklist ?? []).slice(0, 8).map((row) => ({
    ...row,
    department: row.department_id
      ? { id: row.department_id, name: deptById.get(row.department_id)?.name ?? "—" }
      : null,
  }));

  const counters = portal?.counters ?? [];
  const actions = (portal?.actions ?? []).filter((a) => can(a.permission));
  const queues = (portal?.queues ?? []).map((key) => QUEUES[key]).filter((q) => can(q.permission));

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {procurementRoles.map((role) => ROLE_NAMES[role]).join(" · ") || "no desk assigned"}
            </p>
            <h1 className="font-display mt-2 text-[2rem] text-foreground">
              {portal?.title ?? "Procurement"}
            </h1>
            <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
              {portal?.subtitle ??
                "No procurement role is assigned to this account, so there is nothing to show."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.to}
                size="sm"
                variant={action.primary ? "default" : "outline"}
                onClick={() => navigate(action.to)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Where this desk sits in the chain. */}
        {portal && portal.step > 0 && (
          <ol className="mt-8 flex gap-px overflow-hidden rounded-lg border border-border bg-border">
            {WORKFLOW_STEPS.map((step) => {
              const here = step.step === portal.step;
              return (
                <li
                  key={step.step}
                  title={`${step.name} — ${step.role}`}
                  className={cn(
                    "flex-1 bg-card px-3 py-2.5",
                    here && "bg-primary/10",
                    step.step < portal.step && "opacity-60",
                  )}
                >
                  <p
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      here ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {String(step.step).padStart(2, "0")}
                  </p>
                  <p
                    className={cn(
                      "mt-1 truncate text-[12px]",
                      here ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.name}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        {/* Counts this desk cares about. */}
        {counters.length > 0 && (
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border">
            {counters.map((stage) => {
              const row = countByStage.get(stage);
              return (
                <div key={stage} className="bg-card p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {stageLabel.get(stage) ?? stage.replace(/_/g, " ")}
                  </p>
                  {countsLoading ? (
                    <Skeleton className="mt-3 h-9 w-16" />
                  ) : (
                    <p className="mt-2 font-mono text-[2rem] leading-none tabular-nums text-foreground">
                      {row?.open_cases ?? 0}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-[12px] tabular-nums text-muted-foreground">
                    {countsLoading ? "—" : formatMoneyShort(row?.total_value ?? 0)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* The cases actually parked on this desk. */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[15px] font-semibold text-foreground">Waiting on you</h2>
            <Link
              to="/procurement/inbox"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              all of them
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-3">
            <CaseRegisterTable
              rows={waiting}
              stages={stages}
              loading={worklistLoading}
              emptyTitle="Nothing needs you"
              emptyHint="No open case is sitting at a stage you can act on."
            />
          </div>
        </section>

        {/* The desks this account can open. */}
        {queues.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[15px] font-semibold text-foreground">Your queues</h2>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-px overflow-hidden rounded-lg border border-border bg-border">
              {queues.map((queue) => {
                const open = queue.stages.reduce(
                  (sum, stage) => sum + (countByStage.get(stage)?.open_cases ?? 0),
                  0,
                );
                return (
                  <Link
                    key={queue.key}
                    to={`/procurement/queue/${queue.key}`}
                    className="group bg-card p-5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[14px] font-semibold text-foreground">{queue.name}</p>
                      <p className="font-mono text-[15px] tabular-nums text-foreground">{open}</p>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {queue.blurb}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </PortalLayout>
  );
}
