import { supabase } from "@/integrations/supabase/client";
import type { PurchaseProposal } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchProposal(caseId: string): Promise<PurchaseProposal | null> {
  const { data, error } = await supabase
    .from("procurement_purchase_proposals")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchProposalGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_proposal_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveProposal(args: {
  caseId: string;
  recommendationNote: string;
}): Promise<PurchaseProposal> {
  return unwrap(
    await supabase.rpc("procurement_save_proposal", {
      _case_id: args.caseId,
      _recommendation_note: args.recommendationNote,
    }),
  );
}
