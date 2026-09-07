import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/AuthProvider";
import { useBidders, useProposal, useProposalGaps, useSaveProposal } from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { proposalChecks } from "../lib/proposalChecks";
import { formatMoney } from "../lib/format";
import type { CaseListItem, ProcurementStage } from "../types";

/**
 * The purchase proposal desk.
 *
 * The decision packet the approving authority is actually being asked about:
 * the recommended vendor, what the comparative statement evaluated their bid
 * at, what price negotiation actually settled (if it ran at all), the terms,
 * and the purchase officer's own written recommendation. `proposal.approve`
 * on the ordinary action bar reads the recommendation being on file; nothing
 * here moves the case.
 */
export function ProposalPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { can } = useAuth();
  const caseId = procurementCase.id;

  const { data: proposal, isLoading } = useProposal(caseId);
  const { data: gaps } = useProposalGaps(caseId);
  const { data: bidders } = useBidders(caseId);
  const saveProposal = useSaveProposal();

  const atThisDesk =
    stage === "purchase_proposal" &&
    procurementCase.stage === "purchase_proposal" &&
    procurementCase.case_status === "open";
  const canDraft = can("proposal.draft");
  const readOnly = !atThisDesk || !canDraft;

  const vendor = bidders?.find((b) => b.id === proposal?.recommended_bidder_id);

  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(proposal?.recommendation_note ?? "");
  }, [proposal]);

  const checks = proposalChecks({
    hasRecommendation: !(gaps ?? []).includes("A recommendation write-up for the approving authority"),
  });

  const submit = () => {
    if (!note.trim()) {
      toast.error("A recommendation is required before this can be approved.");
      return;
    }
    saveProposal.mutate({ caseId, recommendationNote: note });
  };

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        The proposal has not been seeded yet — refresh once the case has fully arrived.
      </section>
    );
  }

  const original = proposal.original_evaluated_cost;
  const negotiated = proposal.negotiated_price;
  const savings = original != null && negotiated != null ? original - negotiated : null;
  const savingsPct = savings != null && original ? (savings / original) * 100 : null;

  return (
    <div className="space-y-6">
      <ReadinessChecklist
        checks={checks}
        serverGaps={gaps}
        completeMessage="Ready for the approving authority — use the action bar to approve, return, or reject."
        hint="A recommendation is the one thing the approving authority is waiting on here."
      />

      <FormSection
        label="what is being approved"
        title="The recommended vendor and price"
        hint={
          negotiated != null
            ? "Negotiated after the comparative statement — the figure below is what was actually settled, not what the statement first evaluated."
            : "No price negotiation ran on this case — the figure below is what the comparative statement evaluated."
        }
      >
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Vendor</p>
            <p className="mt-1.5 text-[13px] text-foreground">{vendor?.vendor?.name ?? "Not resolved"}</p>
          </div>
          <div className="bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {negotiated != null ? "Original evaluated cost" : "Evaluated cost"}
            </p>
            <p className="mt-1.5 text-[13px] text-foreground">
              {original != null ? formatMoney(original) : "Not recorded"}
            </p>
          </div>
          {negotiated != null && (
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Negotiated price</p>
              <p className="mt-1.5 text-[13px] font-medium text-foreground">{formatMoney(negotiated)}</p>
            </div>
          )}
          {savings != null && (
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {savings >= 0 ? "Savings" : "Increase over the original"}
              </p>
              <p className={`mt-1.5 text-[13px] ${savings >= 0 ? "text-ok" : "text-destructive"}`}>
                {formatMoney(Math.abs(savings))}
                {savingsPct != null ? ` (${Math.abs(savingsPct).toFixed(1)}%)` : ""}
              </p>
            </div>
          )}
        </div>

        {(proposal.delivery_days || proposal.payment_terms || proposal.warranty_months) && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {proposal.delivery_days ? `${proposal.delivery_days} days delivery` : null}
            {proposal.payment_terms ? ` · ${proposal.payment_terms}` : null}
            {proposal.warranty_months ? ` · ${proposal.warranty_months} months warranty` : null}
          </p>
        )}
      </FormSection>

      <FormSection
        label="for the approving authority"
        title="Recommendation"
        hint="The purchase officer's own written case for this vendor and price — what the approving authority actually reads before deciding."
      >
        <div id="proposal-recommendation" className="space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this vendor, at this price — the case for approval."
            disabled={readOnly}
            rows={4}
            className="text-[13px]"
          />
          {!readOnly && (
            <Button size="sm" className="h-8 px-3 text-[12px]" onClick={submit} disabled={saveProposal.isPending}>
              Save the recommendation
            </Button>
          )}
        </div>
      </FormSection>
    </div>
  );
}
