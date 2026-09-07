import { jsPDF } from "jspdf";
import { formatDate, formatDateTime, formatMoney } from "./format";
import type { NamedCaseSignature } from "../api/signatures";
import type { PoLine, PurchaseOrder } from "../types";

/** jsPDF's built-in "helvetica" carries no ₹ glyph — it silently substitutes
 * a stray superscript in its place, on a document meant to state a sum of
 * money plainly. "Rs." is what every field here actually prints instead. */
function pdfMoney(value: number | string | null | undefined): string {
  return formatMoney(value).replace("₹", "Rs. ");
}

/**
 * Renders the order to a PDF, with every signature on the case's own trail
 * reproduced at the foot — not just `po.issue`'s. The order sitting at
 * `purchase_order` is the end of a chain (finance clearing the budget, the
 * committee, negotiation, the approving authority) and a document that only
 * showed the last mark would misstate whose decisions actually got it here.
 *
 * jsPDF rather than an edge function, the same reasoning `noticeToPdf`
 * already carries: it is already a dependency, and rendering on the client
 * means the officer sees exactly what they are about to file before they
 * file it.
 */
export function purchaseOrderToPdf(args: {
  po: PurchaseOrder;
  caseNo: string;
  department: string | null;
  vendorName: string;
  lines: PoLine[];
  signatures: NamedCaseSignature[];
  actionLabel: (code: string) => string;
}): Blob {
  const { po, caseNo, department, vendorName, lines, signatures, actionLabel } = args;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 56;
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  const bottom = doc.internal.pageSize.getHeight() - 56;
  let y = 64;

  const page = (needed = 0) => {
    if (y + needed > bottom) {
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

  const field = (label: string, value: string | null) => {
    if (!value) return;
    page();
    doc.setFont("helvetica", "bold").setFontSize(9.5).text(label, marginX, y);
    doc.setFont("helvetica", "normal");
    for (const line of doc.splitTextToSize(value, width - 150) as string[]) {
      doc.text(line, marginX + 150, y);
      y += 13;
    }
    y += 2;
  };

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("Purchase order", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text([po.po_no, caseNo, department].filter(Boolean).join("   ·   "), marginX, y);
  y += 14;
  doc.setDrawColor(120).line(marginX, y, marginX + width, y);
  y += 22;

  paragraph(`To: ${vendorName}`, 11, "bold");
  y += 6;

  paragraph("Terms", 11, "bold");
  y += 4;
  field("Order value", po.total_value != null ? pdfMoney(po.total_value) : null);
  field("Delivery date", formatDate(po.delivery_date));
  field("Delivery address", po.delivery_address);
  field("Billing address", po.billing_address);
  field("Payment terms", po.payment_terms);
  field("Delivery terms", po.delivery_terms);
  field("Warranty", po.warranty_months ? `${po.warranty_months} months from acceptance` : null);
  field("Penalty clause", po.penalty_clause);
  field("Special conditions", po.special_conditions);
  y += 8;

  if (lines.length) {
    page(20);
    paragraph("Line items", 11, "bold");
    y += 6;
    doc.setFontSize(9);
    for (const line of lines) {
      page(24);
      doc.setFont("helvetica", "bold");
      doc.text(`${line.line_no}.`, marginX, y);
      const head = `${line.item_name} — ${line.quantity} ${line.unit ?? ""}`.trim();
      for (const l of doc.splitTextToSize(head, width - 22) as string[]) {
        doc.text(l, marginX + 22, y);
        y += 12;
      }
      doc.setFont("helvetica", "normal");
      doc.text(
        `Rate ${pdfMoney(line.unit_rate)}   GST ${line.gst_pct}%   Amount ${pdfMoney(line.line_amount)}`,
        marginX + 22,
        y,
      );
      y += 16;
    }
    page(16);
    doc.setFont("helvetica", "bold").setFontSize(10);
    const total = lines.reduce((sum, l) => sum + Number(l.line_amount ?? 0), 0);
    doc.text(`Total: ${pdfMoney(total)}`, marginX, y);
    y += 20;
  }

  if (signatures.length) {
    page(30);
    paragraph("Signed", 11, "bold");
    y += 10;

    const plateW = 96;
    const plateH = 36;
    for (const sig of signatures) {
      page(plateH + 14);
      // White plate: a drawn signature is black ink on a transparent PNG and
      // would be unreadable printed straight onto the page's own background.
      doc.setFillColor(255, 255, 255).setDrawColor(180);
      doc.rect(marginX, y, plateW, plateH, "FD");
      try {
        doc.addImage(sig.image, "PNG", marginX + 2, y + 2, plateW - 4, plateH - 4);
      } catch {
        // An unreadable or corrupt image should not stop the rest of the
        // document from rendering — the plate is left blank instead.
      }

      const textX = marginX + plateW + 12;
      doc.setFont("helvetica", "normal").setFontSize(9.5);
      doc.text(actionLabel(sig.action_code), textX, y + 12);
      doc.setFont("helvetica", "bold");
      doc.text(sig.signer_name + (sig.signer_role ? ` — ${sig.signer_role.replace(/_/g, " ")}` : ""), textX, y + 24);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(120);
      doc.text(formatDateTime(sig.signed_at), textX, y + 34);
      doc.setTextColor(0);

      y += plateH + 14;
    }
  }

  return doc.output("blob");
}
