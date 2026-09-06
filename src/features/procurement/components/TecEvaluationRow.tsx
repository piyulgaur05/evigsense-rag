import { useEffect, useState } from "react";
import { Check, CircleHelp, Loader2, Save, ShieldCheck, ShieldX, Sparkles, X } from "lucide-react";
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
import { BidDocuments } from "./BidDocuments";
import {
  useRequestTecAiEvaluation,
  useSetBidderQualification,
  useSubmitTecEvaluation,
} from "../hooks/useProcurement";
import { consensusTier, TEC_COMPLIANCE_LABEL } from "../lib/tec";
import { formatMoney } from "../lib/format";
import type {
  BidderWithVendor,
  TecAiEvidence,
  TecAiSuggestion,
  TecConsensusRow,
  TecEvaluation,
} from "../types";

/**
 * One firm, at the technical desk: its papers, what the committee has said
 * about it so far, one member's own reading, and — separately — the chair's
 * final call. Kept as one row rather than three tabs, because a member
 * scoring a bid usually wants the papers open beside the score, not behind a
 * second click.
 */
export function TecEvaluationRow({
  caseId,
  caseNo,
  bidder,
  myEvaluation,
  consensus,
  aiSuggestion,
  documentsReady,
  canEvaluate,
  canDecide,
  canUploadDocs,
  readOnly,
  onAskAbout,
}: {
  caseId: string;
  caseNo: string;
  bidder: BidderWithVendor;
  myEvaluation: TecEvaluation | undefined;
  consensus: TecConsensusRow | undefined;
  aiSuggestion: TecAiSuggestion | undefined;
  /** Whether this bidder's papers are indexed and ready for the assistant to read. */
  documentsReady: { hasDocuments: boolean; allIndexed: boolean };
  /** Holds tec.evaluate or tec.chair — a committee seat, member or chair. */
  canEvaluate: boolean;
  /** Holds tec.chair — the only seat that can make the final call. */
  canDecide: boolean;
  canUploadDocs: boolean;
  readOnly: boolean;
  onAskAbout?: () => void;
}) {
  const submitEvaluation = useSubmitTecEvaluation();
  const setQualification = useSetBidderQualification();
  const requestAi = useRequestTecAiEvaluation();

  const [score, setScore] = useState("");
  const [compliance, setCompliance] = useState<string>("pending");
  const [qualified, setQualified] = useState<string>("undecided");
  const [remarks, setRemarks] = useState("");
  const [note, setNote] = useState(bidder.tec_note ?? "");

  useEffect(() => {
    setScore(myEvaluation?.score?.toString() ?? "");
    setCompliance(myEvaluation?.compliance_status ?? "pending");
    setQualified(
      myEvaluation?.qualified === true
        ? "qualified"
        : myEvaluation?.qualified === false
          ? "not_qualified"
          : "undecided",
    );
    setRemarks(myEvaluation?.remarks ?? "");
  }, [myEvaluation]);

  useEffect(() => {
    setNote(bidder.tec_note ?? "");
  }, [bidder.tec_note]);

  const submitReading = async () => {
    try {
      await submitEvaluation.mutateAsync({
        bidderId: bidder.id,
        score: score.trim() === "" ? null : Number(score),
        complianceStatus: compliance,
        qualified: qualified === "undecided" ? null : qualified === "qualified",
        remarks: remarks.trim() || null,
      });
      toast.success(`Your reading of ${bidder.vendor?.name ?? "this bid"} is on file.`);
    } catch {
      // useSubmitTecEvaluation surfaced the database's message.
    }
  };

  const decide = (value: boolean) => {
    setQualification.mutate({ bidderId: bidder.id, qualified: value, note: note.trim() || null });
  };

  /** Shared by the auto-fill on a fresh ask and the explicit "use this" button. */
  const applySuggestion = (suggestion: Pick<TecAiSuggestion, "score" | "compliance_status" | "qualified">) => {
    setScore(suggestion.score === null || suggestion.score === undefined ? "" : suggestion.score.toString());
    setCompliance(suggestion.compliance_status);
    setQualified(
      suggestion.qualified === true
        ? "qualified"
        : suggestion.qualified === false
          ? "not_qualified"
          : "undecided",
    );
  };

  const askAssistant = async () => {
    try {
      const result = await requestAi.mutateAsync({ caseId, bidderId: bidder.id });
      if ("pending" in result) {
        toast.info(result.message);
      } else {
        toast.success(`The assistant's reading of ${bidder.vendor?.name ?? "this bid"} is ready.`);
        // Fills the score fields the moment they're asked for, but only when
        // nothing has been signed yet -- re-asking after a signed reading is
        // already on file should never silently overwrite it. "Use this as
        // my starting point" below stays available for that case, and for
        // pulling an existing suggestion back in after editing it away.
        if (!myEvaluation) applySuggestion(result.suggestion);
      }
    } catch {
      // useRequestTecAiEvaluation surfaced the error.
    }
  };

  const useAiAsStartingPoint = () => {
    if (!aiSuggestion) return;
    applySuggestion(aiSuggestion);
    toast.info("Filled in from the assistant's suggestion — review it, then sign your own reading.");
  };

  const evidence = (aiSuggestion?.evidence as unknown as TecAiEvidence[] | null) ?? [];
  const findingIcon: Record<string, React.ReactNode> = {
    met: <Check className="h-3 w-3 text-ok" />,
    not_met: <X className="h-3 w-3 text-destructive" />,
    unclear: <CircleHelp className="h-3 w-3 text-muted-foreground" />,
  };

  const tier = consensus ? consensusTier(consensus.qualified_pct) : consensusTier(null);
  const decided = bidder.tec_qualified !== null && bidder.tec_qualified !== undefined;

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <p className="text-[14px] font-medium text-foreground">
            {bidder.vendor?.name ?? "Unnamed firm"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            Bid {formatMoney(bidder.bid_amount)}
            {bidder.msme_category && bidder.msme_category !== "none"
              ? ` · ${bidder.msme_category} enterprise`
              : ""}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
            decided && bidder.tec_qualified ? "bg-ok/10 text-ok" : decided ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          {decided ? (
            bidder.tec_qualified ? (
              <>
                <ShieldCheck className="h-3 w-3" /> qualified
              </>
            ) : (
              <>
                <ShieldX className="h-3 w-3" /> not qualified
              </>
            )
          ) : (
            "chair has not decided"
          )}
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            their papers
          </p>
          <BidDocuments
            caseId={caseId}
            caseNo={caseNo}
            bidderId={bidder.id}
            vendorName={bidder.vendor?.name ?? "this firm"}
            canUpload={canUploadDocs}
            onAsk={onAskAbout}
          />

          <p className="pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            the committee so far
          </p>
          {consensus ? (
            <p className="text-[13px] text-foreground">
              {consensus.member_count} {consensus.member_count === 1 ? "member has" : "members have"}{" "}
              scored this bid, averaging {consensus.avg_score ?? "—"}.{" "}
              <span
                className={cn(
                  tier.tone === "ok" && "text-ok",
                  tier.tone === "destructive" && "text-destructive",
                )}
              >
                {tier.label}
              </span>{" "}
              ({consensus.qualified_pct ?? 0}% called it qualified).
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">No member has scored this bid yet.</p>
          )}

          {canDecide && (
            <div className="rounded-md border border-dashed border-border px-3 py-3">
              <p className="text-[12px] font-medium text-foreground">The chair's final call</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Independent of the members above — this is what decides whether the case can go
                to commercial.
              </p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Why (optional, but useful if this diverges from the committee)."
                className="mt-2 text-[13px]"
                disabled={readOnly}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={bidder.tec_qualified === true ? "default" : "outline"}
                  onClick={() => decide(true)}
                  disabled={readOnly || setQualification.isPending || bidder.tec_qualified === true}
                >
                  {bidder.tec_qualified === true && <Check className="mr-1.5 h-3 w-3" />}
                  Qualify
                </Button>
                <Button
                  size="sm"
                  variant={bidder.tec_qualified === false ? "destructive" : "outline"}
                  onClick={() => decide(false)}
                  disabled={readOnly || setQualification.isPending || bidder.tec_qualified === false}
                >
                  {bidder.tec_qualified === false && <Check className="mr-1.5 h-3 w-3" />}
                  Not qualified
                </Button>
              </div>
            </div>
          )}

          <p className="pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            my reading
          </p>
          {!canEvaluate ? (
            <p className="text-[13px] text-muted-foreground">
              Recording a technical reading needs a seat on the committee.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`tec-score-${bidder.id}`} className="text-[13px]">
                    Score (0–100)
                  </Label>
                  <Input
                    id={`tec-score-${bidder.id}`}
                    type="number"
                    min={0}
                    max={100}
                    value={score}
                    onChange={(event) => setScore(event.target.value)}
                    disabled={readOnly}
                    className="mt-1.5 tabular-nums"
                  />
                </div>
                <div>
                  <Label className="text-[13px]">Compliance</Label>
                  <Select value={compliance} onValueChange={setCompliance} disabled={readOnly}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEC_COMPLIANCE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[13px]">My verdict</Label>
                <Select value={qualified} onValueChange={setQualified} disabled={readOnly}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="undecided">Not decided yet</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="not_qualified">Not qualified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`tec-remarks-${bidder.id}`} className="text-[13px]">
                  Remarks
                </Label>
                <Textarea
                  id={`tec-remarks-${bidder.id}`}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  rows={3}
                  placeholder="What you found and why. This goes on the record, signed."
                  disabled={readOnly}
                  className="mt-1.5 text-[13px]"
                />
              </div>

              {myEvaluation?.submitted_at && (
                <p className="text-[12px] text-muted-foreground">
                  Last recorded {new Date(myEvaluation.submitted_at).toLocaleString()}.
                </p>
              )}

              {!readOnly && (
                <Button size="sm" onClick={() => void submitReading()} disabled={submitEvaluation.isPending}>
                  {submitEvaluation.isPending ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-3.5 w-3.5" />
                  )}
                  Submit my reading
                </Button>
              )}
            </>
          )}
        </div>

        <div className="space-y-3">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            the assistant
          </p>
          {!canEvaluate ? (
            <p className="text-[13px] text-muted-foreground">
              Asking the assistant needs a seat on the committee too.
            </p>
          ) : (
            <div className="rounded-md border border-signal/40 bg-signal/10 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                  <Sparkles className="h-3 w-3" />
                  the assistant's reading
                </p>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-signal/40 px-2 text-[11px] text-signal hover:bg-signal/10"
                    onClick={() => void askAssistant()}
                    disabled={requestAi.isPending || !documentsReady.hasDocuments}
                    title={
                      !documentsReady.hasDocuments
                        ? "No papers filed against this bid yet"
                        : !documentsReady.allIndexed
                          ? "Some papers are still being read — it will say so if it runs anyway"
                          : undefined
                    }
                  >
                    {requestAi.isPending ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3 w-3" />
                    )}
                    {aiSuggestion ? "Ask again" : "Ask the assistant"}
                  </Button>
                )}
              </div>

              {!aiSuggestion ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Reads this firm's own papers against the tender's requirements and proposes a
                  score — filled into "my reading" on the left the moment it is ready, unless you
                  have already signed one of your own.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className="text-[13px] text-foreground">
                    Suggested score <span className="tabular-nums text-signal">{aiSuggestion.score ?? "—"}</span> ·{" "}
                    {TEC_COMPLIANCE_LABEL[aiSuggestion.compliance_status as keyof typeof TEC_COMPLIANCE_LABEL] ?? aiSuggestion.compliance_status}
                    {" · "}
                    {aiSuggestion.qualified === true
                      ? "would qualify"
                      : aiSuggestion.qualified === false
                        ? "would not qualify"
                        : "no verdict"}
                  </p>
                  {aiSuggestion.summary && (
                    <p className="text-[12px] text-muted-foreground">{aiSuggestion.summary}</p>
                  )}
                  {evidence.length > 0 && (
                    <ul className="space-y-1.5">
                      {evidence.map((row, index) => (
                        <li key={index} className="flex items-start gap-1.5 text-[12px]">
                          <span className="mt-0.5 shrink-0">{findingIcon[row.finding]}</span>
                          <span className="text-foreground">
                            {row.requirement}
                            {row.detail && (
                              <span className="block text-muted-foreground">{row.detail}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Generated {new Date(aiSuggestion.generated_at).toLocaleString()} · not a
                    decision, and nothing the case can move on until you sign your own.
                  </p>
                  {!readOnly && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-signal hover:bg-signal/10"
                      onClick={useAiAsStartingPoint}
                    >
                      Use this as my starting point
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
