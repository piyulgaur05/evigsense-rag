import { supabase } from "@/integrations/supabase/client";
import type {
  BidderPatch,
  BidderWithVendor,
  CorrigendumWithNotices,
  InviteeWithVendor,
  Tender,
  TenderItem,
  TenderPatch,
  TenderSummary,
} from "../types";

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchTender(caseId: string): Promise<Tender | null> {
  const { data, error } = await supabase
    .from("procurement_tenders")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * One tender per case, created the first time anything is saved against it —
 * the same upsert-on-case_id shape as `saveRequisition`, so the form never has
 * to know whether this is the first save or the fifth.
 *
 * The lifecycle columns are absent from `TenderPatch` on purpose. Status,
 * timestamps and the notice belong to the functions below; a form that could
 * set `status` directly would let a client float a tender without publishing a
 * bill, freezing a notice or leaving a trail.
 */
export async function saveTender(args: {
  caseId: string;
  userId: string;
  patch: TenderPatch;
}): Promise<Tender> {
  return unwrap(
    await supabase
      .from("procurement_tenders")
      .upsert(
        { case_id: args.caseId, created_by: args.userId, ...args.patch },
        { onConflict: "case_id" },
      )
      .select()
      .single(),
  );
}

export async function fetchTenderSummary(caseId: string): Promise<TenderSummary | null> {
  const { data, error } = await supabase.rpc("procurement_tender_summary", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return (data ?? [])[0] ?? null;
}

export async function fetchTenderGaps(caseId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("procurement_tender_gaps", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchTenderItems(tenderId: string): Promise<TenderItem[]> {
  const { data, error } = await supabase
    .from("procurement_tender_items")
    .select("*")
    .eq("tender_id", tenderId)
    .order("line_no");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchInvitees(tenderId: string): Promise<InviteeWithVendor[]> {
  const { data, error } = await supabase
    .from("procurement_tender_invitees")
    .select("*, vendor:procurement_vendors(id, name)")
    .eq("tender_id", tenderId);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as InviteeWithVendor[]).sort((a, b) =>
    (a.vendor?.name ?? "").localeCompare(b.vendor?.name ?? ""),
  );
}

/**
 * Replaces the invitation list wholesale, the way `replaceBoqLines` does.
 *
 * An invitation carries no state of its own — it is a name on a list — so
 * diffing it row by row would be more code for no gain. Anything that did
 * accumulate state (an acknowledgement, a returned envelope) would have to
 * change this.
 */
export async function replaceInvitees(args: {
  tenderId: string;
  vendorIds: string[];
  userId: string;
}): Promise<void> {
  const { error: clearError } = await supabase
    .from("procurement_tender_invitees")
    .delete()
    .eq("tender_id", args.tenderId);
  if (clearError) throw new Error(clearError.message);

  if (!args.vendorIds.length) return;

  const { error } = await supabase.from("procurement_tender_invitees").insert(
    args.vendorIds.map((vendorId) => ({
      tender_id: args.tenderId,
      vendor_id: vendorId,
      invited_by: args.userId,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function fetchBidders(caseId: string): Promise<BidderWithVendor[]> {
  const { data, error } = await supabase
    .from("procurement_bidders")
    .select("*, vendor:procurement_vendors(id, name, msme_category, blacklisted)")
    .eq("case_id", caseId)
    .order("created_at");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BidderWithVendor[];
}

/**
 * Returns the bidder's id, which the caller needs on a create: a firm's
 * certificates arrive in the same envelope as its bid, so the form stages the
 * files and attaches them the moment there is a row to attach them to.
 */
export async function saveBidder(args: {
  id?: string;
  patch: BidderPatch;
  userId: string;
}): Promise<string> {
  if (args.id) {
    const { error } = await supabase
      .from("procurement_bidders")
      .update(args.patch)
      .eq("id", args.id);
    if (error) throw new Error(error.message);
    return args.id;
  }

  const { data, error } = await supabase
    .from("procurement_bidders")
    .insert({
      ...args.patch,
      // case_id is NOT NULL and a trigger overwrites it from the tender anyway.
      // Sending a placeholder keeps the insert well-formed without inviting the
      // client to believe it decides which case a bid belongs to.
      case_id: args.patch.case_id ?? "00000000-0000-0000-0000-000000000000",
      created_by: args.userId,
      recorded_by: args.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteBidder(id: string): Promise<void> {
  const { error } = await supabase.from("procurement_bidders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchCorrigenda(caseId: string): Promise<CorrigendumWithNotices[]> {
  const { data, error } = await supabase
    .from("procurement_corrigenda")
    .select(
      "*, notices:procurement_corrigendum_notices(id, vendor_id, channel, notified_at," +
        " vendor:procurement_vendors(id, name))",
    )
    .eq("case_id", caseId)
    .order("serial_no");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CorrigendumWithNotices[];
}

export async function recordCorrigendumNotice(args: {
  corrigendumId: string;
  vendorIds: string[];
  channel: string;
  userId: string;
}): Promise<void> {
  if (!args.vendorIds.length) return;
  const { error } = await supabase.from("procurement_corrigendum_notices").upsert(
    args.vendorIds.map((vendorId) => ({
      corrigendum_id: args.corrigendumId,
      vendor_id: vendorId,
      channel: args.channel,
      notified_by: args.userId,
    })),
    { onConflict: "corrigendum_id,vendor_id" },
  );
  if (error) throw new Error(error.message);
}

// ===== The lifecycle =====
//
// Each of these is a database function rather than a write, because each is a
// constrained multi-table act that has to leave a trail. See the long comment
// above `procurement_float_tender` in the migration for why that is not
// incidental.

export async function publishBoqToTender(caseId: string): Promise<number> {
  const { data, error } = await supabase.rpc("procurement_publish_boq", { _case_id: caseId });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function floatTender(args: { caseId: string; remarks?: string }): Promise<void> {
  const { error } = await supabase.rpc("procurement_float_tender", {
    _case_id: args.caseId,
    _remarks: args.remarks ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function closeBidding(args: { caseId: string; remarks?: string }): Promise<void> {
  const { error } = await supabase.rpc("procurement_close_bidding", {
    _case_id: args.caseId,
    _remarks: args.remarks ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function issueCorrigendum(args: {
  caseId: string;
  category: string;
  title: string;
  reason: string;
  detail?: string | null;
  newBidEndAt?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("procurement_issue_corrigendum", {
    _case_id: args.caseId,
    _payload: {
      category: args.category,
      title: args.title,
      reason: args.reason,
      detail: args.detail ?? null,
      new_bid_end_at: args.newBidEndAt ?? null,
    },
  });
  if (error) throw new Error(error.message);
}

export async function revokeCorrigendum(args: { id: string; reason: string }): Promise<void> {
  const { error } = await supabase.rpc("procurement_revoke_corrigendum", {
    _corrigendum_id: args.id,
    _reason: args.reason,
  });
  if (error) throw new Error(error.message);
}

/**
 * The papers each firm sent with its bid, and how much of them has been read.
 *
 * `indexed_count` lags `document_count` while the ingest pipeline works. The
 * roster shows both, because a question asked against a half-read submission
 * gets a thin answer and the reader deserves to know why.
 */
export async function fetchBidSubmissions(caseId: string) {
  const { data, error } = await supabase.rpc("procurement_bid_submissions", {
    _case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** One firm's own paperwork, in the order it arrived. */
export async function fetchBidderDocuments(bidderId: string) {
  const { data, error } = await supabase
    .from("procurement_case_documents")
    .select(
      "id, case_id, document_id, stage, doc_type, is_generated, bidder_id, version," +
        " uploaded_by, created_at, document:documents(id, title, original_filename," +
        " mime_type, status, storage_path, summary)",
    )
    .eq("bidder_id", bidderId)
    .order("created_at");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Points the tender (or a corrigendum) at the notice document just filed. */
export async function linkNoticeDocument(args: {
  table: "procurement_tenders" | "procurement_corrigenda";
  id: string;
  documentId: string;
}): Promise<void> {
  const { error } = await supabase
    .from(args.table)
    .update({ notice_document_id: args.documentId })
    .eq("id", args.id);
  if (error) throw new Error(error.message);
}
