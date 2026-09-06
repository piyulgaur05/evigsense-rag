import { useEffect, useMemo, useState } from "react";
import { Check, FileDown, Loader2, Lock, Megaphone, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useBidders,
  useCloseBidding,
  useCorrigenda,
  useFloatTender,
  useLinkNoticeDocument,
  usePublishBoqToTender,
  useReplaceInvitees,
  useSaveTender,
  useTender,
  useTenderGaps,
  useTenderInvitees,
  useTenderItems,
} from "../hooks/useProcurement";
import { attachDocumentToCase } from "../api/documents";
import { BidderRoster } from "../components/BidderRoster";
import { CorrigendumList } from "../components/CorrigendumList";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist, RequiredLabel } from "../components/ReadinessChecklist";
import { TenderNotice } from "../components/TenderNotice";
import { VendorPicker } from "../components/VendorPicker";
import { requiredRing, stepOutstanding } from "../lib/formChecks";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import {
  isPortalMode,
  isRestrictedMode,
  TENDER_LIFECYCLE,
  TENDER_MODES,
  TENDER_STATUS_LABEL,
} from "../lib/tender";
import { tenderChecks } from "../lib/tenderChecks";
import { asNotice, noticeToPdf } from "../lib/tenderNotice";
import type { CaseListItem, ProcurementStage, TenderMode, TenderStatus } from "../types";

type Draft = {
  referenceNo: string;
  title: string;
  mode: TenderMode;
  portalReference: string;
  portalUrl: string;
  singleJustification: string;
  scopeSummary: string;
  eligibility: string;
  bidStartAt: string;
  bidEndAt: string;
  prebidMeetingAt: string;
  prebidVenue: string;
  queryDeadlineAt: string;
  technicalOpeningAt: string;
  financialOpeningAt: string;
  deliveryDays: string;
  bidValidityDays: string;
  emdRequired: boolean;
  emdAmount: string;
  emdExemptionNote: string;
  tenderFee: string;
  performanceSecurityPct: string;
  gstPct: string;
  paymentTerms: string;
  warrantyTerms: string;
};

const EMPTY: Draft = {
  referenceNo: "",
  title: "",
  mode: "open",
  portalReference: "",
  portalUrl: "",
  singleJustification: "",
  scopeSummary: "",
  eligibility: "",
  bidStartAt: "",
  bidEndAt: "",
  prebidMeetingAt: "",
  prebidVenue: "",
  queryDeadlineAt: "",
  technicalOpeningAt: "",
  financialOpeningAt: "",
  deliveryDays: "",
  bidValidityDays: "",
  emdRequired: true,
  emdAmount: "",
  emdExemptionNote: "",
  tenderFee: "",
  performanceSecurityPct: "",
  gstPct: "",
  paymentTerms: "",
  warrantyTerms: "",
};

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const num = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * The tender desk.
 *
 * The tender is floated somewhere else — a portal, a noticeboard, the post —
 * and what this screen holds is the organisation's own record of it: what was
 * published, on what terms, who was asked, what came back, and what was amended
 * along the way. There is no bidder-facing door, so nothing here pretends to be
 * a sealed-bid system; the officer records what arrived.
 *
 * The tender goes read-only as soon as the case leaves this desk, because the
 * row-level policies stop matching at that point and a Save button that appears
 * to work while changing nothing is worse than one that is not there.
 */
export function TenderPanel({
  procurementCase,
  stage,
  onAskAbout,
}: {
  procurementCase: CaseListItem;
  stage: ProcurementStage;
  /** Opens the case assistant narrowed to one firm's own submission. */
  onAskAbout?: (bidderId: string, vendorName: string) => void;
}) {
  const { user, can } = useAuth();
  const caseId = procurementCase.id;

  const { data: tender, isLoading } = useTender(caseId);
  const { data: gaps } = useTenderGaps(caseId);
  const { data: items } = useTenderItems(tender?.id);
  const { data: invitees } = useTenderInvitees(tender?.id);
  const { data: bidders } = useBidders(caseId);
  const { data: corrigenda } = useCorrigenda(caseId);

  const saveTender = useSaveTender();
  const replaceInvitees = useReplaceInvitees();
  const publishBoq = usePublishBoqToTender();
  const floatTender = useFloatTender();
  const closeBidding = useCloseBidding();
  const linkNotice = useLinkNoticeDocument();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [filing, setFiling] = useState(false);

  // Only the desk that holds the case may write, and only while it holds it.
  // The same predicate the policies use, so the screen and the database agree
  // about what is possible.
  const atThisDesk =
    stage === "tender" &&
    procurementCase.stage === "tender" &&
    procurementCase.case_status === "open";
  const readOnly = !atThisDesk || !can("tender.create");

  const status = (tender?.status ?? null) as TenderStatus | null;
  const beforeFloat = status === null || status === "draft" || status === "ready";
  const biddingShut = status === "bidding_closed" || status === "evaluation";

  useEffect(() => {
    if (!tender) return;
    setDraft({
      referenceNo: tender.reference_no ?? "",
      title: tender.title ?? "",
      mode: tender.mode as TenderMode,
      portalReference: tender.portal_reference ?? "",
      portalUrl: tender.portal_url ?? "",
      singleJustification: tender.single_justification ?? "",
      scopeSummary: tender.scope_summary ?? "",
      eligibility: tender.eligibility ?? "",
      bidStartAt: toLocalInput(tender.bid_start_at),
      bidEndAt: toLocalInput(tender.bid_end_at),
      prebidMeetingAt: toLocalInput(tender.prebid_meeting_at),
      prebidVenue: tender.prebid_venue ?? "",
      queryDeadlineAt: toLocalInput(tender.query_deadline_at),
      technicalOpeningAt: toLocalInput(tender.technical_opening_at),
      financialOpeningAt: toLocalInput(tender.financial_opening_at),
      deliveryDays: tender.delivery_days?.toString() ?? "",
      bidValidityDays: tender.bid_validity_days?.toString() ?? "",
      emdRequired: tender.emd_required,
      emdAmount: tender.emd_amount?.toString() ?? "",
      emdExemptionNote: tender.emd_exemption_note ?? "",
      tenderFee: tender.tender_fee?.toString() ?? "",
      performanceSecurityPct: tender.performance_security_pct?.toString() ?? "",
      gstPct: tender.gst_pct?.toString() ?? "",
      paymentTerms: tender.payment_terms ?? "",
      warrantyTerms: tender.warranty_terms ?? "",
    });
  }, [tender]);

  useEffect(() => {
    setInviteeIds((invitees ?? []).map((invitee) => invitee.vendor_id));
  }, [invitees]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const received = useMemo(
    () => (bidders ?? []).filter((bidder) => bidder.status === "received"),
    [bidders],
  );

  const checks = tenderChecks({
    mode: draft.mode,
    status,
    referenceNo: draft.referenceNo,
    portalReference: draft.portalReference,
    singleJustification: draft.singleJustification,
    bidEndAt: draft.bidEndAt,
    inviteeCount: inviteeIds.length,
    bidderCount: received.length,
    bidsMissingAmount: received.filter((bidder) => bidder.bid_amount === null).length,
  });

  const publishedTotal = (items ?? []).reduce(
    (sum, item) => sum + Number(item.line_amount ?? 0),
    0,
  );
  const notice = asNotice(tender?.notice_snapshot);

  const save = () => {
    if (!user) return;
    saveTender.mutate(
      {
        caseId,
        userId: user.id,
        patch: {
          reference_no: draft.referenceNo.trim() || null,
          title: draft.title.trim() || null,
          mode: draft.mode,
          portal_reference: draft.portalReference.trim() || null,
          portal_url: draft.portalUrl.trim() || null,
          single_justification: draft.singleJustification.trim() || null,
          scope_summary: draft.scopeSummary.trim() || null,
          eligibility: draft.eligibility.trim() || null,
          bid_start_at: fromLocalInput(draft.bidStartAt),
          bid_end_at: fromLocalInput(draft.bidEndAt),
          prebid_meeting_at: fromLocalInput(draft.prebidMeetingAt),
          prebid_venue: draft.prebidVenue.trim() || null,
          query_deadline_at: fromLocalInput(draft.queryDeadlineAt),
          technical_opening_at: fromLocalInput(draft.technicalOpeningAt),
          financial_opening_at: fromLocalInput(draft.financialOpeningAt),
          delivery_days: num(draft.deliveryDays),
          bid_validity_days: num(draft.bidValidityDays),
          emd_required: draft.emdRequired,
          emd_amount: num(draft.emdAmount) ?? 0,
          emd_exemption_note: draft.emdExemptionNote.trim() || null,
          tender_fee: num(draft.tenderFee) ?? 0,
          performance_security_pct: num(draft.performanceSecurityPct) ?? 0,
          gst_pct: num(draft.gstPct) ?? 0,
          payment_terms: draft.paymentTerms.trim() || null,
          warranty_terms: draft.warrantyTerms.trim() || null,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success("Tender saved.");
          if (beforeFloat) {
            replaceInvitees.mutate({
              tenderId: saved.id,
              vendorIds: inviteeIds,
              userId: user.id,
            });
          }
        },
      },
    );
  };

  /**
   * Files the notice on the case.
   *
   * It goes through `attachDocumentToCase`, the same path an uploaded scan
   * takes: into the bucket, into `documents`, linked to the case, and onto the
   * processing queue. That is what makes a generated notice searchable and
   * answerable by the case assistant rather than a dead attachment.
   */
  const fileNotice = async () => {
    if (!user || !notice || !tender) return;
    setFiling(true);
    try {
      const heading = "Notice inviting tender";
      const blob = noticeToPdf(notice, heading);
      const filename = `${(notice.reference_no ?? procurementCase.case_no).replace(/[^\w.-]+/g, "-")}-notice.pdf`;
      const documentId = await attachDocumentToCase({
        caseId,
        caseNo: procurementCase.case_no,
        stage: "tender",
        docType: heading,
        file: new File([blob], filename, { type: "application/pdf" }),
        userId: user.id,
        isGenerated: true,
      });
      linkNotice.mutate({ table: "procurement_tenders", id: tender.id, documentId });
      toast.success("The notice is on the case.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not file the notice.");
    } finally {
      setFiling(false);
    }
  };

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <ReadinessChecklist
        checks={checks}
        serverGaps={gaps}
        completeMessage="Everything the committee needs is here."
        hint="Pick one to jump to it. Everything else on this page is for the record rather than the gate."
        saveLabel="Save the tender"
      />

      {/* The lifecycle, marked by weight and a word rather than colour alone. */}
      <section
        id="tender-lifecycle"
        className="rounded-lg border border-border bg-card px-5 py-4"
        tabIndex={-1}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {TENDER_LIFECYCLE.map((step, index) => {
            const here = status !== null && step.key.includes(status);
            const passed =
              status !== null &&
              TENDER_LIFECYCLE.findIndex((entry) => entry.key.includes(status)) > index;
            return (
              <span key={step.label} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground/50">→</span>}
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.14em]",
                    here && "font-semibold text-foreground",
                    passed && "text-muted-foreground line-through",
                    !here && !passed && "text-muted-foreground/60",
                  )}
                >
                  {here && <Check className="mr-1 inline h-3 w-3" />}
                  {step.label}
                </span>
              </span>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            {!readOnly && beforeFloat && tender && (
              <Button
                size="sm"
                onClick={() => floatTender.mutate({ caseId })}
                disabled={floatTender.isPending}
              >
                <Megaphone className="mr-2 h-3.5 w-3.5" />
                Float the tender
              </Button>
            )}
            {!readOnly && !beforeFloat && !biddingShut && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => closeBidding.mutate({ caseId })}
                disabled={closeBidding.isPending}
              >
                <Lock className="mr-2 h-3.5 w-3.5" />
                Close bidding
              </Button>
            )}
          </div>
        </div>

        <p className="mt-2 text-[13px] text-muted-foreground">
          {status
            ? TENDER_STATUS_LABEL[status]
            : "Nothing saved yet. Fill in the reference and the deadline, then float it."}
          {tender?.floated_at && ` · floated ${formatDate(tender.floated_at)}`}
        </p>

        {readOnly && (
          <p className="mt-2 flex items-start gap-2 text-[12px] text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {atThisDesk
              ? "Reading only — working the tender needs the purchase officer's desk."
              : "This case has moved on. The tender is part of the record now and cannot be changed."}
          </p>
        )}
      </section>

      <FormSection
        label="step 1"
        title="What is being floated"
        hint="The reference this tender is known by, and how it is going out."
        outstanding={readOnly ? undefined : stepOutstanding(checks, 1)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <RequiredLabel htmlFor="tender-reference" done={draft.referenceNo.trim().length > 0}>
              Tender reference
            </RequiredLabel>
            <Input
              id="tender-reference"
              value={draft.referenceNo}
              onChange={(event) => set("referenceNo", event.target.value)}
              placeholder="NIT/2026/014"
              disabled={readOnly || !beforeFloat}
              className={cn("mt-1.5", requiredRing(draft.referenceNo.trim().length > 0))}
            />
          </div>

          <div>
            <Label htmlFor="tender-mode" className="text-[13px]">
              How it is floated
            </Label>
            <Select
              value={draft.mode}
              onValueChange={(value) => set("mode", value as TenderMode)}
              disabled={readOnly || !beforeFloat}
            >
              <SelectTrigger id="tender-mode" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENDER_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {TENDER_MODES.find((mode) => mode.value === draft.mode)?.hint}
            </p>
          </div>

          {isPortalMode(draft.mode) && (
            <>
              <div>
                <RequiredLabel
                  htmlFor="tender-portal-reference"
                  done={draft.portalReference.trim().length > 0}
                >
                  The portal's own number
                </RequiredLabel>
                <Input
                  id="tender-portal-reference"
                  value={draft.portalReference}
                  onChange={(event) => set("portalReference", event.target.value)}
                  disabled={readOnly}
                  className={cn(
                    "mt-1.5",
                    requiredRing(draft.portalReference.trim().length > 0),
                  )}
                />
              </div>
              <div>
                <Label htmlFor="tender-portal-url" className="text-[13px]">
                  Where it can be seen
                </Label>
                <Input
                  id="tender-portal-url"
                  value={draft.portalUrl}
                  onChange={(event) => set("portalUrl", event.target.value)}
                  disabled={readOnly}
                  className="mt-1.5"
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="tender-title" className="text-[13px]">
              Title on the notice
            </Label>
            <Input
              id="tender-title"
              value={draft.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder={procurementCase.title}
              disabled={readOnly || !beforeFloat}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="tender-scope" className="text-[13px]">
              Scope
            </Label>
            <Textarea
              id="tender-scope"
              value={draft.scopeSummary}
              onChange={(event) => set("scopeSummary", event.target.value)}
              rows={3}
              disabled={readOnly || !beforeFloat}
              className="mt-1.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="tender-eligibility" className="text-[13px]">
              Who may bid
            </Label>
            <Textarea
              id="tender-eligibility"
              value={draft.eligibility}
              onChange={(event) => set("eligibility", event.target.value)}
              rows={2}
              placeholder="Turnover, past work, registrations — whatever a firm has to show."
              disabled={readOnly || !beforeFloat}
              className="mt-1.5"
            />
          </div>

          {isRestrictedMode(draft.mode) && (
            <div className="sm:col-span-2" id="tender-invitees">
              <RequiredLabel done={inviteeIds.length > 0}>Invited to bid</RequiredLabel>
              <p className="mt-1 text-[12px] text-muted-foreground">
                A limited or single-source tender only goes to firms named here.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {inviteeIds.map((vendorId) => {
                  const invitee = invitees?.find((entry) => entry.vendor_id === vendorId);
                  return (
                    <li
                      key={vendorId}
                      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px]"
                    >
                      {invitee?.vendor?.name ?? "Added, not yet saved"}
                      {!readOnly && beforeFloat && (
                        <button
                          type="button"
                          onClick={() =>
                            setInviteeIds((current) =>
                              current.filter((entry) => entry !== vendorId),
                            )
                          }
                          aria-label="Remove this firm from the invitation list"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!readOnly && beforeFloat && (
                <div className="mt-2 max-w-sm">
                  <VendorPicker
                    value={null}
                    exclude={inviteeIds}
                    placeholder="Add a firm to the list"
                    onChange={(vendorId) =>
                      setInviteeIds((current) =>
                        current.includes(vendorId) ? current : [...current, vendorId],
                      )
                    }
                  />
                </div>
              )}
            </div>
          )}

          {draft.mode === "single" && (
            <div className="sm:col-span-2">
              <RequiredLabel
                htmlFor="tender-justification"
                done={draft.singleJustification.trim().length > 0}
              >
                Why one source only
              </RequiredLabel>
              <Textarea
                id="tender-justification"
                value={draft.singleJustification}
                onChange={(event) => set("singleJustification", event.target.value)}
                rows={3}
                disabled={readOnly}
                className={cn(
                  "mt-1.5",
                  requiredRing(draft.singleJustification.trim().length > 0),
                )}
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Going to a single supplier is the exception, and this is the record of why it
                was defensible here.
              </p>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        label="step 2"
        title="Dates"
        hint="When bidding runs, and when the envelopes are opened."
        outstanding={readOnly ? undefined : stepOutstanding(checks, 2)}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="tender-bid-start" className="text-[13px]">
              Bidding opens
            </Label>
            <Input
              id="tender-bid-start"
              type="datetime-local"
              value={draft.bidStartAt}
              onChange={(event) => set("bidStartAt", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <RequiredLabel htmlFor="tender-bid-end" done={draft.bidEndAt.trim().length > 0}>
              Bids close
            </RequiredLabel>
            <Input
              id="tender-bid-end"
              type="datetime-local"
              value={draft.bidEndAt}
              onChange={(event) => set("bidEndAt", event.target.value)}
              disabled={readOnly || !beforeFloat}
              className={cn("mt-1.5", requiredRing(draft.bidEndAt.trim().length > 0))}
            />
            {!beforeFloat && (
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Moving this after the notice has gone out takes a corrigendum.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="tender-query-deadline" className="text-[13px]">
              Queries by
            </Label>
            <Input
              id="tender-query-deadline"
              type="datetime-local"
              value={draft.queryDeadlineAt}
              onChange={(event) => set("queryDeadlineAt", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-prebid" className="text-[13px]">
              Pre-bid meeting
            </Label>
            <Input
              id="tender-prebid"
              type="datetime-local"
              value={draft.prebidMeetingAt}
              onChange={(event) => set("prebidMeetingAt", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-prebid-venue" className="text-[13px]">
              Where
            </Label>
            <Input
              id="tender-prebid-venue"
              value={draft.prebidVenue}
              onChange={(event) => set("prebidVenue", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-technical-opening" className="text-[13px]">
              Technical bids opened
            </Label>
            <Input
              id="tender-technical-opening"
              type="datetime-local"
              value={draft.technicalOpeningAt}
              onChange={(event) => set("technicalOpeningAt", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-financial-opening" className="text-[13px]">
              Price bids opened
            </Label>
            <Input
              id="tender-financial-opening"
              type="datetime-local"
              value={draft.financialOpeningAt}
              onChange={(event) => set("financialOpeningAt", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-delivery-days" className="text-[13px]">
              Delivery within (days)
            </Label>
            <Input
              id="tender-delivery-days"
              type="number"
              value={draft.deliveryDays}
              onChange={(event) => set("deliveryDays", event.target.value)}
              disabled={readOnly}
              className="mt-1.5 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="tender-validity" className="text-[13px]">
              Bids stay valid (days)
            </Label>
            <Input
              id="tender-validity"
              type="number"
              value={draft.bidValidityDays}
              onChange={(event) => set("bidValidityDays", event.target.value)}
              disabled={readOnly}
              className="mt-1.5 tabular-nums"
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              How long a quote holds. Worth stating — it is the first thing asked when an award
              runs late.
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection
        label="step 3"
        title="Money on the table"
        hint="What a bidder has to put up, and what they will be held to."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={draft.emdRequired}
                onChange={(event) => set("emdRequired", event.target.checked)}
                disabled={readOnly}
                className="h-4 w-4 rounded border-border"
              />
              Earnest money is required
            </label>
          </div>

          {draft.emdRequired ? (
            <div>
              <Label htmlFor="tender-emd" className="text-[13px]">
                Earnest money
              </Label>
              <Input
                id="tender-emd"
                type="number"
                value={draft.emdAmount}
                onChange={(event) => set("emdAmount", event.target.value)}
                disabled={readOnly}
                className="mt-1.5 tabular-nums"
              />
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label htmlFor="tender-emd-exemption" className="text-[13px]">
                Why it is not required
              </Label>
              <Input
                id="tender-emd-exemption"
                value={draft.emdExemptionNote}
                onChange={(event) => set("emdExemptionNote", event.target.value)}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label htmlFor="tender-fee" className="text-[13px]">
              Tender fee
            </Label>
            <Input
              id="tender-fee"
              type="number"
              value={draft.tenderFee}
              onChange={(event) => set("tenderFee", event.target.value)}
              disabled={readOnly}
              className="mt-1.5 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="tender-security" className="text-[13px]">
              Performance security %
            </Label>
            <Input
              id="tender-security"
              type="number"
              value={draft.performanceSecurityPct}
              onChange={(event) => set("performanceSecurityPct", event.target.value)}
              disabled={readOnly}
              className="mt-1.5 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="tender-gst" className="text-[13px]">
              Tax %
            </Label>
            <Input
              id="tender-gst"
              type="number"
              value={draft.gstPct}
              onChange={(event) => set("gstPct", event.target.value)}
              disabled={readOnly}
              className="mt-1.5 tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="tender-payment" className="text-[13px]">
              Payment terms
            </Label>
            <Input
              id="tender-payment"
              value={draft.paymentTerms}
              onChange={(event) => set("paymentTerms", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tender-warranty" className="text-[13px]">
              Warranty
            </Label>
            <Input
              id="tender-warranty"
              value={draft.warrantyTerms}
              onChange={(event) => set("warrantyTerms", event.target.value)}
              disabled={readOnly}
              className="mt-1.5"
            />
          </div>
        </div>
      </FormSection>

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saveTender.isPending}>
            {saveTender.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save the tender
          </Button>
        </div>
      )}

      <FormSection
        label="step 4"
        title="The published bill"
        hint={
          beforeFloat
            ? "Taken from the requisition when the tender is floated. Publish it early to see what bidders will price."
            : "What bidders were shown. Changing it now means issuing a corrigendum."
        }
        action={
          !readOnly && beforeFloat && tender ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => publishBoq.mutate(caseId)}
              disabled={publishBoq.isPending}
            >
              Copy from the requisition
            </Button>
          ) : undefined
        }
      >
        {(items ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
            Nothing published yet. A tender described in the scope alone is fine — the bill is
            for purchases that are itemised.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">#</th>
                  <th className="py-2 pr-3 font-normal">Item</th>
                  <th className="py-2 pr-3 text-right font-normal">Quantity</th>
                  <th className="py-2 text-right font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{item.line_no}</td>
                    <td className="py-2 pr-3">
                      {item.item_name}
                      {item.specification && (
                        <span className="block text-[12px] text-muted-foreground">
                          {item.specification}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.quantity} {item.unit ?? ""}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(item.line_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 pr-3 text-right text-muted-foreground">
                    Published value
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatMoney(publishedTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </FormSection>

      {notice && (
        <FormSection
          label="the notice"
          title="What went out"
          hint={`Frozen when the tender was floated${
            tender?.notice_issued_at ? ` on ${formatDateTime(tender.notice_issued_at)}` : ""
          }. Editing the tender above does not change it.`}
          action={
            !readOnly && !tender?.notice_document_id ? (
              <Button size="sm" variant="outline" onClick={fileNotice} disabled={filing}>
                {filing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-3.5 w-3.5" />
                )}
                File it on the case
              </Button>
            ) : tender?.notice_document_id ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                filed
              </span>
            ) : undefined
          }
        >
          <TenderNotice notice={notice} heading="Notice inviting tender" />
        </FormSection>
      )}

      <FormSection
        label="step 5"
        title="Who bid"
        hint="Recorded from whatever the tender was floated on. This is a list, not a ranking — bids become comparable after the committee has been through them."
        outstanding={readOnly ? undefined : stepOutstanding(checks, 5)}
      >
        <BidderRoster
          caseId={caseId}
          caseNo={procurementCase.case_no}
          tenderId={tender?.id ?? null}
          bidders={bidders ?? []}
          locked={readOnly || beforeFloat || biddingShut}
          lockReason={
            beforeFloat
              ? "Nothing has been floated yet, so there is nothing to have bid on."
              : "Bidding is closed. The roster is part of the record now."
          }
          // Papers, unlike the numbers, stay attachable after bidding closes and
          // after the case moves on: a clarification a firm sends during the
          // evaluation has to go on the file, and refusing it would only push
          // the paper somewhere the assistant cannot read.
          canUploadDocs={can("upload_docs")}
          onAskAbout={onAskAbout}
        />
      </FormSection>

      {!beforeFloat && (
        <FormSection
          label="amendments"
          title="Corrigenda"
          hint="Anything that changed after the notice went out."
        >
          <CorrigendumList
            caseId={caseId}
            corrigenda={corrigenda ?? []}
            canAmend={!readOnly}
          />
        </FormSection>
      )}
    </div>
  );
}
