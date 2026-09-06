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

// ===== The tender =====

export type Vendor = Tables["procurement_vendors"]["Row"];
export type VendorInsert = Tables["procurement_vendors"]["Insert"];
export type Tender = Tables["procurement_tenders"]["Row"];
export type TenderItem = Tables["procurement_tender_items"]["Row"];
export type TenderInvitee = Tables["procurement_tender_invitees"]["Row"];
export type Bidder = Tables["procurement_bidders"]["Row"];
export type Corrigendum = Tables["procurement_corrigenda"]["Row"];
export type CorrigendumNotice = Tables["procurement_corrigendum_notices"]["Row"];

export type TenderSummary =
  Database["public"]["Functions"]["procurement_tender_summary"]["Returns"][number];

/**
 * `mode` and `status` are text columns with CHECK constraints rather than
 * enums, so the generated types give them back as bare strings. Narrowing them
 * here is what stops a typo reaching the database and coming back as a
 * constraint violation the user cannot act on.
 */
export type TenderMode = "open" | "limited" | "single" | "gem" | "eprocurement";
export type TenderStatus =
  | "draft"
  | "ready"
  | "floated"
  | "bidding_open"
  | "bidding_closed"
  | "evaluation";
export type BidderStatus = "received" | "withdrawn" | "rejected" | "disqualified";
export type EmdStatus = "not_received" | "received" | "exempt" | "returned" | "forfeited";
export type MsmeCategory = "micro" | "small" | "medium" | "none";
export type CorrigendumCategory = "schedule" | "technical" | "commercial" | "administrative";

/** What the tender form edits. The lifecycle columns are the engine's. */
export type TenderPatch = Partial<
  Omit<
    Tables["procurement_tenders"]["Insert"],
    | "id"
    | "case_id"
    | "created_by"
    | "created_at"
    | "updated_at"
    | "status"
    | "floated_at"
    | "floated_by"
    | "bidding_closed_at"
    | "bidding_closed_by"
    | "estimated_value"
    | "notice_snapshot"
    | "notice_issued_at"
  >
>;

export type BidderPatch = Partial<
  Omit<Tables["procurement_bidders"]["Insert"], "id" | "case_id" | "created_by" | "bid_amount_gross">
> & { tender_id: string; vendor_id: string };

/** A bidder as the roster shows it — the firm's name comes from the register. */
export type BidderWithVendor = Bidder & {
  vendor: Pick<Vendor, "id" | "name" | "msme_category" | "blacklisted"> | null;
};

export type InviteeWithVendor = TenderInvitee & {
  vendor: Pick<Vendor, "id" | "name"> | null;
};

export type CorrigendumWithNotices = Corrigendum & {
  notices: (Pick<CorrigendumNotice, "id" | "vendor_id" | "channel" | "notified_at"> & {
    vendor: Pick<Vendor, "id" | "name"> | null;
  })[];
};

// ===== The technical evaluation committee =====

export type TecChecklistItem = Tables["procurement_tec_checklist"]["Row"];
export type TecChecklistItemKey =
  | "specs_match_requisition"
  | "mandatory_documents"
  | "delivery_feasible"
  | "eligibility_verified";
export type TecChecklistStatus = "pending" | "pass" | "fail" | "clarify";

export type TecEvaluation = Tables["procurement_tec_evaluations"]["Row"];
export type TecComplianceStatus = "pending" | "compliant" | "non_compliant";

export type TecConsensusRow =
  Database["public"]["Functions"]["procurement_tec_case_consensus"]["Returns"][number];

export type TecAiSuggestion = Tables["procurement_tec_ai_suggestions"]["Row"];
export type TecAiEvidenceFinding = "met" | "not_met" | "unclear";
export type TecAiEvidence = {
  requirement: string;
  finding: TecAiEvidenceFinding;
  detail: string | null;
  source: string | null;
};
