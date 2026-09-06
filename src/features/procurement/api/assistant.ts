import { supabase } from "@/integrations/supabase/client";

export type CaseAnswerSource = {
  document_id?: string;
  document_title?: string;
  page_number?: number | null;
  relevance?: number;
};

export type CaseAnswer = {
  answer: string;
  sources: CaseAnswerSource[];
  conversationId: string | null;
};

/**
 * Ask a question about one case.
 *
 * Goes through the product's existing assistant, scoped to the paperwork
 * attached to this case rather than to the asker's own uploads — so finance
 * can ask about a requisition somebody else raised, and nobody can ask about a
 * case they are not allowed to see.
 */
export async function askAboutCase(args: {
  caseId: string;
  query: string;
  conversationId?: string | null;
  /**
   * Narrows retrieval to one firm's own submission. Without it, a question
   * about whether a bidder holds some certificate is answered from whichever
   * bidder's papers matched best — which is a confidently wrong answer rather
   * than a missing one.
   */
  bidderId?: string | null;
}): Promise<CaseAnswer> {
  const { data, error } = await supabase.functions.invoke("rag-assistant", {
    body: {
      query: args.query,
      caseId: args.caseId,
      bidderId: args.bidderId || undefined,
      conversationId: args.conversationId || undefined,
    },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

  return {
    answer: data?.answer ?? "",
    sources: (data?.sources ?? []) as CaseAnswerSource[],
    conversationId: data?.conversationId ?? null,
  };
}

export type CaseDocumentReadiness = {
  total: number;
  indexed: number;
  still_reading: number;
  failed: number;
};

export async function fetchCaseDocumentReadiness(
  caseId: string,
): Promise<CaseDocumentReadiness> {
  const { data, error } = await supabase.rpc("procurement_case_document_readiness", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return {
    total: Number(row?.total ?? 0),
    indexed: Number(row?.indexed ?? 0),
    still_reading: Number(row?.still_reading ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}
