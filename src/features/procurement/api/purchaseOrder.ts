import { supabase } from "@/integrations/supabase/client";
import type { PoAiDraft, PoAmendment, PoLine, PurchaseOrder } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchPurchaseOrder(caseId: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase
    .from("procurement_purchase_orders")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPoLines(caseId: string): Promise<PoLine[]> {
  const { data, error } = await supabase
    .from("procurement_po_lines")
    .select("*")
    .eq("case_id", caseId)
    .order("line_no", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPoAmendments(caseId: string): Promise<PoAmendment[]> {
  const { data, error } = await supabase
    .from("procurement_po_amendments")
    .select("*")
    .eq("case_id", caseId)
    .order("amended_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchPoAiDraft(caseId: string): Promise<PoAiDraft | null> {
  const { data, error } = await supabase
    .from("procurement_po_ai_drafts")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPoGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_po_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function savePurchaseOrder(args: {
  caseId: string;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  billingAddress: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  specialConditions: string | null;
  warrantyMonths: number | null;
  penaltyClause: string | null;
}): Promise<PurchaseOrder> {
  return unwrap(
    await supabase.rpc("procurement_save_po", {
      _case_id: args.caseId,
      _delivery_date: args.deliveryDate,
      _delivery_address: args.deliveryAddress,
      _billing_address: args.billingAddress,
      _payment_terms: args.paymentTerms,
      _delivery_terms: args.deliveryTerms,
      _special_conditions: args.specialConditions,
      _warranty_months: args.warrantyMonths,
      _penalty_clause: args.penaltyClause,
    }),
  );
}

export async function recordVendorAck(args: {
  caseId: string;
  status: "acknowledged" | "accepted" | "rejected";
  note: string | null;
}): Promise<PurchaseOrder> {
  return unwrap(
    await supabase.rpc("procurement_record_po_vendor_ack", {
      _case_id: args.caseId,
      _status: args.status,
      _note: args.note,
    }),
  );
}

export async function amendPurchaseOrder(args: {
  caseId: string;
  reason: string;
  deliveryDate: string | null;
  deliveryTerms: string | null;
  specialConditions: string | null;
  totalValue: number | null;
}): Promise<PurchaseOrder> {
  return unwrap(
    await supabase.rpc("procurement_amend_po", {
      _case_id: args.caseId,
      _reason: args.reason,
      _delivery_date: args.deliveryDate,
      _delivery_terms: args.deliveryTerms,
      _special_conditions: args.specialConditions,
      _total_value: args.totalValue,
    }),
  );
}

/** Drafts the order's clause text through the product's own model, offered
 * back for review — the same shape as reading a bill of quantities out of a
 * file, never written into the order on its own. */
export async function requestPoAiDraft(caseId: string): Promise<PoAiDraft> {
  const { data, error } = await supabase.functions.invoke("po-ai-draft", {
    body: { caseId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.draft as PoAiDraft;
}
