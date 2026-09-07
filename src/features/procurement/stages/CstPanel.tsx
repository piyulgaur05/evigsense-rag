import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  useApproveCstAuthority,
  useBidders,
  useCommercialApprovals,
  useCommercialRanking,
  useCommercialRecommendation,
  useCstGaps,
  useCstScrutiny,
  useCstVersions,
  useLiveCstVersion,
  useRecordRecommendation,
  useSaveCstScrutiny,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { cstChecks } from "../lib/cstChecks";
import { CST_SCRUTINY_ITEMS, JUSTIFICATION_REASON_LABEL } from "../lib/commercial";
import { formatDateTime, formatMoney } from "../lib/format";
import type {
  CaseListItem,
  CstScrutinyItemKey,
  CstScrutinyStatus,
  JustificationReason,
  ProcurementStage,
  RecommendationOutcome,
} from "../types";

const OUTCOME_LABEL: Record<RecommendationOutcome, string> = {
  award: "Award to a bidder",
  send_back: "Send back",
  clarification: "Seek a clarification",
  reject_all: "Reject all bids",
  retender: "Recommend re-tender",
};

/**
 * The comparative statement desk.
 *
 * The statement compiles itself the moment the case arrives; what happens
 * here is the recommendation, the scrutiny record, and — once the head of
 * division has signed off — the lock the hand-off to the purchase committee
 * triggers automatically. Nothing here edits a locked version: it is frozen,
 * and correcting it means reopening, which starts a new one.
 */
export function CstPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { can } = useAuth();
  const caseId = procurementCase.id;

  const { data: bidders } = useBidders(caseId);
  const { data: ranking } = useCommercialRanking(caseId);
  const { data: liveVersion, isLoading: loadingVersion } = useLiveCstVersion(caseId);
  const { data: versions } = useCstVersions(caseId);
  const { data: scrutiny } = useCstScrutiny(caseId, liveVersion?.version);
  const { data: recommendation } = useCommercialRecommendation(caseId);
  const { data: approvals } = useCommercialApprovals(caseId);
  const { data: gaps } = useCstGaps(caseId);

  const saveScrutiny = useSaveCstScrutiny();
  const recordRecommendation = useRecordRecommendation();
  const approveAuthority = useApproveCstAuthority();

  const atThisDesk =
    stage === "cst" && procurementCase.stage === "cst" && procurementCase.case_status === "open";
  const isDraft = liveVersion?.status === "draft";
  const readOnly = !atThisDesk || !isDraft;
  const canRecommend = can("commercial.evaluate");
  const canApproveAuthority = can("commercial.opening.approve");

  const [outcome, setOutcome] = useState<RecommendationOutcome>("award");
  const [bidderId, setBidderId] = useState<string>("");
  const [reason, setReason] = useState<JustificationReason | "">("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!recommendation) return;
    setOutcome(recommendation.outcome as RecommendationOutcome);
    setBidderId(recommendation.recommended_bidder_id ?? "");
    setReason((recommendation.justification_reason as JustificationReason) ?? "");
    setRemarks(recommendation.remarks ?? "");
  }, [recommendation]);

  const isOverride =
    outcome === "award" && bidderId && bidderId !== recommendation?.computed_l1_bidder_id
      ? true
      : outcome === "award" &&
        bidderId &&
        !recommendation &&
        bidderId !== ranking?.find((r) => r.is_l1)?.bidder_id;

  const checks = cstChecks({
    statementGenerated: !(gaps ?? []).includes("The comparative statement to be generated"),
    purchaseOfficerApproved: !(gaps ?? []).includes("The purchase officer's approval of the statement"),
    financeApproved: !(gaps ?? []).includes("The finance officer's approval of the statement"),
    hasRecommendation: !(gaps ?? []).includes("A recommended outcome for the statement"),
    overrideJustified: !(gaps ?? []).includes("A justification for recommending other than L1"),
    authorityCleared: !(gaps ?? []).some((gap) => gap.startsWith("The competent authority")),
    signedOff: !(gaps ?? []).some((gap) => gap.startsWith("The head of division")),
  });

  const submitRecommendation = () => {
    if (!remarks.trim()) {
      toast.error("Remarks are required for a recommendation.");
      return;
    }
    if (isOverride && reason && remarks.trim().length < 10) {
      toast.error("At least ten characters are needed to justify departing from L1.");
      return;
    }
    recordRecommendation.mutate(
      {
        caseId,
        outcome,
        bidderId: outcome === "award" ? bidderId || null : null,
        justificationReason: reason || null,
        // One box, not two: remarks already says what was decided and why,
        // and asking for the same explanation a second time in a separate
        // "justification" field only got the same sentence typed twice.
        justificationText: isOverride ? remarks : null,
        remarks,
      },
      {
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  if (loadingVersion) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const authorityApproval = approvals?.find((a) => a.kind === "authority" && a.status === "approved");
  const statementApproval = approvals?.find((a) => a.kind === "statement" && a.status === "approved");
  const poApproval = approvals?.find((a) => a.kind === "purchase_officer" && a.status === "approved");
  const financeApproval = approvals?.find((a) => a.kind === "finance" && a.status === "approved");
  const statementGenerated = !(gaps ?? []).includes("The comparative statement to be generated");

  const ApprovalRow = ({
    label,
    approval,
    pendingHint,
  }: {
    label: string;
    approval: { decided_at: string } | undefined;
    pendingHint: string;
  }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <span className="text-[13px] text-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
          approval ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground",
        )}
      >
        {approval ? (
          <>
            <Check className="h-3 w-3" /> approved {formatDateTime(approval.decided_at)}
          </>
        ) : (
          pendingHint
        )}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <ReadinessChecklist
        checks={checks}
        serverGaps={gaps}
        completeMessage="The statement is ready to place before the purchase committee."
        hint="Locking happens automatically the moment the case is handed to the committee — there is no separate lock button."
      />

      {liveVersion?.status === "locked" && (
        <div className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          Version {liveVersion.version} is locked. What the committee sees is fixed as of{" "}
          {formatDateTime(liveVersion.locked_at)}.
        </div>
      )}

      <FormSection
        label="before the recommendation"
        title="Generate, then approve"
        hint="The commercial team's own recommendation cannot be recorded until the statement is generated and both the purchase officer and finance have approved it — both actions appear on their own action bars once it is generated."
      >
        <div id="cst-approvals" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <span className="text-[13px] text-foreground">Statement generated</span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                statementGenerated ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground",
              )}
            >
              {statementGenerated ? (
                <>
                  <Check className="h-3 w-3" /> generated
                </>
              ) : (
                "not yet generated"
              )}
            </span>
          </div>
          <ApprovalRow
            label="Purchase officer's approval"
            approval={poApproval}
            pendingHint={statementGenerated ? "waiting" : "not yet generated"}
          />
          <ApprovalRow
            label="Finance's approval"
            approval={financeApproval}
            pendingHint={statementGenerated ? "waiting" : "not yet generated"}
          />
        </div>
      </FormSection>

      <FormSection
        label="the scrutiny checklist"
        title="Before signing off"
        hint="For the record, not the gate — the sign-off is the head of division's own judgement."
      >
        <div className="space-y-3">
          {CST_SCRUTINY_ITEMS.map((item) => {
            const row = scrutiny?.find((s) => s.item_key === item.key);
            return (
              <div key={item.key} className="rounded-md border border-border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{item.label}</p>
                    <p className="text-[12px] text-muted-foreground">{item.hint}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(["pending", "pass", "fail", "clarify"] as CstScrutinyStatus[]).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={row?.status === status ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        disabled={readOnly || !canRecommend}
                        onClick={() =>
                          saveScrutiny.mutate({
                            caseId,
                            itemKey: item.key as CstScrutinyItemKey,
                            status,
                            remarks: row?.remarks ?? null,
                          })
                        }
                      >
                        {row?.status === status && <Check className="mr-1 h-3 w-3" />}
                        {status}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        label="the recommendation"
        title="Accept a bidder"
        hint="Choose the firm to award, or a different outcome if the case isn't going to award at all. Accepting anyone other than L1 needs a category and a real reason — the database refuses anything shorter."
      >
        <div id="cst-recommendation" className="space-y-3">
          <Select value={outcome} onValueChange={(v) => setOutcome(v as RecommendationOutcome)} disabled={readOnly || !canRecommend}>
            <SelectTrigger className="h-8 w-[240px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(OUTCOME_LABEL) as RecommendationOutcome[]).map((value) => (
                <SelectItem key={value} value={value} className="text-[12px]">
                  {OUTCOME_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {outcome === "award" && (
            <Select value={bidderId} onValueChange={setBidderId} disabled={readOnly || !canRecommend}>
              <SelectTrigger className="h-8 w-[280px] text-[13px]">
                <SelectValue placeholder="Which firm" />
              </SelectTrigger>
              <SelectContent>
                {(ranking ?? [])
                  .filter((r) => r.eligible)
                  .map((r) => (
                    <SelectItem key={r.bidder_id} value={r.bidder_id} className="text-[12px]">
                      {r.vendor_name} — {formatMoney(r.evaluated_cost)}
                      {r.is_l1 ? " (L1)" : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {isOverride && (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
              <p className="text-[12px] text-destructive">
                This departs from L1. Pick a category below, and say why in the remarks — at least
                ten characters — and a competent authority's clearance will be needed before this
                can go to the committee.
              </p>
              <Select value={reason} onValueChange={(v) => setReason(v as JustificationReason)} disabled={readOnly}>
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(JUSTIFICATION_REASON_LABEL) as JustificationReason[]).map((value) => (
                    <SelectItem key={value} value={value} className="text-[12px]">
                      {JUSTIFICATION_REASON_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={
              isOverride
                ? "Why this bidder, in place of L1 — at least ten characters."
                : "Remarks — required for any recommendation."
            }
            disabled={readOnly || !canRecommend}
            rows={2}
            className="text-[13px]"
          />

          {(() => {
            const finalises = outcome === "award" || outcome === "reject_all" || outcome === "retender";
            const blocked = finalises && (!statementGenerated || !poApproval || !financeApproval);
            if (!readOnly && canRecommend && blocked) {
              return (
                <p className="text-[12px] text-muted-foreground">
                  {!statementGenerated
                    ? "Generate the comparative statement before recording this recommendation."
                    : !poApproval && !financeApproval
                      ? "Waiting on the purchase officer's and finance's approval before this can be recorded."
                      : !poApproval
                        ? "Waiting on the purchase officer's approval before this can be recorded."
                        : "Waiting on finance's approval before this can be recorded."}
                </p>
              );
            }
            return null;
          })()}

          {!readOnly && canRecommend && (
            <Button
              size="sm"
              className="h-8 px-3 text-[12px]"
              onClick={submitRecommendation}
              disabled={
                (outcome === "award" || outcome === "reject_all" || outcome === "retender") &&
                (!statementGenerated || !poApproval || !financeApproval)
              }
            >
              {outcome === "award" ? "Accept this bidder" : "Record this decision"}
            </Button>
          )}

          {recommendation?.authority_required && (
            <div
              className={cn(
                "rounded-md border px-3 py-3 text-[12px]",
                authorityApproval ? "border-ok/40 bg-ok/10 text-ok" : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              {authorityApproval
                ? `Cleared by the competent authority on ${formatDateTime(authorityApproval.decided_at)}.`
                : "Needs the competent authority's clearance before this can reach the committee."}
              {!readOnly && canApproveAuthority && !authorityApproval && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                      approveAuthority.mutate({ caseId, remarks: "Excess accepted by the competent authority." })
                    }
                  >
                    Clear this recommendation
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </FormSection>

      {statementApproval && (
        <div id="cst-signoff" className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          Signed off by the head of division on {formatDateTime(statementApproval.decided_at)}.
        </div>
      )}

      {(versions ?? []).length > 1 && (
        <FormSection label="history" title="Earlier versions" hint="A reopened statement supersedes its version rather than editing it.">
          <div className="space-y-2">
            {(versions ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[12px]">
                <span>Version {v.version}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </FormSection>
      )}
    </div>
  );
}
