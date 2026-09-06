import { supabase } from "@/integrations/supabase/client";
import type { BudgetHead, Lookup } from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Master data as the administrator sees it — inactive rows included.
 *
 * Deliberately not `fetchLookups()`: that one filters to `active` because it
 * feeds the pickers, and an admin screen that hid what it had just retired
 * would look like it had deleted it.
 */
export async function fetchAllLookups(): Promise<Lookup[]> {
  const { data, error } = await supabase
    .from("procurement_lookups")
    .select("*")
    .order("kind")
    .order("sort_order")
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type LookupDraft = {
  kind: string;
  name: string;
  code: string | null;
  sort_order: number;
  active: boolean;
};

export async function createLookup(args: {
  draft: LookupDraft;
  userId: string;
}): Promise<Lookup> {
  return unwrap(
    await supabase
      .from("procurement_lookups")
      .insert({ ...args.draft, created_by: args.userId })
      .select()
      .single(),
  );
}

export async function updateLookup(args: {
  id: string;
  patch: Partial<LookupDraft>;
}): Promise<Lookup> {
  return unwrap(
    await supabase
      .from("procurement_lookups")
      .update(args.patch)
      .eq("id", args.id)
      .select()
      .single(),
  );
}

/**
 * Adds several entries at once, skipping names the kind already carries.
 *
 * `(kind, name)` is unique, so a paste that overlaps what is already there
 * would fail the whole insert on the first duplicate. Filtering first means a
 * re-paste of a longer list adds the new rows instead of erroring.
 */
export async function createLookups(args: {
  kind: string;
  entries: { name: string; code: string | null }[];
  userId: string;
}): Promise<{ added: number; skipped: number }> {
  const { data: existing, error } = await supabase
    .from("procurement_lookups")
    .select("name")
    .eq("kind", args.kind);

  if (error) throw new Error(error.message);

  const taken = new Set((existing ?? []).map((row) => row.name.trim().toLowerCase()));
  const fresh = args.entries.filter((entry) => !taken.has(entry.name.toLowerCase()));

  if (fresh.length === 0) {
    return { added: 0, skipped: args.entries.length };
  }

  // Sort order continues after whatever is already there, so a paste lands at
  // the bottom of the list rather than interleaving with it.
  const base = (existing ?? []).length;
  const rows = fresh.map((entry, index) => ({
    kind: args.kind,
    name: entry.name,
    code: entry.code,
    sort_order: base + index,
    active: true,
    created_by: args.userId,
  }));

  const { error: insertError } = await supabase.from("procurement_lookups").insert(rows);
  if (insertError) throw new Error(insertError.message);

  return { added: fresh.length, skipped: args.entries.length - fresh.length };
}

/**
 * Removes an entry outright.
 *
 * Every column that points at a lookup is `ON DELETE SET NULL`, so this does
 * not cascade into cases — but it does blank the field on any case that used
 * it, and the case file will then read "Not stated" where it once named a
 * department. Retiring (`active = false`) is the reversible move and is what
 * the screen offers first; this exists for entries created by mistake.
 */
export async function deleteLookup(id: string): Promise<void> {
  const { error } = await supabase.from("procurement_lookups").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

function tally({ count, error }: { count: number | null; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * How many rows still point at one lookup entry.
 *
 * Written out rather than looped over a table/column list: the generated types
 * key column names to their own table, so a dynamic pair would have to be cast
 * past the checker — which is exactly the checking worth keeping when the
 * answer decides whether a delete is safe. Every foreign key into
 * `procurement_lookups` is counted here; adding one to the schema means adding
 * it here too.
 */
export async function countLookupUsage(id: string): Promise<number> {
  const head = { count: "exact" as const, head: true };

  const counts = await Promise.all([
    supabase.from("procurement_cases").select("id", head).eq("department_id", id).then(tally),
    supabase.from("procurement_requisitions").select("id", head).eq("category_id", id).then(tally),
    supabase.from("procurement_requisitions").select("id", head).eq("cost_centre_id", id).then(tally),
    supabase.from("procurement_requisitions").select("id", head).eq("priority_id", id).then(tally),
    supabase
      .from("procurement_requisitions")
      .select("id", head)
      .eq("procurement_type_id", id)
      .then(tally),
    supabase.from("procurement_requisitions").select("id", head).eq("warehouse_id", id).then(tally),
    supabase.from("procurement_budget_heads").select("id", head).eq("department_id", id).then(tally),
    supabase.from("procurement_budget_heads").select("id", head).eq("category_id", id).then(tally),
    supabase.from("procurement_user_roles").select("id", head).eq("department_id", id).then(tally),
  ]);

  return counts.reduce((total, n) => total + n, 0);
}

// ===== Budget heads =====

/** Every head, retired ones included — the ledger view only returns live ones. */
export async function fetchBudgetHeads(): Promise<BudgetHead[]> {
  const { data, error } = await supabase
    .from("procurement_budget_heads")
    .select("*")
    .order("fiscal_year", { ascending: false })
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export type BudgetHeadDraft = {
  name: string;
  code: string | null;
  fiscal_year: string;
  department_id: string | null;
  category_id: string | null;
  allocated: number;
  notes: string | null;
  active: boolean;
};

export async function createBudgetHead(args: {
  draft: BudgetHeadDraft;
  userId: string;
}): Promise<BudgetHead> {
  return unwrap(
    await supabase
      .from("procurement_budget_heads")
      .insert({ ...args.draft, created_by: args.userId })
      .select()
      .single(),
  );
}

export async function updateBudgetHead(args: {
  id: string;
  patch: Partial<BudgetHeadDraft>;
}): Promise<BudgetHead> {
  return unwrap(
    await supabase
      .from("procurement_budget_heads")
      .update(args.patch)
      .eq("id", args.id)
      .select()
      .single(),
  );
}
