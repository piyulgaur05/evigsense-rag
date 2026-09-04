import { useNavigate } from "react-router-dom";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { CaseRegisterTable } from "@/features/procurement/components/CaseRegisterTable";
import { useLookups, useStageConfig, useWorklist } from "@/features/procurement/hooks/useProcurement";
import type { CaseListItem } from "@/features/procurement/types";

/**
 * One worklist across every stage, instead of a queue screen per desk. What a
 * person actually wants to know when they sign in is "what is mine", not
 * "which of thirteen queues should I check".
 */
export default function ProcurementInbox() {
  const navigate = useNavigate();
  const { data: stages } = useStageConfig();
  const { data: departments } = useLookups("department");
  const { data: worklist, isLoading } = useWorklist();

  // The worklist comes back as bare cases; the department name is a lookup the
  // register already caches, so join it here rather than widening the RPC.
  const deptById = new Map((departments ?? []).map((d) => [d.id, d]));
  const rows: CaseListItem[] = (worklist ?? []).map((row) => ({
    ...row,
    department: row.department_id
      ? { id: row.department_id, name: deptById.get(row.department_id)?.name ?? "—" }
      : null,
  }));

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-[2rem] text-foreground">Waiting on you</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Cases parked at a stage you can move. Longest wait first.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/procurement/register")}>
            Whole register
          </Button>
        </div>

        <div className="mt-8">
          <CaseRegisterTable
            rows={rows}
            stages={stages}
            loading={isLoading}
            emptyTitle="Nothing needs you"
            emptyHint="No open case is sitting at a stage you can act on."
          />
        </div>
      </div>
    </PortalLayout>
  );
}
