import { Fragment, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { procurementKeys, useDeleteBidder, useSaveBidder } from "../hooks/useProcurement";
import { attachDocumentToCase } from "../api/documents";
import { formatDate, formatMoney } from "../lib/format";
import { EMD_STATUS_LABEL, MSME_LABEL } from "../lib/tender";
import { BidDocuments } from "./BidDocuments";
import { VendorPicker } from "./VendorPicker";
import type { BidderWithVendor, EmdStatus, MsmeCategory } from "../types";

type Draft = {
  vendorId: string;
  bidReference: string;
  submittedAt: string;
  bidAmount: string;
  gstPct: string;
  emdStatus: EmdStatus;
  emdAmount: string;
  emdInstrument: string;
  deliveryDays: string;
  warrantyMonths: string;
  paymentTerms: string;
  remarks: string;
};

const EMPTY: Draft = {
  vendorId: "",
  bidReference: "",
  submittedAt: "",
  bidAmount: "",
  gstPct: "",
  emdStatus: "not_received",
  emdAmount: "",
  emdInstrument: "",
  deliveryDays: "",
  warrantyMonths: "",
  paymentTerms: "",
  remarks: "",
};

const num = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * Who bid, and for how much.
 *
 * Recorded by the purchase officer rather than submitted by the bidder: the
 * tender is floated on a portal or by hand, and what comes back is entered
 * here. The portal makes no sealed-bid promise, because it has no bidder-facing
 * door through which it could keep one.
 *
 * The roster is a list, not a ranking. Nothing here sorts by amount or marks a
 * lowest bidder — bids are only comparable once the committee has said which
 * ones qualify and the comparative statement has brought them to the same
 * terms, and both of those are later work.
 */
export function BidderRoster({
  caseId,
  caseNo,
  tenderId,
  bidders,
  locked,
  lockReason,
  canUploadDocs,
  onAskAbout,
}: {
  caseId: string;
  caseNo: string;
  tenderId: string | null;
  bidders: BidderWithVendor[];
  locked: boolean;
  lockReason: string;
  /**
   * Papers can be filed against a bid after bidding closes — the evaluation
   * routinely receives a clarification the officer has to put on the file —
   * so this is separate from `locked`, which only governs the numbers.
   */
  canUploadDocs: boolean;
  onAskAbout?: (bidderId: string, vendorName: string) => void;
}) {
  const { user } = useAuth();
  const saveBidder = useSaveBidder();
  const deleteBidder = useDeleteBidder();

  const [editing, setEditing] = useState<BidderWithVendor | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * Files chosen while recording a *new* bid. There is no bidder row to attach
   * them to yet, so they wait here and go up the moment the insert returns an
   * id -- the firm's papers and its numbers arrive together, which is how they
   * arrive in real life.
   */
  const [staged, setStaged] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const openFor = (bidder: BidderWithVendor | null) => {
    setEditing(bidder);
    setDraft(
      bidder
        ? {
            vendorId: bidder.vendor_id,
            bidReference: bidder.bid_reference ?? "",
            submittedAt: bidder.submitted_at?.slice(0, 10) ?? "",
            bidAmount: bidder.bid_amount?.toString() ?? "",
            gstPct: bidder.gst_pct?.toString() ?? "",
            emdStatus: bidder.emd_status as EmdStatus,
            emdAmount: bidder.emd_amount?.toString() ?? "",
            emdInstrument: bidder.emd_instrument ?? "",
            deliveryDays: bidder.delivery_days?.toString() ?? "",
            warrantyMonths: bidder.warranty_months?.toString() ?? "",
            paymentTerms: bidder.payment_terms ?? "",
            remarks: bidder.remarks ?? "",
          }
        : EMPTY,
    );
    setStaged([]);
    setOpen(true);
  };

  const submit = async () => {
    if (!user || !tenderId || !draft.vendorId) return;
    setSaving(true);
    try {
      const bidderId = await saveBidder.mutateAsync({
        id: editing?.id,
        userId: user.id,
        patch: {
          tender_id: tenderId,
          case_id: caseId,
          vendor_id: draft.vendorId,
          bid_reference: draft.bidReference.trim() || null,
          submitted_at: draft.submittedAt ? new Date(draft.submittedAt).toISOString() : null,
          bid_amount: num(draft.bidAmount),
          gst_pct: num(draft.gstPct),
          emd_status: draft.emdStatus,
          emd_amount: num(draft.emdAmount) ?? 0,
          emd_instrument: draft.emdInstrument.trim() || null,
          delivery_days: num(draft.deliveryDays),
          warranty_months: num(draft.warrantyMonths),
          payment_terms: draft.paymentTerms.trim() || null,
          remarks: draft.remarks.trim() || null,
        },
      });

      for (const file of staged) {
        await attachDocumentToCase({
          caseId,
          caseNo,
          stage: "tender",
          docType: "Bid / vendor response",
          file,
          userId: user.id,
          bidderId,
        });
      }
      if (staged.length) {
        void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
        toast.success(
          staged.length === 1
            ? "Bid recorded, and their paper filed against it."
            : `Bid recorded, and ${staged.length} papers filed against it.`,
        );
      }
      setStaged([]);
      setOpen(false);
      // Open the new bid so its papers are visibly on it, rather than filed
      // somewhere the officer then has to go looking for.
      if (!editing) setExpanded(bidderId);
    } catch {
      // useSaveBidder surfaced the database's message; anything the upload threw
      // was reported by attachDocumentToCase.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="tender-bidders" className="space-y-4">
      {locked && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {lockReason}
        </p>
      )}

      {bidders.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No bids recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Firm</th>
                <th className="py-2 pr-3 font-normal">Reference</th>
                <th className="py-2 pr-3 text-right font-normal">Quoted</th>
                <th className="py-2 pr-3 text-right font-normal">With tax</th>
                <th className="py-2 pr-3 font-normal">Earnest money</th>
                <th className="py-2 pr-3 font-normal">Submitted</th>
                <th className="py-2 pr-3 font-normal">Papers</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {bidders.map((bidder) => (
                <Fragment key={bidder.id}>
                <tr className="border-b border-border/60 align-top">
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) => (current === bidder.id ? null : bidder.id))
                      }
                      className="flex items-start gap-1.5 text-left hover:underline"
                    >
                      {expanded === bidder.id ? (
                        <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>{bidder.vendor?.name ?? "Unknown firm"}</span>
                    </button>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {[
                        bidder.vendor?.msme_category
                          ? MSME_LABEL[bidder.vendor.msme_category as MsmeCategory]
                          : null,
                        bidder.status !== "received" ? bidder.status : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-muted-foreground">
                    {bidder.bid_reference ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pr-3 text-right tabular-nums",
                      bidder.bid_amount === null && "text-destructive",
                    )}
                  >
                    {bidder.bid_amount === null ? "no amount" : formatMoney(bidder.bid_amount)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {bidder.bid_amount === null ? "—" : formatMoney(bidder.bid_amount_gross)}
                  </td>
                  <td className="py-2.5 pr-3">
                    {EMD_STATUS_LABEL[bidder.emd_status as EmdStatus]}
                    {bidder.emd_amount > 0 && (
                      <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                        {formatMoney(bidder.emd_amount)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {formatDate(bidder.submitted_at)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) => (current === bidder.id ? null : bidder.id))
                      }
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {expanded === bidder.id ? "hide" : "open"}
                    </button>
                  </td>
                  <td className="py-2.5">
                    {!locked && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openFor(bidder)}
                          aria-label={`Edit the bid from ${bidder.vendor?.name ?? "this firm"}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteBidder.mutate(bidder.id)}
                          aria-label={`Remove the bid from ${bidder.vendor?.name ?? "this firm"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {expanded === bidder.id && (
                  <tr className="border-b border-border/60">
                    <td colSpan={8} className="bg-muted/30 px-3 py-3">
                      <BidDocuments
                        caseId={caseId}
                        caseNo={caseNo}
                        bidderId={bidder.id}
                        vendorName={bidder.vendor?.name ?? "this firm"}
                        canUpload={canUploadDocs}
                        onAsk={
                          onAskAbout
                            ? () => onAskAbout(bidder.id, bidder.vendor?.name ?? "this firm")
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locked && tenderId && (
        <Button variant="outline" size="sm" onClick={() => openFor(null)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Record a bid
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit the bid" : "Record a bid"}</DialogTitle>
            <DialogDescription>
              What the firm quoted and on what terms. The amount is what they asked for before
              tax; the figure with tax is worked out from it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-[13px]">Firm</Label>
              <div className="mt-1.5">
                <VendorPicker
                  value={draft.vendorId || null}
                  onChange={(vendorId) => set("vendorId", vendorId)}
                  exclude={bidders
                    .filter((bidder) => bidder.id !== editing?.id)
                    .map((bidder) => bidder.vendor_id)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bid-reference" className="text-[13px]">
                  Their bid reference
                </Label>
                <Input
                  id="bid-reference"
                  value={draft.bidReference}
                  onChange={(event) => set("bidReference", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="bid-submitted" className="text-[13px]">
                  Submitted on
                </Label>
                <Input
                  id="bid-submitted"
                  type="date"
                  value={draft.submittedAt}
                  onChange={(event) => set("submittedAt", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="bid-amount" className="text-[13px]">
                  Amount quoted
                </Label>
                <Input
                  id="bid-amount"
                  type="number"
                  inputMode="decimal"
                  value={draft.bidAmount}
                  onChange={(event) => set("bidAmount", event.target.value)}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="bid-gst" className="text-[13px]">
                  Tax %
                </Label>
                <Input
                  id="bid-gst"
                  type="number"
                  inputMode="decimal"
                  value={draft.gstPct}
                  onChange={(event) => set("gstPct", event.target.value)}
                  className="mt-1.5 tabular-nums"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="bid-emd-status" className="text-[13px]">
                  Earnest money
                </Label>
                <Select
                  value={draft.emdStatus}
                  onValueChange={(value) => set("emdStatus", value as EmdStatus)}
                >
                  <SelectTrigger id="bid-emd-status" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMD_STATUS_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bid-emd-amount" className="text-[13px]">
                  Amount held
                </Label>
                <Input
                  id="bid-emd-amount"
                  type="number"
                  inputMode="decimal"
                  value={draft.emdAmount}
                  onChange={(event) => set("emdAmount", event.target.value)}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="bid-emd-instrument" className="text-[13px]">
                  Instrument
                </Label>
                <Input
                  id="bid-emd-instrument"
                  value={draft.emdInstrument}
                  onChange={(event) => set("emdInstrument", event.target.value)}
                  placeholder="DD, guarantee, transfer"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="bid-delivery" className="text-[13px]">
                  Delivery in days
                </Label>
                <Input
                  id="bid-delivery"
                  type="number"
                  value={draft.deliveryDays}
                  onChange={(event) => set("deliveryDays", event.target.value)}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="bid-warranty" className="text-[13px]">
                  Warranty in months
                </Label>
                <Input
                  id="bid-warranty"
                  type="number"
                  value={draft.warrantyMonths}
                  onChange={(event) => set("warrantyMonths", event.target.value)}
                  className="mt-1.5 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="bid-payment" className="text-[13px]">
                  Payment terms
                </Label>
                <Input
                  id="bid-payment"
                  value={draft.paymentTerms}
                  onChange={(event) => set("paymentTerms", event.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="rounded-md border border-border px-3 py-3">
              <Label className="text-[13px]">Their papers</Label>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Certificates, registrations, the technical offer -- whatever came in with the
                bid. They are read and indexed like any other paper on the case, so the
                evaluation can later ask about this firm alone.
              </p>

              <div className="mt-2">
                {editing ? (
                  // The row exists, so attaching is immediate and the live list
                  // is the truth.
                  <BidDocuments
                    caseId={caseId}
                    caseNo={caseNo}
                    bidderId={editing.id}
                    vendorName={editing.vendor?.name ?? "this firm"}
                    canUpload={canUploadDocs}
                  />
                ) : (
                  <>
                    {staged.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {staged.map((file, index) => (
                          <li
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-2 text-[12px]"
                          >
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setStaged((current) => current.filter((_, i) => i !== index))
                              }
                              aria-label={`Remove ${file.name}`}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input
                      ref={stageRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        setStaged((current) => [
                          ...current,
                          ...Array.from(event.target.files ?? []),
                        ]);
                        if (stageRef.current) stageRef.current.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[12px]"
                      onClick={() => stageRef.current?.click()}
                      disabled={!canUploadDocs}
                    >
                      <Paperclip className="mr-1.5 h-3 w-3" />
                      Choose files
                    </Button>
                    {staged.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Filed against the firm once you record the bid.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="bid-remarks" className="text-[13px]">
                Remarks
              </Label>
              <Textarea
                id="bid-remarks"
                value={draft.remarks}
                onChange={(event) => set("remarks", event.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!draft.vendorId || saving}>
              {editing ? "Save the bid" : "Record it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
