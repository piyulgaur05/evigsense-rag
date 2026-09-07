import { supabase } from "@/integrations/supabase/client";
import type { Negotiation, NegotiationRound } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchNegotiation(caseId: string): Promise<Negotiation | null> {
  const { data, error } = await supabase
    .from("procurement_negotiations")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchNegotiationRounds(caseId: string): Promise<NegotiationRound[]> {
  const { data, error } = await supabase
    .from("procurement_negotiation_rounds")
    .select("*")
    .eq("case_id", caseId)
    .order("round_no", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchNegotiationGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_pnc_agreement_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveNegotiationMandate(args: {
  caseId: string;
  reason: string;
  instructions: string | null;
  objectives: string[];
}): Promise<Negotiation> {
  return unwrap(
    await supabase.rpc("procurement_save_negotiation_mandate", {
      _case_id: args.caseId,
      _reason: args.reason,
      _instructions: args.instructions,
      _objectives: args.objectives,
    }),
  );
}

export async function openNegotiationRound(args: {
  caseId: string;
  vendorOffer: number;
  committeeCounterOffer: number | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  notes: string | null;
}): Promise<NegotiationRound> {
  return unwrap(
    await supabase.rpc("procurement_open_negotiation_round", {
      _case_id: args.caseId,
      _vendor_offer: args.vendorOffer,
      _committee_counter_offer: args.committeeCounterOffer,
      _delivery_days: args.deliveryDays,
      _payment_terms: args.paymentTerms,
      _warranty_months: args.warrantyMonths,
      _notes: args.notes,
    }),
  );
}

export async function updateNegotiationRound(args: {
  roundId: string;
  vendorOffer: number;
  committeeCounterOffer: number | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  notes: string | null;
}): Promise<NegotiationRound> {
  return unwrap(
    await supabase.rpc("procurement_update_negotiation_round", {
      _round_id: args.roundId,
      _vendor_offer: args.vendorOffer,
      _committee_counter_offer: args.committeeCounterOffer,
      _delivery_days: args.deliveryDays,
      _payment_terms: args.paymentTerms,
      _warranty_months: args.warrantyMonths,
      _notes: args.notes,
    }),
  );
}

/** Closing above the vendor's own offer this round is refused by the database
 * without an override reason — this only ever carries whatever the committee
 * typed to the function that decides whether it is enough. */
export async function closeNegotiationRound(args: {
  roundId: string;
  finalOffer: number;
  overrideReason: string | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  warrantyMonths: number | null;
  notes: string | null;
}): Promise<NegotiationRound> {
  return unwrap(
    await supabase.rpc("procurement_close_negotiation_round", {
      _round_id: args.roundId,
      _final_offer: args.finalOffer,
      _override_reason: args.overrideReason,
      _delivery_days: args.deliveryDays,
      _payment_terms: args.paymentTerms,
      _warranty_months: args.warrantyMonths,
      _notes: args.notes,
    }),
  );
}
