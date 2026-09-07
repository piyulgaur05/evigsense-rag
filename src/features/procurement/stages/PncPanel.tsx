import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useBidders,
  useCloseNegotiationRound,
  useNegotiation,
  useNegotiationGaps,
  useNegotiationRounds,
  useOpenNegotiationRound,
  useSaveNegotiationMandate,
  useUpdateNegotiationRound,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { negotiationChecks } from "../lib/negotiationChecks";
import { formatDateTime, formatMoney } from "../lib/format";
import type { CaseListItem, NegotiationStatus, ProcurementStage } from "../types";

const STATUS_LABEL: Record<NegotiationStatus, string> = {
  open: "Under negotiation",
  agreed: "Agreement reached",
  failed: "Negotiation failed",
  returned: "Returned to the purchase committee",
};

function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Price negotiation.
 *
 * One vendor — the purchase committee's own recommendation, or the computed
 * L1 if it named nobody — one round open at a time. The committee records
 * what the vendor is asking, what it is countering with, and, when a round
 * closes, what was actually settled. Reaching "agreement" (the pnc.agreed
 * action, on the case's ordinary action bar) reads the last closed round with
 * a settled figure; there is nothing further to press here.
 */
export function PncPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { can } = useAuth();
  const caseId = procurementCase.id;

  const { data: negotiationRecord, isLoading } = useNegotiation(caseId);
  const { data: rounds } = useNegotiationRounds(caseId);
  const { data: gaps } = useNegotiationGaps(caseId);
  const { data: bidders } = useBidders(caseId);

  const saveMandate = useSaveNegotiationMandate();
  const openRound = useOpenNegotiationRound();
  const updateRound = useUpdateNegotiationRound();
  const closeRound = useCloseNegotiationRound();

  const atThisDesk =
    stage === "pnc" && procurementCase.stage === "pnc" && procurementCase.case_status === "open";
  const isOpen = negotiationRecord?.status === "open";
  const readOnly = !atThisDesk || !isOpen;
  const canNegotiate = can("pnc.negotiate");

  const vendor = bidders?.find((b) => b.id === negotiationRecord?.bidder_id);

  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [objectiveDraft, setObjectiveDraft] = useState("");

  useEffect(() => {
    if (!negotiationRecord) return;
    setReason(negotiationRecord.mandate_reason ?? "");
    setInstructions(negotiationRecord.mandate_instructions ?? "");
    setObjectives(negotiationRecord.objectives ?? []);
  }, [negotiationRecord]);

  const addObjective = () => {
    const value = objectiveDraft.trim();
    if (!value) return;
    setObjectives((prev) => [...prev, value]);
    setObjectiveDraft("");
  };

  const submitMandate = () => {
    if (!reason.trim()) {
      toast.error("A reason is needed for the negotiation mandate.");
      return;
    }
    saveMandate.mutate({ caseId, reason, instructions: instructions || null, objectives });
  };

  const openRounds = (rounds ?? []).filter((r) => r.status === "open");
  const closedRounds = (rounds ?? []).filter((r) => r.status === "closed");
  const liveRound = openRounds[0];

  const checks = negotiationChecks({
    mandateRecorded: !(gaps ?? []).includes("The negotiation mandate (why the committee is negotiating)"),
    hasObjective: !(gaps ?? []).includes("At least one negotiation objective"),
    noOpenRound: !(gaps ?? []).includes("The open round to be closed"),
    hasAgreedRound: !(gaps ?? []).includes("A round recording the terms both sides agreed to"),
  });

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!negotiationRecord) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        The negotiation record has not been seeded yet — refresh once the case has fully arrived.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {negotiationRecord.status === "open" ? (
        <ReadinessChecklist
          checks={checks}
          serverGaps={gaps}
          completeMessage="Ready to conclude — use “Conclude — agreement reached” on the action bar."
          hint="At least one round has to close with a settled figure before the case can move on."
        />
      ) : (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-[13px]",
            negotiationRecord.status === "agreed" ? "border-ok/40 bg-ok/10 text-ok" : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {STATUS_LABEL[negotiationRecord.status as NegotiationStatus]}
          {negotiationRecord.status === "agreed" && negotiationRecord.final_price != null && (
            <>
              {" "}— settled at {formatMoney(negotiationRecord.final_price)}
              {negotiationRecord.concluded_at ? ` on ${formatDateTime(negotiationRecord.concluded_at)}` : ""}.
            </>
          )}
        </div>
      )}

      <FormSection
        label="who, and against what"
        title="The vendor under negotiation"
        hint="Set by the purchase committee's own recommendation — or the computed L1 if it named nobody — the moment the case arrived here."
      >
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendor</p>
            <p className="mt-1.5 text-[13px] text-foreground">{vendor?.vendor?.name ?? "Not resolved"}</p>
          </div>
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Opening offer</p>
            <p className="mt-1.5 text-[13px] text-foreground">
              {negotiationRecord.opening_offer != null ? formatMoney(negotiationRecord.opening_offer) : "Not recorded"}
            </p>
          </div>
        </div>
      </FormSection>

      <FormSection
        label="the committee's mandate"
        title="Why, and toward what"
        hint="Needed before a round can be opened — the committee's own stated reason for negotiating, and at least one objective it is negotiating for."
      >
        <div id="pnc-mandate" className="space-y-3">
          <div>
            <Label htmlFor="pnc-reason" className="text-[13px]">Reason for negotiating</Label>
            <Textarea
              id="pnc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={readOnly || !canNegotiate}
              rows={2}
              className="mt-1.5 text-[13px]"
              placeholder="Why the purchase committee referred this case for negotiation."
            />
          </div>
          <div>
            <Label htmlFor="pnc-instructions" className="text-[13px]">Instructions to the committee (optional)</Label>
            <Textarea
              id="pnc-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={readOnly || !canNegotiate}
              rows={2}
              className="mt-1.5 text-[13px]"
            />
          </div>
          <div>
            <Label className="text-[13px]">Objectives</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {objectives.map((obj, i) => (
                <span
                  key={`${obj}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-foreground"
                >
                  {obj}
                  {!readOnly && canNegotiate && (
                    <button
                      type="button"
                      onClick={() => setObjectives((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${obj}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {objectives.length === 0 && (
                <span className="text-[12px] text-muted-foreground">None added yet.</span>
              )}
            </div>
            {!readOnly && canNegotiate && (
              <div className="mt-2 flex gap-2">
                <Input
                  value={objectiveDraft}
                  onChange={(e) => setObjectiveDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addObjective();
                    }
                  }}
                  placeholder="e.g. Bring the price within the approved estimate"
                  className="h-8 text-[13px]"
                />
                <Button size="sm" variant="outline" className="h-8 shrink-0 px-3 text-[12px]" onClick={addObjective}>
                  Add
                </Button>
              </div>
            )}
          </div>
          {!readOnly && canNegotiate && (
            <Button size="sm" className="h-8 px-3 text-[12px]" onClick={submitMandate} disabled={saveMandate.isPending}>
              Save the mandate
            </Button>
          )}
        </div>
      </FormSection>

      <FormSection
        label="negotiation rounds"
        title="Rounds"
        hint="One open round at a time. A committee's counter can never exceed the vendor's own current offer; settling above it needs a stated reason."
      >
        <div id="pnc-rounds" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
            <span className="text-[13px] font-medium text-foreground">
              Negotiating with {vendor?.vendor?.name ?? "the recommended bidder"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              opened at {negotiationRecord.opening_offer != null ? formatMoney(negotiationRecord.opening_offer) : "an unrecorded figure"}
            </span>
          </div>

          {closedRounds.map((round) => (
            <div key={round.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-foreground">
                  Round {round.round_no} — closed
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {vendor?.vendor?.name ?? "the recommended bidder"}
                  </span>
                </p>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {formatDateTime(round.closed_at ?? round.updated_at)}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-3">
                <span>Vendor offer: {formatMoney(round.vendor_offer)}</span>
                <span>Counter: {round.committee_counter_offer != null ? formatMoney(round.committee_counter_offer) : "—"}</span>
                <span className="text-foreground">Settled: {round.final_offer != null ? formatMoney(round.final_offer) : "—"}</span>
              </div>
              {(round.delivery_days || round.payment_terms || round.warranty_months) && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {round.delivery_days ? `${round.delivery_days} days delivery` : null}
                  {round.payment_terms ? ` · ${round.payment_terms}` : null}
                  {round.warranty_months ? ` · ${round.warranty_months} months warranty` : null}
                </p>
              )}
              {round.override_reason && (
                <p className="mt-1 text-[12px] text-destructive">Settled above the vendor's offer: {round.override_reason}</p>
              )}
              {round.notes && <p className="mt-2 text-[13px] text-foreground">{round.notes}</p>}
            </div>
          ))}

          {liveRound ? (
            <OpenRoundCard
              round={liveRound}
              readOnly={readOnly || !canNegotiate}
              onUpdate={(args) => updateRound.mutate({ roundId: liveRound.id, ...args })}
              onClose={(args) => closeRound.mutate({ roundId: liveRound.id, ...args })}
            />
          ) : (
            !readOnly &&
            canNegotiate && (
              <OpenRoundForm
                // The default below is only read once, at mount, by the
                // uncontrolled form state inside — this key forces a remount
                // once the rounds query actually resolves, so a page load
                // that paints before the fetch completes doesn't strand the
                // field on a guess made before the real data arrived.
                key={`round-${rounds?.length ?? "loading"}`}
                disabled={!reason.trim() || objectives.length === 0}
                defaultVendorOffer={
                  closedRounds.length > 0
                    ? closedRounds[closedRounds.length - 1].vendor_offer
                    : negotiationRecord.opening_offer
                }
                onOpen={(args) => openRound.mutate({ caseId, ...args })}
              />
            )
          )}
        </div>
      </FormSection>
    </div>
  );
}

function OpenRoundForm({
  disabled,
  defaultVendorOffer,
  onOpen,
}: {
  disabled: boolean;
  /** The last round's vendor offer, or the negotiation's opening offer for
   * the first round — a starting figure to edit down, not a guess. */
  defaultVendorOffer: number | null;
  onOpen: (args: {
    vendorOffer: number;
    committeeCounterOffer: number | null;
    deliveryDays: number | null;
    paymentTerms: string | null;
    warrantyMonths: number | null;
    notes: string | null;
  }) => void;
}) {
  const [vendorOffer, setVendorOffer] = useState(
    defaultVendorOffer != null ? String(defaultVendorOffer) : "",
  );
  const [counter, setCounter] = useState("");
  const [delivery, setDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [warranty, setWarranty] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    const offer = numOrNull(vendorOffer);
    if (offer === null) {
      toast.error("A vendor offer is needed to open a round.");
      return;
    }
    onOpen({
      vendorOffer: offer,
      committeeCounterOffer: numOrNull(counter),
      deliveryDays: numOrNull(delivery),
      paymentTerms: terms || null,
      warrantyMonths: numOrNull(warranty),
      notes: notes || null,
    });
    setVendorOffer("");
    setCounter("");
    setDelivery("");
    setTerms("");
    setWarranty("");
    setNotes("");
  };

  return (
    <div className="rounded-md border border-dashed border-border px-4 py-3">
      <p className="text-[13px] font-medium text-foreground">Open a round</p>
      {disabled && (
        <p className="mt-1 text-[12px] text-muted-foreground">Save the mandate above first.</p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Vendor's offer" value={vendorOffer} onChange={(e) => setVendorOffer(e.target.value)} className="h-8 text-[13px]" disabled={disabled} />
        <Input placeholder="Committee's counter (optional)" value={counter} onChange={(e) => setCounter(e.target.value)} className="h-8 text-[13px]" disabled={disabled} />
        <Input placeholder="Delivery, days (optional)" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="h-8 text-[13px]" disabled={disabled} />
        <Input placeholder="Payment terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} className="h-8 text-[13px] sm:col-span-2" disabled={disabled} />
        <Input placeholder="Warranty, months (optional)" value={warranty} onChange={(e) => setWarranty(e.target.value)} className="h-8 text-[13px]" disabled={disabled} />
      </div>
      <Textarea placeholder="Notes from the discussion (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 text-[13px]" rows={2} disabled={disabled} />
      <Button size="sm" className="mt-2 h-8 px-3 text-[12px]" onClick={submit} disabled={disabled}>
        Open round
      </Button>
    </div>
  );
}

function OpenRoundCard({
  round,
  readOnly,
  onUpdate,
  onClose,
}: {
  round: { id: string; round_no: number; vendor_offer: number; committee_counter_offer: number | null; delivery_days: number | null; payment_terms: string | null; warranty_months: number | null; notes: string | null };
  readOnly: boolean;
  onUpdate: (args: { vendorOffer: number; committeeCounterOffer: number | null; deliveryDays: number | null; paymentTerms: string | null; warrantyMonths: number | null; notes: string | null }) => void;
  onClose: (args: { finalOffer: number; overrideReason: string | null; deliveryDays: number | null; paymentTerms: string | null; warrantyMonths: number | null; notes: string | null }) => void;
}) {
  const [vendorOffer, setVendorOffer] = useState(String(round.vendor_offer));
  const [counter, setCounter] = useState(round.committee_counter_offer != null ? String(round.committee_counter_offer) : "");
  const [delivery, setDelivery] = useState(round.delivery_days != null ? String(round.delivery_days) : "");
  const [terms, setTerms] = useState(round.payment_terms ?? "");
  const [warranty, setWarranty] = useState(round.warranty_months != null ? String(round.warranty_months) : "");
  const [notes, setNotes] = useState(round.notes ?? "");
  const [finalOffer, setFinalOffer] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const finalNum = numOrNull(finalOffer);
  const needsOverride = finalNum !== null && finalNum > round.vendor_offer;

  const save = () => {
    const offer = numOrNull(vendorOffer);
    if (offer === null) {
      toast.error("A vendor offer is needed.");
      return;
    }
    onUpdate({
      vendorOffer: offer,
      committeeCounterOffer: numOrNull(counter),
      deliveryDays: numOrNull(delivery),
      paymentTerms: terms || null,
      warrantyMonths: numOrNull(warranty),
      notes: notes || null,
    });
  };

  const close = () => {
    if (finalNum === null) {
      toast.error("A final figure is needed to close this round.");
      return;
    }
    if (needsOverride && !overrideReason.trim()) {
      toast.error("Settling above the vendor's own offer needs a stated reason.");
      return;
    }
    onClose({
      finalOffer: finalNum,
      overrideReason: needsOverride ? overrideReason : null,
      deliveryDays: numOrNull(delivery),
      paymentTerms: terms || null,
      warrantyMonths: numOrNull(warranty),
      notes: notes || null,
    });
  };

  return (
    <div className="rounded-md border border-border bg-accent/30 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-foreground">Round {round.round_no} — open</p>
        {!readOnly && (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <Check className="h-3 w-3" /> editable
          </span>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Input placeholder="Vendor's offer" value={vendorOffer} onChange={(e) => setVendorOffer(e.target.value)} className="h-8 text-[13px]" disabled={readOnly} />
        <Input placeholder="Committee's counter" value={counter} onChange={(e) => setCounter(e.target.value)} className="h-8 text-[13px]" disabled={readOnly} />
        <Input placeholder="Delivery, days" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="h-8 text-[13px]" disabled={readOnly} />
        <Input placeholder="Payment terms" value={terms} onChange={(e) => setTerms(e.target.value)} className="h-8 text-[13px] sm:col-span-2" disabled={readOnly} />
        <Input placeholder="Warranty, months" value={warranty} onChange={(e) => setWarranty(e.target.value)} className="h-8 text-[13px]" disabled={readOnly} />
      </div>
      <Textarea placeholder="Notes from the discussion" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 text-[13px]" rows={2} disabled={readOnly} />
      {!readOnly && (
        <Button size="sm" variant="outline" className="mt-2 h-7 px-2 text-[11px]" onClick={save}>
          Save round
        </Button>
      )}

      {!readOnly && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[13px] font-medium text-foreground">Close this round</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              placeholder="Settled figure"
              value={finalOffer}
              onChange={(e) => setFinalOffer(e.target.value)}
              className="h-8 w-[160px] text-[13px]"
            />
            <Button size="sm" className="h-8 px-3 text-[12px]" onClick={close}>
              Close round
            </Button>
          </div>
          {needsOverride && (
            <Textarea
              placeholder="Why this settles above the vendor's own offer — required."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="mt-2 text-[13px]"
              rows={2}
            />
          )}
        </div>
      )}
    </div>
  );
}
