import { supabase } from "@/integrations/supabase/client";
import type {
  CaseEvent,
  CaseFilters,
  CaseListItem,
  Clarification,
  ProcurementCase,
  ProcurementStage,
  StageAction,
  StageConfig,
  StageHistoryEntry,
} from "../types";

const CASE_COLUMNS = "*, department:procurement_lookups!procurement_cases_department_id_fkey(id,name)";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Reference data. Changes about once a release, so callers cache it hard. */
export async function fetchStageConfig(): Promise<StageConfig[]> {
  return unwrap(
    await supabase.from("procurement_stage_config").select("*").order("sequence", { ascending: true }),
  );
}

export async function fetchCases(filters: CaseFilters = {}): Promise<CaseListItem[]> {
  let query = supabase.from("procurement_cases").select(CASE_COLUMNS);

  if (filters.stage && filters.stage !== "all") query = query.eq("stage", filters.stage);
  if (filters.stages?.length) query = query.in("stage", filters.stages);
  if (filters.status && filters.status !== "all") query = query.eq("case_status", filters.status);
  if (filters.departmentId && filters.departmentId !== "all") {
    query = query.eq("department_id", filters.departmentId);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`case_no.ilike.${term},title.ilike.${term}`);
  }

  return unwrap(await query.order("updated_at", { ascending: false }).limit(500)) as CaseListItem[];
}

export async function fetchCaseByNo(caseNo: string): Promise<CaseListItem | null> {
  const { data, error } = await supabase
    .from("procurement_cases")
    .select(CASE_COLUMNS)
    .eq("case_no", caseNo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CaseListItem | null;
}

export async function fetchCaseEvents(caseId: string): Promise<CaseEvent[]> {
  return unwrap(
    await supabase
      .from("procurement_case_events")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
  );
}

export async function fetchStageHistory(caseId: string): Promise<StageHistoryEntry[]> {
  return unwrap(
    await supabase
      .from("procurement_stage_history")
      .select("*")
      .eq("case_id", caseId)
      .order("entered_at", { ascending: true }),
  );
}

export async function fetchClarifications(caseId: string): Promise<Clarification[]> {
  return unwrap(
    await supabase
      .from("procurement_clarifications")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  );
}

/** What this user may do on this case right now, per the database. */
export async function fetchAvailableActions(caseId: string): Promise<StageAction[]> {
  return unwrap(await supabase.rpc("procurement_available_actions", { _case_id: caseId }));
}

export type OpenCaseInput = {
  title: string;
  departmentId: string | null;
  estimatedCost: number;
  requesterId: string;
};

export async function openCase(input: OpenCaseInput): Promise<ProcurementCase> {
  return unwrap(
    await supabase
      .from("procurement_cases")
      .insert({
        title: input.title,
        department_id: input.departmentId,
        estimated_cost: input.estimatedCost,
        requester_id: input.requesterId,
        created_by: input.requesterId,
      })
      .select()
      .single(),
  );
}

export async function updateCase(
  caseId: string,
  patch: Partial<Pick<ProcurementCase, "title" | "department_id" | "estimated_cost">>,
): Promise<ProcurementCase> {
  return unwrap(
    await supabase.from("procurement_cases").update(patch).eq("id", caseId).select().single(),
  );
}

/**
 * The only way a case changes stage. Every guard, the trail and the
 * clarification thread are the database's job, not the client's.
 */
export async function recordDecision(args: {
  caseId: string;
  actionCode: string;
  remarks?: string;
  payload?: Record<string, unknown>;
}): Promise<ProcurementCase> {
  const { data, error } = await supabase.rpc("procurement_record_decision", {
    _case_id: args.caseId,
    _action_code: args.actionCode,
    _remarks: args.remarks ?? null,
    _payload: (args.payload ?? {}) as never,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as ProcurementCase;
}

export async function postClarification(args: {
  caseId: string;
  fromStage: ProcurementStage;
  toStage?: ProcurementStage | null;
  body: string;
  parentId?: string | null;
  authorId: string;
}): Promise<Clarification> {
  return unwrap(
    await supabase
      .from("procurement_clarifications")
      .insert({
        case_id: args.caseId,
        from_stage: args.fromStage,
        to_stage: args.toStage ?? null,
        body: args.body,
        parent_id: args.parentId ?? null,
        author_id: args.authorId,
        kind: "question",
      })
      .select()
      .single(),
  );
}

export async function resolveClarification(id: string): Promise<void> {
  const { error } = await supabase
    .from("procurement_clarifications")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Open cases sitting at a stage this user can act on. Oldest first. */
export async function fetchWorklist(): Promise<ProcurementCase[]> {
  return unwrap(await supabase.rpc("procurement_my_worklist"));
}

export type StageCount = {
  stage: ProcurementStage;
  open_cases: number;
  total_value: number;
};

/** One row per stage, counted under the caller's own visibility. */
export async function fetchStageCounts(): Promise<StageCount[]> {
  const rows = unwrap(await supabase.rpc("procurement_stage_counts"));
  return (rows ?? []).map((row) => ({
    stage: row.stage,
    open_cases: Number(row.open_cases ?? 0),
    total_value: Number(row.total_value ?? 0),
  }));
}
