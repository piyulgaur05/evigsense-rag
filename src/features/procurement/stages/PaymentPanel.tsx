import { useEffect, useState } from "react";
import { FileDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import { attachDocumentToCase } from "../api/documents";
import {
  useBidders,
  usePaymentAiDraft,
  usePaymentGaps,
  usePaymentRecommendation,
  usePurchaseOrder,
  useRequestPaymentAiDraft,
  useSavePaymentRecommendation,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { GeneratedDocuments } from "../components/GeneratedDocuments";
import { paymentChecks } from "../lib/paymentChecks";
import { paymentRecommendationToPdf } from "../lib/paymentRecommendationPdf";
import { formatDateTime, formatMoney } from "../lib/format";
import type { CaseListItem, ProcurementStage } from "../types";

/**
 * The payment desk.
 *
 * What goods receipt accepted, weighed against what the vendor actually
 * invoiced. Recording an invoice does not move any money — this stops at
 * what the reference process itself stops at: recommending, then clearing,
 * with the clearance itself closing the case. "Generate the invoice" files
 * that recommendation as a document on the case; the model can draft the
 * recommendation note that goes with it, reviewed before it is used, the
 * same discipline the purchase order's own AI drafting already holds.
 */
export function PaymentPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { user, can } = useAuth();
  const caseId = procurementCase.id;

  const { data: payment, isLoading } = usePaymentRecommendation(caseId);
  const { data: gaps } = usePaymentGaps(caseId);
  const { data: aiDraft } = usePaymentAiDraft(caseId);
  const { data: po } = usePurchaseOrder(caseId);
  const { data: bidders } = useBidders(caseId);

  const saveRecommendation = useSavePaymentRecommendation();
  const requestDraft = useRequestPaymentAiDraft();
  const [generating, setGenerating] = useState(false);

  const atThisDesk =
    stage === "payment_recommendation" &&
    procurementCase.stage === "payment_recommendation" &&
    procurementCase.case_status === "open";
  const canRecord = can("payment.process");
  const isPending = payment?.status === "pending";
  const readOnly = !atThisDesk || !canRecord || !isPending;

  const vendor = bidders?.find((b) => b.id === po?.recommended_bidder_id);

  const [form, setForm] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    invoiceAmount: "",
    penaltyDeductions: "",
    voucherNumber: "",
    voucherDate: "",
    remarks: "",
  });

  useEffect(() => {
    if (!payment) return;
    setForm({
      invoiceNumber: payment.invoice_number ?? "",
      invoiceDate: payment.invoice_date ?? "",
      invoiceAmount: String(payment.invoice_amount ?? 0),
      penaltyDeductions: String(payment.penalty_deductions ?? 0),
      voucherNumber: payment.voucher_number ?? "",
      voucherDate: payment.voucher_date ?? "",
      remarks: payment.remarks ?? "",
    });
  }, [payment]);

  const checks = paymentChecks({
    hasInvoiceNumber: !(gaps ?? []).includes("An invoice number"),
    hasInvoiceDate: !(gaps ?? []).includes("An invoice date"),
    hasInvoiceAmount: !(gaps ?? []).includes("An invoice amount"),
  });

  const useDraftNote = () => {
    if (!aiDraft?.recommendation_note) return;
    setForm((prev) => ({ ...prev, remarks: aiDraft.recommendation_note ?? prev.remarks }));
    toast.success("Pulled into the remarks field below — review it before generating.");
  };

  /**
   * Saves the recommendation, then files it as a generated document on the
   * case — the same ingest path an uploaded scan takes, so it is searchable
   * and answerable by the case assistant. Nothing here moves any money;
   * this only records that a payment was recommended.
   */
  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const saved = await saveRecommendation.mutateAsync({
        caseId,
        invoiceNumber: form.invoiceNumber || null,
        invoiceDate: form.invoiceDate || null,
        invoiceAmount: Number(form.invoiceAmount) || 0,
        penaltyDeductions: Number(form.penaltyDeductions) || 0,
        voucherNumber: form.voucherNumber || null,
        voucherDate: form.voucherDate || null,
        remarks: form.remarks || null,
      });

      const blob = paymentRecommendationToPdf({
        payment: saved,
        caseNo: procurementCase.case_no,
        department: procurementCase.department?.name ?? null,
        vendorName: vendor?.vendor?.name ?? "The vendor",
      });
      const filename = `${procurementCase.case_no}-payment-recommendation.pdf`;
      await attachDocumentToCase({
        caseId,
        caseNo: procurementCase.case_no,
        stage: "payment_recommendation",
        docType: "Payment recommendation",
        file: new File([blob], filename, { type: "application/pdf" }),
        userId: user.id,
        isGenerated: true,
      });
      toast.success("The recommendation is on the case.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the invoice.");
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!payment) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        The payment recommendation has not been seeded yet — refresh once the case has fully arrived.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {isPending ? (
        <ReadinessChecklist
          checks={checks}
          serverGaps={gaps}
          completeMessage="Ready to clear — use the action bar to approve payment and close the case."
          hint="Clearing this recommendation closes the case; nothing here moves any money."
        />
      ) : (
        <div className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          Cleared {payment.cleared_at ? `on ${formatDateTime(payment.cleared_at)}` : ""}.
        </div>
      )}

      <FormSection
        label="what was accepted"
        title="Against goods receipt"
        hint="Snapshotted from goods receipt when the case arrived here — the invoice below is weighed against this, not forced to match it exactly."
      >
        <div className="bg-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Accepted value</p>
          <p className="mt-1.5 text-[13px] text-foreground">{formatMoney(payment.accepted_value)}</p>
        </div>
      </FormSection>

      <FormSection
        label="the invoice"
        title="Recommended payment"
        hint="Recommended amount is the invoice amount less any penalty deduction — computed, not typed."
        action={
          !readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => requestDraft.mutate(caseId)}
              disabled={requestDraft.isPending}
            >
              {requestDraft.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Draft the recommendation
            </Button>
          )
        }
      >
        <div id="payment-details" className="space-y-4">
          {aiDraft?.recommendation_note && (
            <div className="space-y-2 rounded-md border border-signal/30 bg-signal/5 px-3 py-3">
              <p className="text-[12px] text-muted-foreground">
                Drafted by the assistant, grounded only in the figures already on this record. Review before using —
                nothing is written to the recommendation until you press "Use this" and then generate.
              </p>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Recommendation note</p>
                  {!readOnly && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={useDraftNote}>
                      Use this
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-foreground">{aiDraft.recommendation_note}</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-invoice-number" className="text-[13px]">Invoice number</Label>
              <Input
                id="pay-invoice-number"
                value={form.invoiceNumber}
                onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="pay-invoice-date" className="text-[13px]">Invoice date</Label>
              <Input
                id="pay-invoice-date"
                type="date"
                value={form.invoiceDate}
                onChange={(e) => setForm((p) => ({ ...p, invoiceDate: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="pay-invoice-amount" className="text-[13px]">Invoice amount</Label>
              <Input
                id="pay-invoice-amount"
                type="number"
                min={0}
                value={form.invoiceAmount}
                onChange={(e) => setForm((p) => ({ ...p, invoiceAmount: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="pay-penalty" className="text-[13px]">Penalty deduction (optional)</Label>
              <Input
                id="pay-penalty"
                type="number"
                min={0}
                value={form.penaltyDeductions}
                onChange={(e) => setForm((p) => ({ ...p, penaltyDeductions: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Recommended amount</p>
            <p className="mt-1.5 text-[15px] font-medium text-foreground">{formatMoney(payment.recommended_amount)}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pay-voucher-number" className="text-[13px]">Voucher number (optional)</Label>
              <Input
                id="pay-voucher-number"
                value={form.voucherNumber}
                onChange={(e) => setForm((p) => ({ ...p, voucherNumber: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="pay-voucher-date" className="text-[13px]">Voucher date (optional)</Label>
              <Input
                id="pay-voucher-date"
                type="date"
                value={form.voucherDate}
                onChange={(e) => setForm((p) => ({ ...p, voucherDate: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="pay-remarks" className="text-[13px]">Remarks (optional)</Label>
            <Textarea
              id="pay-remarks"
              value={form.remarks}
              onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
              disabled={readOnly}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>

          {!readOnly && (
            <Button size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Generate the invoice
            </Button>
          )}

          <GeneratedDocuments caseId={caseId} docType="Payment recommendation" />
        </div>
      </FormSection>
    </div>
  );
}
