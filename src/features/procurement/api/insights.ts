import { supabase } from "@/integrations/supabase/client";
import type {
  CaseActivityEntry,
  CycleTimeRow,
  DepartmentSpendRow,
  HeadlineMetrics,
  MonthlyFlowRow,
  StageAgingRow,
} from "../types";

/**
 * Everything that happened to a case, in one trail: decisions, movements,
 * questions, send-backs and paperwork. Merged in the database so the browser
 * does not have to fetch four tables and interleave them by hand.
 */
export async function fetchCaseActivity(caseId: string): Promise<CaseActivityEntry[]> {
  const { data, error } = await supabase.rpc("procurement_case_activity", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return (data ?? []) as CaseActivityEntry[];
}

export async function fetchHeadlineMetrics(): Promise<HeadlineMetrics | null> {
  const { data, error } = await supabase.rpc("procurement_headline_metrics");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as HeadlineMetrics[];
  return rows[0] ?? null;
}

export async function fetchStageAging(): Promise<StageAgingRow[]> {
  const { data, error } = await supabase.rpc("procurement_stage_aging");
  if (error) throw new Error(error.message);
  return (data ?? []) as StageAgingRow[];
}

export async function fetchMonthlyFlow(months = 12): Promise<MonthlyFlowRow[]> {
  const { data, error } = await supabase.rpc("procurement_monthly_flow", { _months: months });
  if (error) throw new Error(error.message);
  return (data ?? []) as MonthlyFlowRow[];
}

export async function fetchDepartmentSpend(): Promise<DepartmentSpendRow[]> {
  const { data, error } = await supabase.rpc("procurement_department_spend");
  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentSpendRow[];
}

export async function fetchCycleTime(): Promise<CycleTimeRow[]> {
  const { data, error } = await supabase.rpc("procurement_cycle_time");
  if (error) throw new Error(error.message);
  return (data ?? []) as CycleTimeRow[];
}
