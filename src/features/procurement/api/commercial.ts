import { supabase } from "@/integrations/supabase/client";
import type {
  CommercialCompliance,
  CommercialQuote,
  CommercialRankingRow,
  CommercialLineComparisonRow,
  CommercialReasonableness,
  CommercialRecord,
  QuotePriceSource,
  QuoteScheduleIssue,
  QuoteScheduleLine,
  RankingBasis,
} from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchCommercialRecord(caseId: string): Promise<CommercialRecord | null> {
  const { data, error } = await supabase
    .from("procurement_commercial")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCommercialQuotes(caseId: string): Promise<CommercialQuote[]> {
  const { data, error } = await supabase
    .from("procurement_commercial_quotes")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * One bidder's commercial reading. Every figure that gates a decision —
 * tax, freight, the evaluated cost — is derived by the database; this only
 * ever writes the inputs.
 */
export async function saveQuote(args: {
  bidderId: string;
  basePrice?: number | null;
  gstPct?: number | null;
  freight?: number | null;
  otherCharges?: number | null;
  discount?: number | null;
  loadingAmount?: number | null;
  loadingNote?: string | null;
  commercialCompliance?: CommercialCompliance;
  priceSource?: QuotePriceSource;
  remarks?: string | null;
}): Promise<CommercialQuote> {
  return unwrap(
    await supabase.rpc("procurement_save_quote", {
      _bidder_id: args.bidderId,
      _base_price: args.basePrice ?? null,
      _gst_pct: args.gstPct ?? null,
      _freight: args.freight ?? 0,
      _other_charges: args.otherCharges ?? 0,
      _discount: args.discount ?? 0,
      _loading_amount: args.loadingAmount ?? 0,
      _loading_note: args.loadingNote ?? null,
      _commercial_compliance: args.commercialCompliance ?? "pending",
      _price_source: args.priceSource ?? "manual",
      _remarks: args.remarks ?? null,
    }),
  );
}

/**
 * Reads a whole price schedule onto the published bill in one transaction —
 * matching, deriving a rate from a stated amount where needed, and raising
 * the issues the reader has to see. Never a plain table write: the matching
 * rules have to run on every submission, or a corrected import would leave
 * stale issues describing a schedule that no longer exists.
 */
export async function recordQuoteSchedule(args: {
  quoteId: string;
  lines: QuoteScheduleLine[];
  source?: string;
  statedTotal?: number | null;
}): Promise<QuoteScheduleIssue[]> {
  const { data, error } = await supabase.rpc("procurement_record_quote_schedule", {
    _quote_id: args.quoteId,
    _lines: args.lines,
    _source: args.source ?? "manual",
    _stated_total: args.statedTotal ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as QuoteScheduleIssue[];
}

/** Changing the basis L1 is read off is an event, not a preference — it
 * changes who is L1, and the statement has to say which basis was in force. */
export async function setRankingBasis(caseId: string, basis: RankingBasis): Promise<CommercialRecord> {
  return unwrap(
    await supabase.rpc("procurement_set_ranking_basis", { _case_id: caseId, _basis: basis }),
  );
}

export async function fetchCommercialRanking(caseId: string): Promise<CommercialRankingRow[]> {
  const { data, error } = await supabase.rpc("procurement_commercial_ranking", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchLineComparison(caseId: string): Promise<CommercialLineComparisonRow[]> {
  const { data, error } = await supabase.rpc("procurement_commercial_line_comparison", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchReasonableness(caseId: string): Promise<CommercialReasonableness | null> {
  const { data, error } = await supabase.rpc("procurement_commercial_reasonableness", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function fetchCommercialGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_commercial_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}
