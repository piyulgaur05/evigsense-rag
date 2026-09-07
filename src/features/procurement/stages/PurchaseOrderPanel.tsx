import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { attachDocumentToCase } from "../api/documents";
import {
  useAmendPurchaseOrder,
  useBidders,
  useCaseSignaturesNamed,
  usePoAiDraft,
  usePoAmendments,
  usePoGaps,
  usePoLines,
  usePurchaseOrder,
  useRecordVendorAck,
  useRequestPoAiDraft,
  useSavePurchaseOrder,
  useStageActions,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { GeneratedDocuments } from "../components/GeneratedDocuments";
import { poChecks } from "../lib/poChecks";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import { purchaseOrderToPdf } from "../lib/purchaseOrderPdf";
import type { CaseListItem, ProcurementStage, VendorAckStatus } from "../types";

const VENDOR_ACK_LABEL: Record<VendorAckStatus, string> = {
  pending: "Awaiting the vendor's response",
  acknowledged: "Acknowledged by the vendor",
  accepted: "Accepted by the vendor",
  rejected: "Rejected by the vendor",
};

/**
 * The purchase order desk.
 *
 * The order carries in everything the proposal already settled — the
 * vendor, the negotiated value, the terms — so what happens here is filling
 * in the delivery and payment detail, drafting the clause text (by hand, or
 * with the product's own model as a starting point), issuing, then whatever
 * happens after: the vendor's recorded response, and any amendment an
 * issued order needs.
 */
export function PurchaseOrderPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { user, can } = useAuth();
  const caseId = procurementCase.id;

  const { data: po, isLoading } = usePurchaseOrder(caseId);
  const { data: lines } = usePoLines(caseId);
  const { data: gaps } = usePoGaps(caseId);
  const { data: aiDraft } = usePoAiDraft(caseId);
  const { data: amendments } = usePoAmendments(caseId);
  const { data: bidders } = useBidders(caseId);
  const { data: caseSignatures } = useCaseSignaturesNamed(caseId);
  const { data: stageActions } = useStageActions();

  const savePo = useSavePurchaseOrder();
  const requestDraft = useRequestPoAiDraft();
  const recordAck = useRecordVendorAck();
  const amendPo = useAmendPurchaseOrder();
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const actionLabel = useMemo(() => {
    const labels = new Map<string, string>();
    for (const action of stageActions ?? []) labels.set(action.code, action.label);
    return (code: string) => labels.get(code) ?? code;
  }, [stageActions]);

  const atThisDesk =
    stage === "purchase_order" &&
    procurementCase.stage === "purchase_order" &&
    procurementCase.case_status === "open";
  const canEdit = can("po.issue");
  const isDraft = po?.status === "draft";
  const readOnly = !atThisDesk || !canEdit || !isDraft;

  const vendor = bidders?.find((b) => b.id === po?.recommended_bidder_id);

  const [form, setForm] = useState({
    deliveryDate: "",
    deliveryAddress: "",
    billingAddress: "",
    paymentTerms: "",
    deliveryTerms: "",
    specialConditions: "",
    warrantyMonths: "",
    penaltyClause: "",
  });

  useEffect(() => {
    if (!po) return;
    setForm({
      deliveryDate: po.delivery_date ?? "",
      deliveryAddress: po.delivery_address ?? "",
      billingAddress: po.billing_address ?? "",
      paymentTerms: po.payment_terms ?? "",
      deliveryTerms: po.delivery_terms ?? "",
      specialConditions: po.special_conditions ?? "",
      warrantyMonths: po.warranty_months != null ? String(po.warranty_months) : "",
      penaltyClause: po.penalty_clause ?? "",
    });
  }, [po]);

  const checks = poChecks({
    hasDeliveryDate: !(gaps ?? []).includes("A delivery date"),
    hasDeliveryAddress: !(gaps ?? []).includes("A delivery address"),
    hasPaymentTerms: !(gaps ?? []).includes("Payment terms"),
    hasLines: !(gaps ?? []).includes("At least one order line"),
  });

  const submit = () => {
    savePo.mutate({
      caseId,
      deliveryDate: form.deliveryDate || null,
      deliveryAddress: form.deliveryAddress || null,
      billingAddress: form.billingAddress || null,
      paymentTerms: form.paymentTerms || null,
      deliveryTerms: form.deliveryTerms || null,
      specialConditions: form.specialConditions || null,
      warrantyMonths: form.warrantyMonths ? Number(form.warrantyMonths) : null,
      penaltyClause: form.penaltyClause || null,
    });
  };

  const useDraftField = (field: "paymentTerms" | "deliveryTerms" | "specialConditions", value: string | null | undefined) => {
    if (!value) return;
    setForm((prev) => ({ ...prev, [field]: value }));
    toast.success("Pulled into the field below — review it before saving.");
  };

  const [ackNote, setAckNote] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [amendDate, setAmendDate] = useState("");
  const [amendTerms, setAmendTerms] = useState("");

  /**
   * Files the signed order on the case.
   *
   * Every signature on the case's own trail goes on it, not just po.issue's —
   * finance clearing the budget, the committee, negotiation, the approving
   * authority are what actually got the order here, and a document that
   * showed only the last mark would misstate that. Goes through the same
   * ingest path an uploaded scan takes, so it is searchable and answerable by
   * the case assistant like any other paper on the file.
   */
  const generatePdf = async () => {
    if (!po || !user) return;
    setGeneratingPdf(true);
    try {
      const blob = purchaseOrderToPdf({
        po,
        caseNo: procurementCase.case_no,
        department: procurementCase.department?.name ?? null,
        vendorName: vendor?.vendor?.name ?? "The vendor",
        lines: lines ?? [],
        signatures: caseSignatures ?? [],
        actionLabel,
      });
      const filename = `${po.po_no.replace(/[^\w.-]+/g, "-")}.pdf`;
      await attachDocumentToCase({
        caseId,
        caseNo: procurementCase.case_no,
        stage: "purchase_order",
        docType: "Purchase order",
        file: new File([blob], filename, { type: "application/pdf" }),
        userId: user.id,
        isGenerated: true,
      });
      toast.success("The signed order is on the case.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the order.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!po) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        The order has not been seeded yet — refresh once the case has fully arrived.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {po.status === "draft" ? (
        <ReadinessChecklist
          checks={checks}
          serverGaps={gaps}
          completeMessage="Ready to issue — use the action bar to release the order."
          hint="Delivery, address and payment terms are what the vendor is actually reading before the order can go out."
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          <span>
            Issued {po.issued_at ? `on ${formatDateTime(po.issued_at)}` : ""} — {po.po_no}.
            {po.version > 1 ? ` Version ${po.version}.` : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-ok/40 px-2 text-[11px] text-ok hover:text-ok"
            onClick={generatePdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
            Generate the signed order
          </Button>
        </div>
      )}

      {po.status === "issued" && <GeneratedDocuments caseId={caseId} docType="Purchase order" />}

      <FormSection
        label="what is being ordered"
        title={po.po_no}
        hint="Carried in from the approved proposal — the vendor and value are not editable here."
      >
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendor</p>
            <p className="mt-1.5 text-[13px] text-foreground">{vendor?.vendor?.name ?? "Not resolved"}</p>
          </div>
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Order value</p>
            <p className="mt-1.5 text-[13px] text-foreground">
              {po.total_value != null ? formatMoney(po.total_value) : "Not recorded"}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendor's response</p>
            <p className="mt-1.5 text-[13px] text-foreground">{VENDOR_ACK_LABEL[po.vendor_ack_status as VendorAckStatus]}</p>
          </div>
        </div>

        {(lines ?? []).length > 0 && (
          <div id="po-lines" className="mt-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-1.5">#</th>
                  <th className="pb-1.5">Item</th>
                  <th className="pb-1.5 text-right">Qty</th>
                  <th className="pb-1.5 text-right">Rate</th>
                  <th className="pb-1.5 text-right">GST%</th>
                  <th className="pb-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(lines ?? []).map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="py-1.5 text-muted-foreground">{line.line_no}</td>
                    <td className="py-1.5 text-foreground">{line.item_name}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{line.quantity} {line.unit}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatMoney(line.unit_rate)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{line.gst_pct}%</td>
                    <td className="py-1.5 text-right text-foreground">{formatMoney(line.line_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      <FormSection
        label="delivery, payment and terms"
        title="Order details"
        hint="What the vendor needs to know before dispatch, and what governs payment and warranty."
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
              Draft the clauses
            </Button>
          )
        }
      >
        <div id="po-details" className="space-y-4">
          {aiDraft && (
            <div className="space-y-2 rounded-md border border-signal/30 bg-signal/5 px-3 py-3">
              <p className="text-[12px] text-muted-foreground">
                Drafted by the assistant, grounded only in what is already on this order. Review before using —
                nothing here is written to the order until you press one of the buttons below.
              </p>
              {aiDraft.payment_terms_draft && (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Payment terms</p>
                    {!readOnly && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => useDraftField("paymentTerms", aiDraft.payment_terms_draft)}>
                        Use this
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-foreground">{aiDraft.payment_terms_draft}</p>
                </div>
              )}
              {aiDraft.delivery_terms_draft && (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Delivery terms</p>
                    {!readOnly && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => useDraftField("deliveryTerms", aiDraft.delivery_terms_draft)}>
                        Use this
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-foreground">{aiDraft.delivery_terms_draft}</p>
                </div>
              )}
              {aiDraft.warranty_clause_draft && (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Warranty clause</p>
                  <p className="mt-1 text-[12px] text-foreground">{aiDraft.warranty_clause_draft}</p>
                </div>
              )}
              {aiDraft.special_conditions_draft && (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Special conditions</p>
                    {!readOnly && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => useDraftField("specialConditions", aiDraft.special_conditions_draft)}>
                        Use this
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-foreground">{aiDraft.special_conditions_draft}</p>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="po-delivery-date" className="text-[13px]">Delivery date</Label>
              <Input
                id="po-delivery-date"
                type="date"
                value={form.deliveryDate}
                onChange={(e) => setForm((p) => ({ ...p, deliveryDate: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="po-warranty" className="text-[13px]">Warranty, months</Label>
              <Input
                id="po-warranty"
                type="number"
                min={0}
                value={form.warrantyMonths}
                onChange={(e) => setForm((p) => ({ ...p, warrantyMonths: e.target.value }))}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="po-delivery-address" className="text-[13px]">Delivery address</Label>
              <Textarea
                id="po-delivery-address"
                value={form.deliveryAddress}
                onChange={(e) => setForm((p) => ({ ...p, deliveryAddress: e.target.value }))}
                disabled={readOnly}
                rows={2}
                className="mt-1.5 text-[13px]"
              />
            </div>
            <div>
              <Label htmlFor="po-billing-address" className="text-[13px]">Billing address (optional)</Label>
              <Textarea
                id="po-billing-address"
                value={form.billingAddress}
                onChange={(e) => setForm((p) => ({ ...p, billingAddress: e.target.value }))}
                disabled={readOnly}
                rows={2}
                className="mt-1.5 text-[13px]"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="po-payment-terms" className="text-[13px]">Payment terms</Label>
            <Textarea
              id="po-payment-terms"
              value={form.paymentTerms}
              onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))}
              disabled={readOnly}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>
          <div>
            <Label htmlFor="po-delivery-terms" className="text-[13px]">Delivery terms</Label>
            <Textarea
              id="po-delivery-terms"
              value={form.deliveryTerms}
              onChange={(e) => setForm((p) => ({ ...p, deliveryTerms: e.target.value }))}
              disabled={readOnly}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>
          <div>
            <Label htmlFor="po-special-conditions" className="text-[13px]">Special conditions (optional)</Label>
            <Textarea
              id="po-special-conditions"
              value={form.specialConditions}
              onChange={(e) => setForm((p) => ({ ...p, specialConditions: e.target.value }))}
              disabled={readOnly}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>
          <div>
            <Label htmlFor="po-penalty-clause" className="text-[13px]">Penalty clause (optional)</Label>
            <Textarea
              id="po-penalty-clause"
              value={form.penaltyClause}
              onChange={(e) => setForm((p) => ({ ...p, penaltyClause: e.target.value }))}
              disabled={readOnly}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>

          {!readOnly && (
            <Button size="sm" className="h-8 px-3 text-[12px]" onClick={submit} disabled={savePo.isPending}>
              Save the order
            </Button>
          )}
        </div>
      </FormSection>

      {po.status === "issued" && canEdit && atThisDesk && (
        <FormSection
          label="after issue"
          title="The vendor's response"
          hint="Recorded on the vendor's behalf — there is no vendor-facing door for them to record it themselves."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select
              onValueChange={(value) =>
                recordAck.mutate({ caseId, status: value as "acknowledged" | "accepted" | "rejected", note: ackNote || null })
              }
            >
              <SelectTrigger className="h-8 w-[220px] text-[13px]">
                <SelectValue placeholder="Record the vendor's response" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="acknowledged" className="text-[12px]">Acknowledged</SelectItem>
                <SelectItem value="accepted" className="text-[12px]">Accepted</SelectItem>
                <SelectItem value="rejected" className="text-[12px]">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Note (optional)"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              className="h-8 w-[240px] text-[13px]"
            />
          </div>
          {po.vendor_ack_recorded_at && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Last recorded {formatDateTime(po.vendor_ack_recorded_at)}
              {po.vendor_ack_note ? ` — ${po.vendor_ack_note}` : ""}.
            </p>
          )}
        </FormSection>
      )}

      {po.status === "issued" && canEdit && atThisDesk && (
        <FormSection
          label="if something changes"
          title="Amend the order"
          hint="Price, date or terms after issue — logged with a reason, the same as a tender corrigendum."
        >
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="date"
                value={amendDate}
                onChange={(e) => setAmendDate(e.target.value)}
                className="h-8 text-[13px]"
              />
              <Input
                placeholder="Revised delivery terms (optional)"
                value={amendTerms}
                onChange={(e) => setAmendTerms(e.target.value)}
                className="h-8 text-[13px]"
              />
            </div>
            <Textarea
              placeholder="Reason for the amendment — required."
              value={amendReason}
              onChange={(e) => setAmendReason(e.target.value)}
              rows={2}
              className="text-[13px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-[12px]"
              onClick={() => {
                if (!amendReason.trim()) {
                  toast.error("A reason is needed to amend the order.");
                  return;
                }
                amendPo.mutate(
                  {
                    caseId,
                    reason: amendReason,
                    deliveryDate: amendDate || null,
                    deliveryTerms: amendTerms || null,
                    specialConditions: null,
                    totalValue: null,
                  },
                  {
                    onSuccess: () => {
                      setAmendReason("");
                      setAmendDate("");
                      setAmendTerms("");
                    },
                  },
                );
              }}
            >
              Record the amendment
            </Button>
          </div>

          {(amendments ?? []).length > 0 && (
            <div className="mt-3 space-y-1.5">
              {(amendments ?? []).map((a) => (
                <div key={a.id} className={cn("rounded-md border border-border px-3 py-2 text-[12px]")}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Version {a.version}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {formatDate(a.amended_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{a.reason}</p>
                </div>
              ))}
            </div>
          )}
        </FormSection>
      )}
    </div>
  );
}
