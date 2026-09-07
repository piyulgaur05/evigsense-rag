import { supabase } from "@/integrations/supabase/client";
import type {
  CommercialApproval,
  CommercialRecommendation,
  CommercialRecommendationHistory,
  CstScrutinyItem,
  CstScrutinyItemKey,
  CstScrutinyStatus,
  CstVersion,
  JustificationReason,
  RecommendationOutcome,
} from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** The live version of the statement — a draft that computes, or a locked
 * one that reads only its own frozen snapshot. `null` before the desk has
 * compiled one, which the trigger on arrival does automatically. */
export async function fetchLiveCstVersion(caseId: string): Promise<CstVersion | null> {
  const { data, error } = await supabase
    .from("procurement_cst_versions")
    .select("*")
    .eq("case_id", caseId)
    .neq("status", "superseded")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCstVersions(caseId: string): Promise<CstVersion[]> {
  const { data, error } = await supabase
    .from("procurement_cst_versions")
    .select("*")
    .eq("case_id", caseId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchCstScrutiny(caseId: string, version: number): Promise<CstScrutinyItem[]> {
  const { data, error } = await supabase
    .from("procurement_cst_scrutiny")
    .select("*")
    .eq("case_id", caseId)
    .eq("version", version);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveCstScrutiny(args: {
  caseId: string;
  itemKey: CstScrutinyItemKey;
  status: CstScrutinyStatus;
  remarks: string | null;
}): Promise<CstScrutinyItem> {
  return unwrap(
    await supabase.rpc("procurement_save_cst_scrutiny", {
      _case_id: args.caseId,
      _item_key: args.itemKey,
      _status: args.status,
      _remarks: args.remarks,
    }),
  );
}

export async function fetchRecommendation(caseId: string): Promise<CommercialRecommendation | null> {
  const { data, error } = await supabase
    .from("procurement_commercial_recommendations")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchRecommendationHistory(
  caseId: string,
): Promise<CommercialRecommendationHistory[]> {
  const { data, error } = await supabase
    .from("procurement_commercial_recommendation_history")
    .select("*")
    .eq("case_id", caseId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Records the desk's recommendation. Recommending anyone other than the
 * computed L1 is refused by the database without a category and at least
 * ten characters of justification — this only ever carries the officer's
 * words to the function that decides whether they are enough.
 */
export async function recordRecommendation(args: {
  caseId: string;
  outcome: RecommendationOutcome;
  bidderId?: string | null;
  justificationReason?: JustificationReason | null;
  justificationText?: string | null;
  remarks: string;
}): Promise<CommercialRecommendation> {
  return unwrap(
    await supabase.rpc("procurement_commercial_record_recommendation", {
      _case_id: args.caseId,
      _outcome: args.outcome,
      _bidder_id: args.bidderId ?? null,
      _justification_reason: args.justificationReason ?? null,
      _justification_text: args.justificationText ?? null,
      _remarks: args.remarks,
    }),
  );
}

export async function fetchCommercialApprovals(caseId: string): Promise<CommercialApproval[]> {
  const { data, error } = await supabase
    .from("procurement_commercial_approvals")
    .select("*")
    .eq("case_id", caseId)
    .order("decided_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The competent authority's clearance for an award that departs from L1 or
 * exceeds the approved estimate — a distinct assertion from the routine
 * sign-off, so it stays its own button rather than a side effect of one. */
export async function approveCstAuthority(caseId: string, remarks: string | null): Promise<CommercialApproval> {
  return unwrap(
    await supabase.rpc("procurement_approve_cst_authority", { _case_id: caseId, _remarks: remarks }),
  );
}

export async function fetchCstGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_cst_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}
