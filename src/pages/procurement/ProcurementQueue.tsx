import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { CaseRegisterTable } from "@/features/procurement/components/CaseRegisterTable";
import { useCases, useLookups, useStageConfig } from "@/features/procurement/hooks/useProcurement";
import { formatMoneyShort } from "@/features/procurement/lib/format";
import { QUEUES } from "@/features/procurement/lib/portals";
import type { CaseFilters, QueueKey } from "@/features/procurement/types";
import type { CaseStatus } from "@/features/procurement/types";

/**
 * A stage queue: the register, narrowed to the stages one desk works on.
 *
 * One component serves all twelve of them. The queues differ in which stages
 * they cover and which permission opens them, and both of those are data, so
 * there is no reason for twelve near-identical screens.
 */
export default function ProcurementQueue() {
  const navigate = useNavigate();
  const { queueKey } = useParams<{ queueKey: string }>();
  const { can } = useAuth();

  const queue = queueKey && queueKey in QUEUES ? QUEUES[queueKey as QueueKey] : null;

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<CaseStatus | "all">("open");

  const filters: CaseFilters = useMemo(
    () => ({ search, stages: queue?.stages, departmentId, status }),
    [search, queue, departmentId, status],
  );

  const { data: stages } = useStageConfig();
  const { data: departments } = useLookups("department");
  const { data: rows, isLoading } = useCases(filters);

  if (!queue) return <Navigate to="/procurement" replace />;

  if (!can(queue.permission)) {
    return (
      <PortalLayout>
        <div className="px-5 py-16 text-center sm:px-8">
          <h1 className="font-display text-[1.5rem] text-foreground">This queue is not yours</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {queue.name} needs the {queue.permission} permission.
          </p>
        </div>
      </PortalLayout>
    );
  }

  const totalValue = (rows ?? []).reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              queue
            </p>
            <h1 className="font-display mt-2 text-[2rem] text-foreground">{queue.name}</h1>
            <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">{queue.blurb}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/procurement/inbox")}>
              Waiting on you
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/procurement/register")}>
              Whole register
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              in this queue
            </p>
            <p className="mt-2 font-mono text-[2rem] leading-none tabular-nums text-foreground">
              {isLoading ? "—" : (rows?.length ?? 0)}
            </p>
          </div>
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              value
            </p>
            <p className="mt-2 font-mono text-[2rem] leading-none tabular-nums text-foreground">
              {isLoading ? "—" : formatMoneyShort(totalValue)}
            </p>
          </div>
          <div className="bg-card p-5 sm:col-span-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              search
            </p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Case number or title"
                className="pl-9 text-[13px]"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-[230px] text-[13px]">
              <SelectValue placeholder="Any department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any department</SelectItem>
              {(departments ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as CaseStatus | "all")}>
            <SelectTrigger className="w-[160px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          <CaseRegisterTable
            rows={rows}
            stages={stages}
            loading={isLoading}
            emptyTitle="This queue is clear"
            emptyHint={`No case is sitting at ${queue.name.toLowerCase()} right now.`}
          />
        </div>
      </div>
    </PortalLayout>
  );
}
