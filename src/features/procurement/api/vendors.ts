import { supabase } from "@/integrations/supabase/client";
import type { Vendor, VendorInsert } from "../types";

const COLUMNS =
  "id, name, registration_id, gst_number, pan_number, msme_category, email, phone," +
  " contact_person, address, city, state, country, website, category_id, notes," +
  " active, blacklisted, blacklist_reason, blacklisted_at, blacklisted_by," +
  " created_by, created_at, updated_at";

/**
 * The register as a picker sees it: in use, and not barred.
 *
 * Same split as `fetchLookups` / `fetchAllLookups` in `lookups.ts`, and for the
 * same reason — a form should not offer a firm nobody may deal with, while the
 * screen that maintains the register has to show exactly what is in it.
 */
export async function fetchVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from("procurement_vendors")
    .select(COLUMNS)
    .eq("active", true)
    .eq("blacklisted", false)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as Vendor[];
}

/** Everything, retired and barred included. The admin screen's view. */
export async function fetchAllVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from("procurement_vendors")
    .select(COLUMNS)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as Vendor[];
}

export async function createVendor(args: {
  vendor: VendorInsert;
  userId: string;
}): Promise<Vendor> {
  const { data, error } = await supabase
    .from("procurement_vendors")
    .insert({ ...args.vendor, created_by: args.userId })
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Vendor;
}

export async function updateVendor(args: {
  id: string;
  patch: Partial<VendorInsert>;
}): Promise<Vendor> {
  const { data, error } = await supabase
    .from("procurement_vendors")
    .update(args.patch)
    .eq("id", args.id)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Vendor;
}

/**
 * Bars a firm, or lifts the bar.
 *
 * There is no delete. A vendor that has been invited to or bid on anything is
 * referenced by rows that are now evidence, and the foreign keys are
 * ON DELETE RESTRICT precisely so that history cannot be rewritten by tidying
 * the register. Retiring takes a firm out of the pickers; barring says why.
 */
export async function setVendorBlacklist(args: {
  id: string;
  blacklisted: boolean;
  reason: string | null;
  userId: string;
}): Promise<Vendor> {
  const { data, error } = await supabase
    .from("procurement_vendors")
    .update({
      blacklisted: args.blacklisted,
      blacklist_reason: args.blacklisted ? args.reason : null,
      blacklisted_at: args.blacklisted ? new Date().toISOString() : null,
      blacklisted_by: args.blacklisted ? args.userId : null,
    })
    .eq("id", args.id)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as Vendor;
}
