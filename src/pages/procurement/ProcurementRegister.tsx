import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
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
import { CaseRegisterTable } from "@/features/procurement/components/CaseRegisterTable";
import { useCases, useLookups, useStageConfig } from "@/features/procurement/hooks/useProcurement";
import { formatMoneyShort } from "@/features/procurement/lib/format";
import type { CaseFilters, CaseStatus, ProcurementStage } from "@/features/procurement/types";

export default function ProcurementRegister() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<ProcurementStage | "all">("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<CaseStatus | "all">("open");

  const filters: CaseFilters = useMemo(
    () => ({ search, stage, departmentId, status }),
    [search, stage, departmentId, status],
  );

  const { data: stages } = useStageConfig();
  const { data: departments } = useLookups("department");
  const { data: rows, isLoading } = useCases(filters);

  const totalValue = (rows ?? []).reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0);

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-[2rem] text-foreground">Procurement register</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Every purchase on the books, wherever it has got to.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/procurement/inbox")}>
              Waiting on you
            </Button>
            {can("mpr.create") && (
              <Button size="sm" onClick={() => navigate("/procurement/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Raise a requisition
              </Button>
            )}
          </div>
        </div>

        {/* Two numbers worth knowing before reading the list. */}
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              cases
            </p>
            <p className="mt-2 font-mono text-[2rem] leading-none tabular-nums text-foreground">
              {isLoading ? "—" : (rows?.length ?? 0).toLocaleString("en-IN")}
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">matching these filters</p>
          </div>
          <div className="bg-card p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              value
            </p>
            <p className="mt-2 font-mono text-[2rem] leading-none tabular-nums text-foreground">
              {isLoading ? "—" : formatMoneyShort(totalValue)}
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">estimated, before award</p>
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
          <Select value={stage} onValueChange={(v) => setStage(v as ProcurementStage | "all")}>
            <SelectTrigger className="w-[210px] text-[13px]">
              <SelectValue placeholder="Any stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any stage</SelectItem>
              {(stages ?? []).map((s) => (
                <SelectItem key={s.stage} value={s.stage}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          <CaseRegisterTable
            rows={rows}
            stages={stages}
            loading={isLoading}
            emptyTitle="No cases here"
            emptyHint="Either nothing matches these filters, or no case has reached your desk yet."
          />
        </div>
      </div>
    </PortalLayout>
  );
}
