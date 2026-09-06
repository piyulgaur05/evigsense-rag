import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useBidders,
  useBidSubmissions,
  useRequestTecAiEvaluation,
  useSaveTecChecklistItem,
  useTecAiSuggestions,
  useTecChecklist,
  useTecConsensus,
  useTecEvaluations,
  useTecGaps,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { TecEvaluationRow } from "../components/TecEvaluationRow";
import { TEC_CHECKLIST_ITEMS, TEC_CHECKLIST_STATUS_LABEL } from "../lib/tec";
import { tecChecks } from "../lib/tecChecks";
import type { CaseListItem, ProcurementStage, TecChecklistItemKey, TecChecklistStatus } from "../types";

/**
 * The technical evaluation desk.
 *
 * Two roles share this screen and do different things on it. A member's own
 * reading of each bid — score, compliance, a verdict, signed — never touches
 * the case; it is one row in a table the chair then weighs against the other
 * members'. The chair's own final call on each bidder is separate, visible to
 * everyone, and it alone is what the recommend action reads. Neither requires
 * the other to happen first: a chair with an empty room can still act, and a
 * member can score a bid the chair has already decided on, for the record.
 */
export function TecPanel({
  procurementCase,
  stage,
  onAskAbout,
}: {
  procurementCase: CaseListItem;
  stage: ProcurementStage;
  onAskAbout?: (bidderId: string, vendorName: string) => void;
}) {
  const { user, can } = useAuth();
  const caseId = procurementCase.id;

  const { data: bidders, isLoading: loadingBidders } = useBidders(caseId);
  const { data: checklist, isLoading: loadingChecklist } = useTecChecklist(caseId);
  const { data: evaluations } = useTecEvaluations(caseId);
  const { data: consensus } = useTecConsensus(caseId);
  const { data: gaps } = useTecGaps(caseId);
  const { data: aiSuggestions } = useTecAiSuggestions(caseId);
  const { data: submissions } = useBidSubmissions(caseId);
  const saveChecklistItem = useSaveTecChecklistItem();
  const requestAi = useRequestTecAiEvaluation();
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const atThisDesk =
    stage === "tec" && procurementCase.stage === "tec" && procurementCase.case_status === "open";
  const canEvaluate = can("tec.evaluate") || can("tec.chair");
  const canDecide = can("tec.chair");
  const readOnly = !atThisDesk;

  const received = useMemo(
    () => (bidders ?? []).filter((bidder) => bidder.status === "received"),
    [bidders],
  );

  /**
   * One request per bidder, in sequence rather than in parallel — a single
   * remote model behind one endpoint does not benefit from a burst of
   * concurrent calls, and a running total ("2 of 5") is more honest about
   * what is happening than a bar that jumps unpredictably. A bidder with no
   * papers, or papers still being read, is skipped with its own toast rather
   * than failing the whole run.
   */
  const runBulkAi = async () => {
    setBulkProgress({ done: 0, total: received.length });
    let skipped = 0;
    for (let i = 0; i < received.length; i++) {
      const bidder = received[i];
      try {
        const result = await requestAi.mutateAsync({ caseId, bidderId: bidder.id });
        if ("pending" in result) {
          skipped++;
          toast.info(`${bidder.vendor?.name ?? "A bidder"}: ${result.message}`);
        }
      } catch {
        skipped++;
        // useRequestTecAiEvaluation already surfaced the specific error.
      }
      setBulkProgress({ done: i + 1, total: received.length });
    }
    setBulkProgress(null);
    const done = received.length - skipped;
    if (done > 0) {
      toast.success(
        done === received.length
          ? `The assistant read all ${done} bids.`
          : `The assistant read ${done} of ${received.length} bids; the rest need papers filed or finished reading first.`,
      );
    }
  };

  const checks = tecChecks({
    anyoneQualified: received.some((bidder) => bidder.tec_qualified === true),
  });

  const [drafts, setDrafts] = useState<
    Record<TecChecklistItemKey, { status: TecChecklistStatus; remarks: string }>
  >({} as Record<TecChecklistItemKey, { status: TecChecklistStatus; remarks: string }>);

  useEffect(() => {
    const next = {} as Record<TecChecklistItemKey, { status: TecChecklistStatus; remarks: string }>;
    for (const item of checklist ?? []) {
      next[item.item_key as TecChecklistItemKey] = {
        status: item.status as TecChecklistStatus,
        remarks: item.remarks ?? "",
      };
    }
    setDrafts(next);
  }, [checklist]);

  const setStatus = (itemKey: TecChecklistItemKey, status: TecChecklistStatus) => {
    if (!user) return;
    setDrafts((current) => ({ ...current, [itemKey]: { ...current[itemKey], status } }));
    saveChecklistItem.mutate({
      caseId,
      itemKey,
      status,
      remarks: drafts[itemKey]?.remarks?.trim() || null,
      userId: user.id,
    });
  };

  const setRemarks = (itemKey: TecChecklistItemKey, remarks: string) => {
    setDrafts((current) => ({ ...current, [itemKey]: { ...current[itemKey], remarks } }));
  };

  const saveRemarks = (itemKey: TecChecklistItemKey) => {
    if (!user) return;
    saveChecklistItem.mutate({
      caseId,
      itemKey,
      status: drafts[itemKey]?.status ?? "pending",
      remarks: drafts[itemKey]?.remarks?.trim() || null,
      userId: user.id,
    });
  };

  if (loadingBidders || loadingChecklist) {
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
        completeMessage="The case is ready to go to commercial evaluation."
        hint="A member's own reading below is for the record. What moves the case is the chair marking at least one bidder qualified."
        saveLabel="Qualify a bidder"
      />

      <FormSection
        label="before recommending"
        title="The committee's checklist"
        hint="Four questions the whole committee shares — not a gate on its own, but the record of what was actually checked."
      >
        <div className="space-y-4">
          {TEC_CHECKLIST_ITEMS.map((item) => {
            const draft = drafts[item.key] ?? { status: "pending" as TecChecklistStatus, remarks: "" };
            return (
              <div key={item.key} className="rounded-md border border-border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{item.label}</p>
                    <p className="text-[12px] text-muted-foreground">{item.hint}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(Object.keys(TEC_CHECKLIST_STATUS_LABEL) as TecChecklistStatus[]).map(
                      (status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={draft.status === status ? "default" : "outline"}
                          className="h-7 px-2 text-[11px]"
                          disabled={readOnly || !canEvaluate}
                          onClick={() => setStatus(item.key, status)}
                        >
                          {draft.status === status && <Check className="mr-1 h-3 w-3" />}
                          {TEC_CHECKLIST_STATUS_LABEL[status]}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
                {(canEvaluate || draft.remarks) && (
                  <Textarea
                    value={draft.remarks}
                    onChange={(event) => setRemarks(item.key, event.target.value)}
                    onBlur={() => saveRemarks(item.key)}
                    rows={2}
                    placeholder="Notes on this item (optional)."
                    disabled={readOnly || !canEvaluate}
                    className="mt-2 text-[13px]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        label="the bidders"
        title="Evaluate each bid"
        hint="Papers, the committee's readings so far, your own, and the chair's final call — together, so nobody has to piece it together from three screens."
        action={
          !readOnly && canEvaluate && received.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-signal/40 px-2 text-[11px] text-signal hover:bg-signal/10"
              onClick={() => void runBulkAi()}
              disabled={Boolean(bulkProgress)}
            >
              {bulkProgress ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Reading {bulkProgress.done} of {bulkProgress.total}…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3 w-3" />
                  Ask the assistant for every bid
                </>
              )}
            </Button>
          ) : undefined
        }
      >
        {received.length === 0 ? (
          <p
            id="tec-bidders"
            className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground"
          >
            No bids were recorded at the tender desk, so there is nothing here to evaluate.
          </p>
        ) : (
          <div id="tec-bidders" className={cn("space-y-4")}>
            {received.map((bidder) => (
              <TecEvaluationRow
                key={bidder.id}
                caseId={caseId}
                caseNo={procurementCase.case_no}
                bidder={bidder}
                myEvaluation={evaluations?.find((row) => row.member_id === user?.id && row.bidder_id === bidder.id)}
                consensus={consensus?.find((row) => row.bidder_id === bidder.id)}
                aiSuggestion={aiSuggestions?.find((row) => row.bidder_id === bidder.id)}
                documentsReady={(() => {
                  const own = submissions?.find((row) => row.bidder_id === bidder.id);
                  const total = Number(own?.document_count ?? 0);
                  const indexed = Number(own?.indexed_count ?? 0);
                  return { hasDocuments: total > 0, allIndexed: total > 0 && indexed >= total };
                })()}
                canEvaluate={canEvaluate}
                canDecide={canDecide}
                canUploadDocs={can("upload_docs")}
                readOnly={readOnly}
                onAskAbout={
                  onAskAbout
                    ? () => onAskAbout(bidder.id, bidder.vendor?.name ?? "this firm")
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}
