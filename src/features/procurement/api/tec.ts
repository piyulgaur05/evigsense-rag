import { supabase } from "@/integrations/supabase/client";
import type { AppliedSignature } from "../components/DecisionSignature";
import type {
  TecAiSuggestion,
  TecChecklistItem,
  TecChecklistItemKey,
  TecChecklistStatus,
  TecConsensusRow,
  TecEvaluation,
} from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchTecChecklist(caseId: string): Promise<TecChecklistItem[]> {
  const { data, error } = await supabase
    .from("procurement_tec_checklist")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * A plain field under RLS, not a signed decision — updated in place the same
 * way a tender's own columns are.
 */
export async function saveTecChecklistItem(args: {
  caseId: string;
  itemKey: TecChecklistItemKey;
  status: TecChecklistStatus;
  remarks: string | null;
  userId: string;
}): Promise<TecChecklistItem> {
  return unwrap(
    await supabase
      .from("procurement_tec_checklist")
      .upsert(
        {
          case_id: args.caseId,
          item_key: args.itemKey,
          status: args.status,
          remarks: args.remarks,
          updated_by: args.userId,
        },
        { onConflict: "case_id,item_key" },
      )
      .select("*")
      .single(),
  );
}

export async function fetchTecEvaluations(caseId: string): Promise<TecEvaluation[]> {
  const { data, error } = await supabase
    .from("procurement_tec_evaluations")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * A member's signed reading of one bidder. Goes through the database function
 * rather than a table write — the table carries no client write policy at
 * all, because every row here is a signed verdict and signing is the engine's
 * job, not a form's.
 */
/**
 * A member's own reading. Unsigned — it does not move the case, only the
 * chair's later, separate qualification call does that, and `tec.recommend`
 * already carries its own required signature. `signature` stays accepted
 * (and stored, if ever sent) purely so a future policy could ask for one
 * without a second write path to build.
 */
export async function submitTecEvaluation(args: {
  bidderId: string;
  score: number | null;
  complianceStatus: string;
  qualified: boolean | null;
  remarks: string | null;
  signature?: AppliedSignature;
}): Promise<TecEvaluation> {
  const { data, error } = await supabase.rpc("procurement_submit_tec_evaluation", {
    _bidder_id: args.bidderId,
    _score: args.score,
    _compliance_status: args.complianceStatus,
    _qualified: args.qualified,
    _remarks: args.remarks,
    _signature: args.signature ?? null,
  });
  if (error) throw new Error(error.message);
  return data as TecEvaluation;
}

/**
 * The chair's own, final call — independent of any member's reading, and the
 * only qualification that gates handing the case to commercial.
 */
export async function setBidderQualification(args: {
  bidderId: string;
  qualified: boolean;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("procurement_set_bidder_qualification", {
    _bidder_id: args.bidderId,
    _qualified: args.qualified,
    _note: args.note,
  });
  if (error) throw new Error(error.message);
}

export async function fetchTecConsensus(caseId: string): Promise<TecConsensusRow[]> {
  const { data, error } = await supabase.rpc("procurement_tec_case_consensus", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTecGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_tec_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTecAiSuggestions(caseId: string): Promise<TecAiSuggestion[]> {
  const { data, error } = await supabase
    .from("procurement_tec_ai_suggestions")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type TecAiEvaluateResult =
  | { suggestion: TecAiSuggestion }
  | { pending: true; message: string };

/**
 * Asks the assistant to read one bidder's papers against the tender's own
 * requirements and propose a score. Runs the same retrieval "Ask about this
 * bid" does, one bidder at a time — never a whole roster at once, and never
 * without being asked, because a model call has a real cost and a tender's
 * papers may still be mid-ingest when a member reaches this desk.
 */
export async function requestTecAiEvaluation(args: {
  caseId: string;
  bidderId: string;
}): Promise<TecAiEvaluateResult> {
  const { data, error } = await supabase.functions.invoke("tec-ai-evaluate", {
    body: { caseId: args.caseId, bidderId: args.bidderId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as TecAiEvaluateResult;
}
