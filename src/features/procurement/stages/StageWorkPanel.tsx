import { RequisitionPanel } from "./RequisitionPanel";
import { TecPanel } from "./TecPanel";
import { TenderPanel } from "./TenderPanel";
import { CommercialPanel } from "./CommercialPanel";
import { CstPanel } from "./CstPanel";
import { PncPanel } from "./PncPanel";
import { ProposalPanel } from "./ProposalPanel";
import { PurchaseOrderPanel } from "./PurchaseOrderPanel";
import { GoodsReceiptPanel } from "./GoodsReceiptPanel";
import { PaymentPanel } from "./PaymentPanel";
import { STAGE_BRIEF } from "../lib/stages";
import { formatDate, formatMoney } from "../lib/format";
import type { CaseListItem, ProcurementStage, StageConfig } from "../types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] text-foreground">{value}</p>
    </div>
  );
}

type StagePanelProps = {
  procurementCase: CaseListItem;
  stage: ProcurementStage;
  /** Lets a stage panel point the case assistant at one bidder's papers. */
  onAskAbout?: (bidderId: string, vendorName: string) => void;
};

/**
 * Stage-specific working, registered per stage as each slice lands.
 *
 * Absent is the normal case: twelve of the fourteen stages still have only the
 * summary above and the requisition below, and a stage that has nothing of its
 * own should show nothing of its own rather than an empty frame promising a
 * form that does not exist.
 */
const STAGE_PANELS: Partial<Record<ProcurementStage, React.ComponentType<StagePanelProps>>> = {
  tender: TenderPanel,
  tec: TecPanel,
  commercial: CommercialPanel,
  cst: CstPanel,
  pnc: PncPanel,
  purchase_proposal: ProposalPanel,
  purchase_order: PurchaseOrderPanel,
  goods_receipt: GoodsReceiptPanel,
  payment_recommendation: PaymentPanel,
};

/**
 * The centre of the case file: what this stage decides, and what the case
 * knows so far.
 */
export function StageWorkPanel({
  stage,
  config,
  procurementCase,
  isCurrent,
  canEditRequisition,
  onAskAbout,
}: {
  stage: ProcurementStage;
  config: StageConfig | undefined;
  procurementCase: CaseListItem;
  isCurrent: boolean;
  canEditRequisition: boolean;
  onAskAbout?: (bidderId: string, vendorName: string) => void;
}) {
  const StagePanel = STAGE_PANELS[stage];

  return (
    <div className="space-y-6">
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">
            {config?.label ?? stage.replace(/_/g, " ")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {isCurrent ? "where the case is" : "not the current stage"}
          </span>
        </div>
        <p className="mt-1.5 max-w-2xl text-[13px] text-muted-foreground">{STAGE_BRIEF[stage]}</p>
      </header>

      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Department" value={procurementCase.department?.name ?? "Not set"} />
        <Field label="Estimated value" value={formatMoney(procurementCase.estimated_cost)} />
        <Field label="Opened" value={formatDate(procurementCase.created_at)} />
        <Field label="Last moved" value={formatDate(procurementCase.updated_at)} />
        <Field
          label="Stage timer"
          value={config?.sla_hours ? `${config.sla_hours} hours` : "No timer set"}
        />
        <Field
          label="Required"
          value={config?.mandatory === false ? "Optional stage" : "Mandatory stage"}
        />
      </div>
    </section>

    {/* This desk's own working, where there is any. */}
    {StagePanel && (
      <StagePanel procurementCase={procurementCase} stage={stage} onAskAbout={onAskAbout} />
    )}

    {/* The requisition is the one record every stage refers back to, so it
        stays last: what this desk is doing, then what it is doing it against. */}
    <RequisitionPanel
      stage={stage}
      procurementCase={procurementCase}
      canEdit={canEditRequisition}
    />
    </div>
  );
}
