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
export type CommitteeMember = Tables["procurement_committee_members"]["Row"];

/** A case joined with the bits the register and case header need. */
export type CaseListItem = ProcurementCase & {
  department: Pick<Lookup, "id" | "name"> | null;
};

/** A clarification with the display name of whoever wrote it. */
export type ClarificationWithAuthor = Clarification & {
  author_name: string | null;
};

export type CaseFilters = {
  search?: string;
  stage?: ProcurementStage | "all";
  /** A queue covers more than one stage (commercial spans evaluation and CST). */
  stages?: ProcurementStage[];
  departmentId?: string | "all";
  status?: CaseStatus | "all";
};

export type { QueueKey } from "./lib/portals";
