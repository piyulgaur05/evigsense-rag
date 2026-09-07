import { jsPDF } from "jspdf";
import { formatDate, formatMoney } from "./format";
import type { PaymentRecommendation } from "../types";

/** jsPDF's built-in "helvetica" carries no ₹ glyph — see purchaseOrderPdf.ts
 * for the same fix applied there. */
function pdfMoney(value: number | string | null | undefined): string {
  return formatMoney(value).replace("₹", "Rs. ");
}

/**
 * Renders the payment recommendation to a PDF — the invoice recorded
 * against what goods receipt accepted, the computed recommended amount, and
 * the officer's own recommendation note (by hand, or accepted from the
 * model's draft). Rendered client-side with jsPDF, the same reasoning
 * `purchaseOrderToPdf` and `noticeToPdf` already carry.
 */
export function paymentRecommendationToPdf(args: {
  payment: PaymentRecommendation;
  caseNo: string;
  department: string | null;
  vendorName: string;
}): Blob {
  const { payment, caseNo, department, vendorName } = args;
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
  doc.text("Payment recommendation", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text([caseNo, department].filter(Boolean).join("   ·   "), marginX, y);
  y += 14;
  doc.setDrawColor(120).line(marginX, y, marginX + width, y);
  y += 22;

  paragraph(`Vendor: ${vendorName}`, 11, "bold");
  y += 6;

  paragraph("Against goods receipt", 11, "bold");
  y += 4;
  field("Accepted value", pdfMoney(payment.accepted_value));
  y += 8;

  paragraph("Invoice", 11, "bold");
  y += 4;
  field("Invoice number", payment.invoice_number);
  field("Invoice date", formatDate(payment.invoice_date));
  field("Invoice amount", pdfMoney(payment.invoice_amount));
  field("Penalty deduction", payment.penalty_deductions > 0 ? pdfMoney(payment.penalty_deductions) : null);
  y += 4;
  page(20);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`Recommended amount: ${pdfMoney(payment.recommended_amount)}`, marginX, y);
  y += 20;

  if (payment.voucher_number || payment.voucher_date) {
    paragraph("Voucher", 11, "bold");
    y += 4;
    field("Voucher number", payment.voucher_number);
    field("Voucher date", formatDate(payment.voucher_date));
    y += 8;
  }

  if (payment.remarks) {
    paragraph("Recommendation", 11, "bold");
    y += 4;
    paragraph(payment.remarks);
  }

  return doc.output("blob");
}
