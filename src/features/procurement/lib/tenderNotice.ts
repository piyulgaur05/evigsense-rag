import { jsPDF } from "jspdf";
import { formatDate, formatDateTime, formatMoney } from "./format";
import { tenderModeLabel } from "./tender";

/**
 * The notice, as it was issued.
 *
 * Read from `procurement_tenders.notice_snapshot` (or a corrigendum's), never
 * from the tender's live columns. The snapshot is written once, when the notice
 * goes out, and the whole point of it is that the tender stays editable
 * afterwards while what was published does not. Anything here that reached for
 * the current row would quietly undo that.
 */
export type NoticeSnapshot = {
  reference_no: string | null;
  title: string | null;
  case_no: string | null;
  department: string | null;
  mode: string;
  portal_reference: string | null;
  portal_url: string | null;
  scope_summary: string | null;
  eligibility: string | null;
  single_justification: string | null;
  currency: string;
  emd_required: boolean;
  emd_amount: number;
  emd_exemption_note: string | null;
  tender_fee: number;
  performance_security_pct: number;
  gst_pct: number;
  payment_terms: string | null;
  warranty_terms: string | null;
  published_on: string | null;
  bid_start_at: string | null;
  bid_end_at: string | null;
  prebid_meeting_at: string | null;
  prebid_venue: string | null;
  query_deadline_at: string | null;
  technical_opening_at: string | null;
  financial_opening_at: string | null;
  delivery_days: number | null;
  bid_validity_days: number | null;
  estimated_value: number | null;
  items: {
    line_no: number;
    item_name: string;
    specification: string | null;
    quantity: number;
    unit: string | null;
    hsn_code: string | null;
    estimated_rate: number | null;
    line_amount: number;
  }[];
  invitees: string[];
};

export function asNotice(value: unknown): NoticeSnapshot | null {
  if (!value || typeof value !== "object") return null;
  return value as NoticeSnapshot;
}

/** The facts the notice states, in the order it states them. */
export function noticeTerms(notice: NoticeSnapshot): { label: string; value: string }[] {
  const terms: { label: string; value: string }[] = [
    { label: "Mode of tender", value: tenderModeLabel(notice.mode) },
  ];

  if (notice.portal_reference) {
    terms.push({ label: "Portal reference", value: notice.portal_reference });
  }
  terms.push(
    { label: "Issued on", value: formatDate(notice.published_on) },
    { label: "Bidding opens", value: formatDateTime(notice.bid_start_at) },
    { label: "Bids close", value: formatDateTime(notice.bid_end_at) },
  );
  if (notice.prebid_meeting_at) {
    terms.push({
      label: "Pre-bid meeting",
      value: notice.prebid_venue
        ? `${formatDateTime(notice.prebid_meeting_at)}, ${notice.prebid_venue}`
        : formatDateTime(notice.prebid_meeting_at),
    });
  }
  if (notice.query_deadline_at) {
    terms.push({ label: "Queries by", value: formatDateTime(notice.query_deadline_at) });
  }
  if (notice.technical_opening_at) {
    terms.push({ label: "Technical bids opened", value: formatDateTime(notice.technical_opening_at) });
  }
  if (notice.financial_opening_at) {
    terms.push({ label: "Price bids opened", value: formatDateTime(notice.financial_opening_at) });
  }

  terms.push({
    label: "Earnest money",
    value: notice.emd_required
      ? formatMoney(notice.emd_amount)
      : notice.emd_exemption_note || "Not required",
  });
  if (notice.tender_fee > 0) {
    terms.push({ label: "Tender fee", value: formatMoney(notice.tender_fee) });
  }
  if (notice.performance_security_pct > 0) {
    terms.push({
      label: "Performance security",
      value: `${notice.performance_security_pct}% of the order value`,
    });
  }
  if (notice.delivery_days !== null) {
    terms.push({ label: "Delivery within", value: `${notice.delivery_days} days` });
  }
  if (notice.bid_validity_days !== null) {
    terms.push({ label: "Bids to remain valid", value: `${notice.bid_validity_days} days` });
  }
  if (notice.payment_terms) terms.push({ label: "Payment terms", value: notice.payment_terms });
  if (notice.warranty_terms) terms.push({ label: "Warranty", value: notice.warranty_terms });

  return terms;
}

/**
 * Renders the notice to a PDF.
 *
 * jsPDF rather than an edge function: it is already a dependency and already
 * used this way elsewhere in the product, and keeping the notice on the client
 * means the officer can see exactly what they are about to file before they
 * file it.
 */
export function noticeToPdf(notice: NoticeSnapshot, heading: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 56;
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  const bottom = doc.internal.pageSize.getHeight() - 56;
  let y = 64;

  const page = () => {
    if (y > bottom) {
      doc.addPage();
      y = 64;
    }
  };

  const paragraph = (text: string, size = 10, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style).setFontSize(size);
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      page();
      doc.text(line, marginX, y);
      y += size + 4;
    }
  };

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text(heading, marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(
    [notice.reference_no, notice.case_no, notice.department].filter(Boolean).join("   ·   "),
    marginX,
    y,
  );
  y += 14;
  doc.setDrawColor(120).line(marginX, y, marginX + width, y);
  y += 22;

  if (notice.title) {
    paragraph(notice.title, 12, "bold");
    y += 6;
  }
  if (notice.scope_summary) {
    paragraph(notice.scope_summary);
    y += 10;
  }

  paragraph("Terms", 11, "bold");
  y += 4;
  for (const term of noticeTerms(notice)) {
    page();
    doc.setFont("helvetica", "bold").setFontSize(9.5).text(term.label, marginX, y);
    doc.setFont("helvetica", "normal");
    // jsPDF's built-in "helvetica" carries no ₹ glyph and silently
    // substitutes a stray superscript in its place; noticeTerms() is shared
    // with the on-screen notice, where a web font renders ₹ correctly, so
    // the swap happens here rather than in the shared value itself.
    const value = term.value.replace(/₹/g, "Rs. ");
    for (const line of doc.splitTextToSize(value, width - 150) as string[]) {
      doc.text(line, marginX + 150, y);
      y += 13;
    }
    y += 2;
  }
  y += 10;

  if (notice.eligibility) {
    paragraph("Who may bid", 11, "bold");
    y += 4;
    paragraph(notice.eligibility);
    y += 10;
  }

  if (notice.invitees.length) {
    paragraph("Invited to bid", 11, "bold");
    y += 4;
    paragraph(notice.invitees.join(", "));
    y += 10;
  }

  if (notice.items.length) {
    paragraph("Schedule of requirements", 11, "bold");
    y += 8;
    doc.setFontSize(9);
    for (const item of notice.items) {
      page();
      doc.setFont("helvetica", "bold");
      doc.text(`${item.line_no}.`, marginX, y);
      const head = `${item.item_name} — ${item.quantity} ${item.unit ?? ""}`.trim();
      for (const line of doc.splitTextToSize(head, width - 22) as string[]) {
        doc.text(line, marginX + 22, y);
        y += 12;
      }
      doc.setFont("helvetica", "normal");
      if (item.specification) {
        for (const line of doc.splitTextToSize(item.specification, width - 22) as string[]) {
          page();
          doc.text(line, marginX + 22, y);
          y += 11;
        }
      }
      y += 6;
    }
    if (notice.estimated_value) {
      page();
      doc.setFont("helvetica", "bold").setFontSize(10);
      doc.text(`Estimated value: ${formatMoney(notice.estimated_value).replace("₹", "Rs. ")}`, marginX, y);
      y += 16;
    }
  }

  return doc.output("blob");
}
