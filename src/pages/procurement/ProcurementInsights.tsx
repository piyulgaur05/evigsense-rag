import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import {
  CategoryBars,
  FlowChart,
  MeterRow,
} from "@/features/procurement/components/charts/Charts";
import { Button } from "@/components/ui/button";
import {
  useBudgetLedger,
  useCycleTime,
  useDepartmentSpend,
  useHeadlineMetrics,
  useMonthlyFlow,
  useStageAging,
  useStageCounts,
} from "@/features/procurement/hooks/useProcurement";
import { formatMoney, formatMoneyShort } from "@/features/procurement/lib/format";

function Panel({
  title,
  hint,
  children,
  aside,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{hint}</p>
        </div>
        {aside && <div className="ml-auto">{aside}</div>}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-[1.6rem] leading-none tabular-nums text-foreground">
        {value}
      </p>
      {note && <p className="mt-1.5 text-[12px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function monthLabel(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/**
 * The pipeline seen from above: how much work is where, how long it has been
 * there, what it is worth, and which budget it is charged to.
 *
 * Every figure is drawn under the reader's own visibility — a finance officer
 * sees the cases finance can see, a purchase head sees all of them — because
 * the counting happens in the database behind the same predicate the register
 * uses, not in the browser after the fact.
 */
export default function ProcurementInsights() {
  const { data: headline, isLoading } = useHeadlineMetrics();
  const { data: stageCounts } = useStageCounts();
  const { data: flow } = useMonthlyFlow(12);
  const { data: departments } = useDepartmentSpend();
  const { data: cycle } = useCycleTime();
  const { data: aging } = useStageAging();
  const { data: ledger } = useBudgetLedger();
  const [showFlowNumbers, setShowFlowNumbers] = useState(false);

  const stageData = (stageCounts ?? [])
    .filter((row) => Number(row.open_cases) > 0)
    .map((row) => ({ name: row.stage.replace(/_/g, " "), value: Number(row.open_cases) }));

  const departmentData = (departments ?? [])
    .filter((row) => Number(row.total_value) > 0)
    .map((row) => ({ name: row.department, value: Number(row.total_value) }));

  const flowData = (flow ?? []).map((row) => ({
    month: monthLabel(row.month),
    opened: Number(row.opened),
    closed: Number(row.closed),
  }));

  const worked = (cycle ?? []).filter((row) => Number(row.moves) > 0);
  const oldest = (aging ?? []).slice(0, 8);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <h1 className="font-display text-[2rem] text-foreground">Insights</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
          What is in the pipeline, where it is stuck, and what it is going to cost. Only the cases
          you are allowed to see are counted.
        </p>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          <Tile label="open cases" value={String(headline?.open_cases ?? 0)} />
          <Tile
            label="open value"
            value={formatMoneyShort(headline?.open_value ?? 0)}
            note="Estimated, not committed"
          />
          <Tile label="closed" value={String(headline?.closed_cases ?? 0)} />
          <Tile
            label="average cycle"
            value={`${headline?.avg_cycle_days ?? 0} d`}
            note="Opened to closed"
          />
          <Tile
            label="past their timer"
            value={String(headline?.breaching_cases ?? 0)}
            note="Open cases beyond the stage SLA"
          />
        </div>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
          <Panel
            title="Where the work is"
            hint="Open cases at each desk. A tall bar in the middle of the chain is a queue forming."
          >
            <CategoryBars data={stageData} height={Math.max(200, stageData.length * 30)} />
          </Panel>

          <Panel
            title="Opened and closed"
            hint="Twelve months of intake against completion. Both are counts of cases, on one scale."
            aside={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowFlowNumbers((v) => !v)}
              >
                {showFlowNumbers ? "Show the chart" : "Show the numbers"}
              </Button>
            }
          >
            {showFlowNumbers ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="border-b border-border py-2 font-normal">Month</th>
                      <th className="border-b border-border py-2 text-right font-normal">Opened</th>
                      <th className="border-b border-border py-2 text-right font-normal">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flowData.map((row) => (
                      <tr key={row.month}>
                        <td className="border-b border-border py-1.5">{row.month}</td>
                        <td className="border-b border-border py-1.5 text-right font-mono tabular-nums">
                          {row.opened}
                        </td>
                        <td className="border-b border-border py-1.5 text-right font-mono tabular-nums">
                          {row.closed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <FlowChart data={flowData} />
            )}
          </Panel>

          <Panel
            title="Value by department"
            hint="The estimated value of every case each department has raised."
          >
            <CategoryBars
              data={departmentData}
              valueFormat={formatMoneyShort}
              height={Math.max(180, departmentData.length * 34)}
            />
          </Panel>

          <Panel
            title="Time at each desk"
            hint="Measured from the case trail — how long a case actually spent at a stage, against the timer set for it."
          >
            {worked.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No case has moved through a full stage yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {worked.map((row) => (
                  <MeterRow
                    key={row.stage}
                    label={row.stage_label}
                    sublabel={`${row.moves} move${Number(row.moves) === 1 ? "" : "s"}`}
                    value={Number(row.avg_hours)}
                    limit={Number(row.sla_hours ?? 0)}
                    valueLabel={`${row.avg_hours} h`}
                    limitLabel={row.sla_hours ? `${row.sla_hours} h` : "no timer"}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Budget headroom"
            hint="What each head has been allocated, and what live cases have already claimed against it."
          >
            {(ledger ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No budget heads yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {(ledger ?? []).map((row) => (
                  <MeterRow
                    key={row.id}
                    label={row.name}
                    sublabel={row.fiscal_year}
                    value={Number(row.committed)}
                    limit={Number(row.allocated)}
                    valueLabel={formatMoneyShort(row.committed)}
                    limitLabel={formatMoneyShort(row.allocated)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Oldest in the queue"
            hint="Open cases by how long they have sat at their current stage."
          >
            {oldest.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing is waiting.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="border-b border-border py-2 pr-3 font-normal">Case</th>
                      <th className="border-b border-border py-2 pr-3 font-normal">Stage</th>
                      <th className="border-b border-border py-2 pr-3 text-right font-normal">
                        Waiting
                      </th>
                      <th className="border-b border-border py-2 text-right font-normal">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oldest.map((row) => (
                      <tr key={row.case_id}>
                        <td className="border-b border-border py-2 pr-3">
                          <Link
                            to={`/procurement/case/${row.case_no}`}
                            className="font-mono tabular-nums text-primary hover:underline"
                          >
                            {row.case_no}
                          </Link>
                          <span className="ml-2 text-muted-foreground">{row.title}</span>
                        </td>
                        <td className="border-b border-border py-2 pr-3 text-muted-foreground">
                          {row.stage_label}
                        </td>
                        <td className="border-b border-border py-2 pr-3 text-right font-mono tabular-nums">
                          <span className={row.breached ? "text-destructive" : undefined}>
                            {Math.round(Number(row.hours_in_stage) / 24)} d
                          </span>
                          {row.breached && (
                            <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
                              over
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border py-2 text-right font-mono tabular-nums">
                          {formatMoney(row.estimated_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PortalLayout>
  );
}
