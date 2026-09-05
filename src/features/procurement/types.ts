import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type ProcurementStage = Enums["procurement_stage"];
export type ProcurementRole = Enums["procurement_role"];
export type ProcurementActionKind = Enums["procurement_action"];
export type CommitteeKind = Enums["procurement_committee_kind"];
export type ClarificationKind = Enums["procurement_clarification_kind"];
export type CaseStatus = Enums["procurement_case_status"];

export type ProcurementCase = Tables["procurement_cases"]["Row"];
export type ProcurementCaseInsert = Tables["procurement_cases"]["Insert"];
export type StageConfig = Tables["procurement_stage_config"]["Row"];
export type StageAction = Tables["procurement_stage_actions"]["Row"];
export type CaseEvent = Tables["procurement_case_events"]["Row"];
export type StageHistoryEntry = Tables["procurement_stage_history"]["Row"];
export type Clarification = Tables["procurement_clarifications"]["Row"];
export type CaseDocumentLink = Tables["procurement_case_documents"]["Row"];
export type Lookup = Tables["procurement_lookups"]["Row"];
export type ProcurementUserRole = Tables["procurement_user_roles"]["Row"];
export type Committee = Tables["procurement_committees"]["Row"];
export type Requisition = Tables["procurement_requisitions"]["Row"];
export type RequisitionPatch = Omit<
  Tables["procurement_requisitions"]["Insert"],
  "case_id" | "id" | "created_by"
>;
export type BoqLine = Tables["procurement_boq_lines"]["Row"];
export type BudgetHead = Tables["procurement_budget_heads"]["Row"];
export type CommitteeMember = Tables["procurement_committee_members"]["Row"];

/** A case joined with the bits the register and case header need. */
export type CaseListItem = ProcurementCase & {
  department: Pick<Lookup, "id" | "name"> | null;
};

/** A clarification with the display name of whoever wrote it. */
export type ClarificationWithAuthor = Clarification & {
  author_name: string | null;
};

/** One row of the budget ledger: what was allocated, claimed and is left. */
export type BudgetLedgerRow =
  Database["public"]["Functions"]["procurement_budget_ledger"]["Returns"][number];

/** One entry in a case's activity timeline. */
export type CaseActivityEntry =
  Database["public"]["Functions"]["procurement_case_activity"]["Returns"][number];

export type HeadlineMetrics =
  Database["public"]["Functions"]["procurement_headline_metrics"]["Returns"][number];
export type StageAgingRow =
  Database["public"]["Functions"]["procurement_stage_aging"]["Returns"][number];
export type MonthlyFlowRow =
  Database["public"]["Functions"]["procurement_monthly_flow"]["Returns"][number];
export type DepartmentSpendRow =
  Database["public"]["Functions"]["procurement_department_spend"]["Returns"][number];
export type CycleTimeRow =
  Database["public"]["Functions"]["procurement_cycle_time"]["Returns"][number];
export type StageCountRow =
  Database["public"]["Functions"]["procurement_stage_counts"]["Returns"][number];

export type CaseFilters = {
  search?: string;
  stage?: ProcurementStage | "all";
  /** A queue covers more than one stage (commercial spans evaluation and CST). */
  stages?: ProcurementStage[];
  departmentId?: string | "all";
  status?: CaseStatus | "all";
};

export type { QueueKey } from "./lib/portals";
