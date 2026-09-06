import { supabase } from "@/integrations/supabase/client";
import type { ProcurementStage } from "../types";

/** A case document, joined with the row in `documents` that carries the file. */
export type CaseDocument = {
  id: string;
  case_id: string;
  document_id: string;
  stage: ProcurementStage;
  doc_type: string;
  is_generated: boolean;
  /** Set when the paper came in with one firm's bid rather than with the case. */
  bidder_id: string | null;
  version: number;
  /** Only the uploader (or a procurement admin) may detach or relabel a row. */
  uploaded_by: string;
  created_at: string;
  document: {
    id: string;
    title: string;
    original_filename: string | null;
    mime_type: string | null;
    status: string | null;
    storage_path: string;
    summary: string | null;
  } | null;
};

/**
 * What each desk is normally attaching, so the type never has to be chosen
 * before a file can go on the case.
 *
 * The taxonomy is worth keeping — a file that says "Comparative statement" is
 * more use to the next reader than one that says "scan_004.pdf" — but making it
 * a decision *in front of* the attach button turned a one-click act into a
 * twenty-two-item menu. Attaching now guesses from the stage the case is at and
 * the row can be relabelled afterwards.
 */
export const STAGE_DEFAULT_DOC_TYPE: Record<ProcurementStage, string> = {
  draft: "Requisition",
  mpr: "Requisition",
  finance: "Budget sanction",
  tender: "Tender document",
  tec: "Technical evaluation report",
  commercial: "Commercial bid opening",
  cst: "Comparative statement",
  dpc: "Committee resolution",
  pnc: "Negotiation minutes",
  purchase_proposal: "Purchase proposal",
  purchase_order: "Purchase order",
  goods_receipt: "Goods receipt note",
  payment_recommendation: "Payment recommendation",
  closed: "Other",
};

/** The paperwork a public purchase file is expected to carry. */
export const CASE_DOCUMENT_TYPES = [
  "Requisition",
  "Cost estimate",
  "Bill of quantities",
  "Drawing",
  "Budget sanction",
  "Notice inviting tender",
  "Tender document",
  "Corrigendum",
  "Bid / vendor response",
  "Technical evaluation report",
  "Commercial bid opening",
  "Comparative statement",
  "Minutes of meeting",
  "Committee resolution",
  "Negotiation minutes",
  "Purchase proposal",
  "Purchase order",
  "Goods receipt note",
  "Inspection report",
  "Invoice",
  "Payment recommendation",
  "Other",
] as const;

export async function fetchCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  const { data, error } = await supabase
    .from("procurement_case_documents")
    .select(
      "id, case_id, document_id, stage, doc_type, is_generated, bidder_id, version, uploaded_by, created_at," +
        " document:documents(id, title, original_filename, mime_type, status, storage_path, summary)",
    )
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CaseDocument[];
}

/**
 * Case paperwork rides the product's existing ingest pipeline: the file lands
 * in the `documents` bucket and table, goes on the processing queue like any
 * other upload, and is then linked to the case. That is what makes it
 * searchable and answerable by the assistant without a second pipeline.
 */
export async function attachDocumentToCase(args: {
  caseId: string;
  caseNo: string;
  stage: ProcurementStage;
  docType: string;
  file: File;
  userId: string;
  /**
   * Set for paperwork the portal produced rather than a person uploaded — a
   * notice inviting tender, a corrigendum. It rides exactly the same pipeline,
   * which is the point: a generated notice is OCR'd, embedded and answerable by
   * the case assistant like any other document on the file.
   */
  isGenerated?: boolean;
  /**
   * Whose bid this arrived with. A bid's certificates are ordinary case
   * documents — same bucket, same ingest, same embeddings — and this is the
   * only thing that distinguishes them, so the evaluation can later ask what
   * one firm actually sent instead of reading the whole case.
   */
  bidderId?: string | null;
}): Promise<string> {
  const extension = args.file.name.split(".").pop() ?? "bin";
  const storagePath = `${args.userId}/${Date.now()}_${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, args.file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      title: `${args.caseNo} · ${args.docType} · ${args.file.name}`,
      original_filename: args.file.name,
      storage_path: storagePath,
      mime_type: args.file.type,
      created_by: args.userId,
      status: "queued",
    })
    .select()
    .single();
  if (documentError) throw new Error(documentError.message);

  const { error: linkError } = await supabase.from("procurement_case_documents").insert({
    case_id: args.caseId,
    document_id: document.id,
    stage: args.stage,
    doc_type: args.docType,
    is_generated: args.isGenerated ?? false,
    bidder_id: args.bidderId ?? null,
    uploaded_by: args.userId,
  });
  if (linkError) throw new Error(linkError.message);

  // Best effort: the file is safe either way, and reset-stuck-documents will
  // pick up anything the queue missed.
  await supabase
    .from("document_processing_queue")
    .insert({ document_id: document.id, user_id: args.userId, status: "pending" });
  await supabase.functions.invoke("process-queue").catch(() => undefined);

  // The id is what lets a caller go on to do something with the file it just
  // attached -- reading a bill of quantities out of it, for one.
  return document.id;
}

export async function detachCaseDocument(linkId: string): Promise<void> {
  const { error } = await supabase.from("procurement_case_documents").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
}

/**
 * Relabels a document already on the case.
 *
 * Only the link row changes — the file, its ingest and its embeddings are
 * untouched, because the type is a note about the part the paper plays in this
 * case and not a property of the document itself.
 */
export async function updateCaseDocumentType(args: {
  linkId: string;
  docType: string;
}): Promise<void> {
  const { error } = await supabase
    .from("procurement_case_documents")
    .update({ doc_type: args.docType })
    .eq("id", args.linkId);
  if (error) throw new Error(error.message);
}

export async function signedDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
