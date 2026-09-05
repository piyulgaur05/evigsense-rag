import { supabase } from "@/integrations/supabase/client";
import type { BoqLine, BudgetLedgerRow, Requisition, RequisitionPatch } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchRequisition(caseId: string): Promise<Requisition | null> {
  const { data, error } = await supabase
    .from("procurement_requisitions")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * The requisition is one row per case, created the first time anything is
 * saved against it. Upserting on `case_id` means the form does not have to
 * know whether this is the first save or the fifth.
 */
export async function saveRequisition(args: {
  caseId: string;
  userId: string;
  patch: RequisitionPatch;
}): Promise<Requisition> {
  return unwrap(
    await supabase
      .from("procurement_requisitions")
      .upsert(
        { case_id: args.caseId, created_by: args.userId, ...args.patch },
        { onConflict: "case_id" },
      )
      .select()
      .single(),
  );
}

export async function fetchBoqLines(caseId: string): Promise<BoqLine[]> {
  const { data, error } = await supabase
    .from("procurement_boq_lines")
    .select("*")
    .eq("case_id", caseId)
    .order("line_no");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type BoqDraftLine = {
  id?: string;
  item_name: string;
  specification: string | null;
  quantity: number;
  unit: string | null;
  hsn_code: string | null;
  estimated_rate: number | null;
};

/**
 * The whole bill is saved at once rather than row by row: a bill of quantities
 * is read as a single document, and half-saved lines would misprice the case
 * while the trigger recomputed its value between writes.
 */
export async function replaceBoqLines(args: {
  caseId: string;
  userId: string;
  lines: BoqDraftLine[];
}): Promise<BoqLine[]> {
  const keep = args.lines.filter((line) => line.item_name.trim().length > 0);

  const { error: deleteError } = await supabase
    .from("procurement_boq_lines")
    .delete()
    .eq("case_id", args.caseId);
  if (deleteError) throw new Error(deleteError.message);

  if (keep.length === 0) return [];

  const { data, error } = await supabase
    .from("procurement_boq_lines")
    .insert(
      keep.map((line, index) => ({
        case_id: args.caseId,
        line_no: index + 1,
        item_name: line.item_name.trim(),
        specification: line.specification?.trim() || null,
        quantity: Number.isFinite(line.quantity) ? line.quantity : 0,
        unit: line.unit?.trim() || null,
        hsn_code: line.hsn_code?.trim() || null,
        estimated_rate:
          line.estimated_rate === null || Number.isNaN(line.estimated_rate)
            ? null
            : line.estimated_rate,
        created_by: args.userId,
      })),
    )
    .select();

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchBudgetLedger(): Promise<BudgetLedgerRow[]> {
  const { data, error } = await supabase.rpc("procurement_budget_ledger");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetLedgerRow[];
}

/** What is still missing before this requisition can go to finance. */
export async function fetchRequisitionGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_requisition_gaps", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}
