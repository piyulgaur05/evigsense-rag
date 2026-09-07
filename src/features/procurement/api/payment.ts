import { supabase } from "@/integrations/supabase/client";
import type { PaymentAiDraft, PaymentRecommendation } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchPaymentRecommendation(caseId: string): Promise<PaymentRecommendation | null> {
  const { data, error } = await supabase
    .from("procurement_payment_recommendations")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchPaymentGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_payment_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function savePaymentRecommendation(args: {
  caseId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: number;
  penaltyDeductions: number;
  voucherNumber: string | null;
  voucherDate: string | null;
  remarks: string | null;
}): Promise<PaymentRecommendation> {
  return unwrap(
    await supabase.rpc("procurement_save_payment_recommendation", {
      _case_id: args.caseId,
      _invoice_number: args.invoiceNumber,
      _invoice_date: args.invoiceDate,
      _invoice_amount: args.invoiceAmount,
      _penalty_deductions: args.penaltyDeductions,
      _voucher_number: args.voucherNumber,
      _voucher_date: args.voucherDate,
      _remarks: args.remarks,
    }),
  );
}

export async function fetchPaymentAiDraft(caseId: string): Promise<PaymentAiDraft | null> {
  const { data, error } = await supabase
    .from("procurement_payment_ai_drafts")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Drafts the recommendation note through the product's own model, offered
 * back for review — never written into the record on its own. */
export async function requestPaymentAiDraft(caseId: string): Promise<PaymentAiDraft> {
  const { data, error } = await supabase.functions.invoke("payment-ai-draft", {
    body: { caseId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.draft as PaymentAiDraft;
}
