import { RequisitionEditor } from "../components/RequisitionEditor";
import type { CaseListItem, ProcurementStage } from "../types";

/**
 * The requisition, shown wherever it is relevant.
 *
 * At draft and requisition it is the work of the stage, so the requester edits
 * it in place. Downstream it is evidence — finance decides against it, the
 * tender is written from it — so every later stage still shows it, read-only.
 */
export function RequisitionPanel({
  stage,
  procurementCase,
  canEdit,
}: {
  stage: ProcurementStage;
  procurementCase: CaseListItem;
  canEdit: boolean;
}) {
  const editable = canEdit && (stage === "draft" || stage === "mpr");
  return (
    <RequisitionEditor
      procurementCase={procurementCase}
      readOnly={!editable}
      // The case file has its own paperwork panel beside the stage.
      showDocuments={false}
    />
  );
}
