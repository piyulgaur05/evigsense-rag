import { supabase } from "@/integrations/supabase/client";
import type { Lookup } from "../types";

/** Departments, categories, cost centres, units — one table keyed by `kind`. */
export async function fetchLookups(kind?: string): Promise<Lookup[]> {
  let query = supabase.from("procurement_lookups").select("*").eq("active", true);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
