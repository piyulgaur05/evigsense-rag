import { supabase } from "@/integrations/supabase/client";
import type { GoodsReceipt, GrnLine, GrnSummaryRow } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchLiveGoodsReceipt(caseId: string): Promise<GoodsReceipt | null> {
  const { data, error } = await supabase
    .from("procurement_goods_receipts")
    .select("*")
    .eq("case_id", caseId)
    .order("cycle", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchGoodsReceiptCycles(caseId: string): Promise<GoodsReceipt[]> {
  const { data, error } = await supabase
    .from("procurement_goods_receipts")
    .select("*")
    .eq("case_id", caseId)
    .order("cycle", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGrnLines(grnId: string): Promise<GrnLine[]> {
  const { data, error } = await supabase
    .from("procurement_grn_lines")
    .select("*")
    .eq("grn_id", grnId)
    .order("line_no", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGrnSummary(caseId: string): Promise<GrnSummaryRow[]> {
  const { data, error } = await supabase.rpc("procurement_grn_summary", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGrnCloseGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_grn_close_cycle_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchGrnForwardGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_grn_forward_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveGrnLine(args: {
  lineId: string;
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  discrepancyReason: string | null;
}): Promise<GrnLine> {
  return unwrap(
    await supabase.rpc("procurement_save_grn_line", {
      _line_id: args.lineId,
      _delivered_qty: args.deliveredQty,
      _accepted_qty: args.acceptedQty,
      _rejected_qty: args.rejectedQty,
      _discrepancy_reason: args.discrepancyReason,
    }),
  );
}
