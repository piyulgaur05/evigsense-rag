import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as cases from "../api/cases";
import * as documents from "../api/documents";
import * as assistant from "../api/assistant";
import * as insights from "../api/insights";
import * as requisition from "../api/requisition";
import * as masterData from "../api/masterData";
import * as signatures from "../api/signatures";
import * as tec from "../api/tec";
import * as tender from "../api/tender";
import * as vendors from "../api/vendors";
import * as commercial from "../api/commercial";
import * as cst from "../api/cst";
import * as negotiation from "../api/negotiation";
import * as proposal from "../api/proposal";
import * as purchaseOrder from "../api/purchaseOrder";
import * as goodsReceipt from "../api/goodsReceipt";
import * as payment from "../api/payment";
import { fetchLookups } from "../api/lookups";
import type { CaseFilters, ProcurementStage } from "../types";

/** Query keys in one place so invalidation after a decision stays honest. */
export const procurementKeys = {
  all: ["procurement"] as const,
  stageConfig: () => [...procurementKeys.all, "stage-config"] as const,
  lookups: (kind?: string) => [...procurementKeys.all, "lookups", kind ?? "all"] as const,
  cases: (filters: CaseFilters) => [...procurementKeys.all, "cases", filters] as const,
  case: (caseNo: string) => [...procurementKeys.all, "case", caseNo] as const,
  events: (caseId: string) => [...procurementKeys.all, "events", caseId] as const,
  history: (caseId: string) => [...procurementKeys.all, "history", caseId] as const,
  clarifications: (caseId: string) => [...procurementKeys.all, "clarifications", caseId] as const,
  actions: (caseId: string) => [...procurementKeys.all, "actions", caseId] as const,
  worklist: () => [...procurementKeys.all, "worklist"] as const,
  documents: (caseId: string) => [...procurementKeys.all, "documents", caseId] as const,
  stageCounts: () => [...procurementKeys.all, "stage-counts"] as const,
  requisition: (caseId: string) => [...procurementKeys.all, "requisition", caseId] as const,
  boq: (caseId: string) => [...procurementKeys.all, "boq", caseId] as const,
  gaps: (caseId: string) => [...procurementKeys.all, "gaps", caseId] as const,
  budgetLedger: () => [...procurementKeys.all, "budget-ledger"] as const,
  activity: (caseId: string) => [...procurementKeys.all, "activity", caseId] as const,
  insights: (name: string) => [...procurementKeys.all, "insights", name] as const,
  readiness: (caseId: string) => [...procurementKeys.all, "readiness", caseId] as const,
  allLookups: () => [...procurementKeys.all, "all-lookups"] as const,
  budgetHeads: () => [...procurementKeys.all, "budget-heads"] as const,
  mySignature: () => [...procurementKeys.all, "my-signature"] as const,
  caseSignatures: (caseId: string) =>
    [...procurementKeys.all, "case-signatures", caseId] as const,
  tender: (caseId: string) => [...procurementKeys.all, "tender", caseId] as const,
  tenderSummary: (caseId: string) => [...procurementKeys.all, "tender-summary", caseId] as const,
  tenderGaps: (caseId: string) => [...procurementKeys.all, "tender-gaps", caseId] as const,
  tenderItems: (tenderId: string) => [...procurementKeys.all, "tender-items", tenderId] as const,
  tenderInvitees: (tenderId: string) =>
    [...procurementKeys.all, "tender-invitees", tenderId] as const,
  bidders: (caseId: string) => [...procurementKeys.all, "bidders", caseId] as const,
  corrigenda: (caseId: string) => [...procurementKeys.all, "corrigenda", caseId] as const,
  bidSubmissions: (caseId: string) =>
    [...procurementKeys.all, "bid-submissions", caseId] as const,
  bidderDocuments: (bidderId: string) =>
    [...procurementKeys.all, "bidder-documents", bidderId] as const,
  vendors: () => [...procurementKeys.all, "vendors"] as const,
  allVendors: () => [...procurementKeys.all, "all-vendors"] as const,
  tecChecklist: (caseId: string) => [...procurementKeys.all, "tec-checklist", caseId] as const,
  tecEvaluations: (caseId: string) => [...procurementKeys.all, "tec-evaluations", caseId] as const,
  tecConsensus: (caseId: string) => [...procurementKeys.all, "tec-consensus", caseId] as const,
  tecGaps: (caseId: string) => [...procurementKeys.all, "tec-gaps", caseId] as const,
  tecAiSuggestions: (caseId: string) => [...procurementKeys.all, "tec-ai-suggestions", caseId] as const,
  commercialRecord: (caseId: string) => [...procurementKeys.all, "commercial-record", caseId] as const,
  commercialQuotes: (caseId: string) => [...procurementKeys.all, "commercial-quotes", caseId] as const,
  commercialRanking: (caseId: string) => [...procurementKeys.all, "commercial-ranking", caseId] as const,
  commercialMatrix: (caseId: string) => [...procurementKeys.all, "commercial-matrix", caseId] as const,
  commercialReasonableness: (caseId: string) =>
    [...procurementKeys.all, "commercial-reasonableness", caseId] as const,
  commercialGaps: (caseId: string) => [...procurementKeys.all, "commercial-gaps", caseId] as const,
  cstLiveVersion: (caseId: string) => [...procurementKeys.all, "cst-live-version", caseId] as const,
  cstVersions: (caseId: string) => [...procurementKeys.all, "cst-versions", caseId] as const,
  cstScrutiny: (caseId: string, version: number) =>
    [...procurementKeys.all, "cst-scrutiny", caseId, version] as const,
  commercialRecommendation: (caseId: string) =>
    [...procurementKeys.all, "commercial-recommendation", caseId] as const,
  recommendationHistory: (caseId: string) =>
    [...procurementKeys.all, "recommendation-history", caseId] as const,
  commercialApprovals: (caseId: string) =>
    [...procurementKeys.all, "commercial-approvals", caseId] as const,
  cstGaps: (caseId: string) => [...procurementKeys.all, "cst-gaps", caseId] as const,
  negotiation: (caseId: string) => [...procurementKeys.all, "negotiation", caseId] as const,
  negotiationRounds: (caseId: string) =>
    [...procurementKeys.all, "negotiation-rounds", caseId] as const,
  negotiationGaps: (caseId: string) =>
    [...procurementKeys.all, "negotiation-gaps", caseId] as const,
  proposal: (caseId: string) => [...procurementKeys.all, "proposal", caseId] as const,
  proposalGaps: (caseId: string) => [...procurementKeys.all, "proposal-gaps", caseId] as const,
  purchaseOrder: (caseId: string) => [...procurementKeys.all, "purchase-order", caseId] as const,
  poLines: (caseId: string) => [...procurementKeys.all, "po-lines", caseId] as const,
  poAmendments: (caseId: string) => [...procurementKeys.all, "po-amendments", caseId] as const,
  poAiDraft: (caseId: string) => [...procurementKeys.all, "po-ai-draft", caseId] as const,
  poGaps: (caseId: string) => [...procurementKeys.all, "po-gaps", caseId] as const,
  liveGoodsReceipt: (caseId: string) => [...procurementKeys.all, "live-grn", caseId] as const,
  grnCycles: (caseId: string) => [...procurementKeys.all, "grn-cycles", caseId] as const,
  grnLines: (grnId: string) => [...procurementKeys.all, "grn-lines", grnId] as const,
  grnSummary: (caseId: string) => [...procurementKeys.all, "grn-summary", caseId] as const,
  grnCloseGaps: (caseId: string) => [...procurementKeys.all, "grn-close-gaps", caseId] as const,
  grnForwardGaps: (caseId: string) => [...procurementKeys.all, "grn-forward-gaps", caseId] as const,
  paymentRecommendation: (caseId: string) =>
    [...procurementKeys.all, "payment-recommendation", caseId] as const,
  paymentGaps: (caseId: string) => [...procurementKeys.all, "payment-gaps", caseId] as const,
  paymentAiDraft: (caseId: string) => [...procurementKeys.all, "payment-ai-draft", caseId] as const,
};

// Reference data barely moves; an hour of staleness saves a request per screen.
const REFERENCE_STALE_MS = 60 * 60 * 1000;

export function useStageConfig() {
  return useQuery({
    queryKey: procurementKeys.stageConfig(),
    queryFn: cases.fetchStageConfig,
    staleTime: REFERENCE_STALE_MS,
  });
}

/** Every action in the workflow, for turning a recorded code into its label. */
export function useStageActions() {
  return useQuery({
    queryKey: [...procurementKeys.all, "stage-actions"] as const,
    queryFn: cases.fetchStageActions,
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useLookups(kind?: string) {
  return useQuery({
    queryKey: procurementKeys.lookups(kind),
    queryFn: () => fetchLookups(kind),
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useCases(filters: CaseFilters = {}) {
  return useQuery({
    queryKey: procurementKeys.cases(filters),
    queryFn: () => cases.fetchCases(filters),
  });
}

export function useCase(caseNo: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.case(caseNo ?? ""),
    queryFn: () => cases.fetchCaseByNo(caseNo as string),
    enabled: Boolean(caseNo),
  });
}

export function useCaseEvents(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.events(caseId ?? ""),
    queryFn: () => cases.fetchCaseEvents(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useStageHistory(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.history(caseId ?? ""),
    queryFn: () => cases.fetchStageHistory(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useClarifications(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.clarifications(caseId ?? ""),
    queryFn: () => cases.fetchClarifications(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useStageCounts() {
  return useQuery({
    queryKey: procurementKeys.stageCounts(),
    queryFn: cases.fetchStageCounts,
  });
}

export function useWorklist() {
  return useQuery({
    queryKey: procurementKeys.worklist(),
    queryFn: cases.fetchWorklist,
  });
}

export function useAvailableActions(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.actions(caseId ?? ""),
    queryFn: () => cases.fetchAvailableActions(caseId as string),
    enabled: Boolean(caseId),
  });
}

/** Available actions, each carrying its own gate's outstanding gaps — what
 * the action bar actually renders, so a not-yet-ready action shows why
 * rather than failing silently on press. */
export function useAvailableActionsWithGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: [...procurementKeys.actions(caseId ?? ""), "with-gaps"] as const,
    queryFn: () => cases.fetchAvailableActionsWithGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

const CASE_DOCUMENT_TERMINAL_STATUSES = new Set(["active", "completed", "failed"]);

export function useCaseDocuments(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.documents(caseId ?? ""),
    queryFn: () => documents.fetchCaseDocuments(caseId as string),
    enabled: Boolean(caseId),
    // Embedding generation finishes in a background task well after the
    // upload's own response returns, so nothing else re-fetches this once the
    // attach mutation's one-time invalidation has fired. Poll until every
    // attached document has reached a terminal status.
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const stillProcessing = rows.some((row) => {
        const status = row.document?.status;
        return status != null && !CASE_DOCUMENT_TERMINAL_STATUSES.has(status);
      });
      return stillProcessing ? 5000 : false;
    },
  });
}

export function useAttachDocument(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documents.attachDocumentToCase,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.documents(caseId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDetachDocument(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documents.detachCaseDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.documents(caseId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Relabelling paperwork after it is on the case, rather than before. */
export function useUpdateDocumentType(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documents.updateCaseDocumentType,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.documents(caseId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useOpenCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cases.openCase,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { caseId: string; patch: Parameters<typeof cases.updateCase>[1] }) =>
      cases.updateCase(args.caseId, args.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * A decision can move the case, open a thread and write the trail in one call,
 * so everything about the case is refetched rather than patched by hand.
 */
export function useStageDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cases.recordDecision,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function usePostClarification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      caseId: string;
      fromStage: ProcurementStage;
      toStage?: ProcurementStage | null;
      body: string;
      parentId?: string | null;
      authorId: string;
    }) => cases.postClarification(args),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: procurementKeys.clarifications(variables.caseId),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useResolveClarification(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cases.resolveClarification,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.clarifications(caseId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}


// ===== The requisition =====

export function useRequisition(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.requisition(caseId ?? ""),
    queryFn: () => requisition.fetchRequisition(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useBoqLines(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.boq(caseId ?? ""),
    queryFn: () => requisition.fetchBoqLines(caseId as string),
    enabled: Boolean(caseId),
  });
}

/** What is still missing before the requisition can be put to finance. */
export function useRequisitionGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.gaps(caseId ?? ""),
    queryFn: () => requisition.fetchRequisitionGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useBudgetLedger() {
  return useQuery({
    queryKey: procurementKeys.budgetLedger(),
    queryFn: requisition.fetchBudgetLedger,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveRequisition(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requisition.saveRequisition,
    onSuccess: () => {
      // Saving can change the case value through the cost trigger, so the case
      // itself is refetched alongside the requisition.
      void queryClient.invalidateQueries({ queryKey: procurementKeys.requisition(caseId) });
      void queryClient.invalidateQueries({ queryKey: procurementKeys.gaps(caseId) });
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSaveBoqLines(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requisition.replaceBoqLines,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.boq(caseId) });
      void queryClient.invalidateQueries({ queryKey: procurementKeys.gaps(caseId) });
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

// ===== Timeline and reporting =====

export function useCaseActivity(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.activity(caseId ?? ""),
    queryFn: () => insights.fetchCaseActivity(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useHeadlineMetrics() {
  return useQuery({
    queryKey: procurementKeys.insights("headline"),
    queryFn: insights.fetchHeadlineMetrics,
  });
}

export function useStageAging() {
  return useQuery({
    queryKey: procurementKeys.insights("aging"),
    queryFn: insights.fetchStageAging,
  });
}

export function useMonthlyFlow(months = 12) {
  return useQuery({
    queryKey: procurementKeys.insights(`flow-${months}`),
    queryFn: () => insights.fetchMonthlyFlow(months),
  });
}

export function useDepartmentSpend() {
  return useQuery({
    queryKey: procurementKeys.insights("department-spend"),
    queryFn: insights.fetchDepartmentSpend,
  });
}

export function useCycleTime() {
  return useQuery({
    queryKey: procurementKeys.insights("cycle-time"),
    queryFn: insights.fetchCycleTime,
  });
}


/** How much of a case's paperwork has been read and indexed so far. */
export function useCaseDocumentReadiness(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.readiness(caseId ?? ""),
    queryFn: () => assistant.fetchCaseDocumentReadiness(caseId as string),
    enabled: Boolean(caseId),
    // Ingestion finishes in the background; a slow poll keeps the panel honest
    // without anybody pressing refresh.
    refetchInterval: (query) =>
      (query.state.data?.still_reading ?? 0) > 0 ? 5000 : false,
  });
}

export function useAskAboutCase() {
  return useMutation({
    mutationFn: assistant.askAboutCase,
    onError: (error: Error) => {
      // A signed-in tab left idle can end up sending an access token GoTrue no
      // longer accepts; the edge function reports this as plain "Not
      // authenticated", which reads as a dead end rather than what it is.
      if (error.message === "Not authenticated") {
        toast.error("Your session has expired. Refresh the page and sign in again.");
        return;
      }
      toast.error(error.message);
    },
  });
}


// ===== Master data =====

/**
 * Every lookup, retired ones included. Kept apart from `useLookups`, which the
 * pickers use and which only ever returns what is live.
 */
export function useAllLookups() {
  return useQuery({
    queryKey: procurementKeys.allLookups(),
    queryFn: masterData.fetchAllLookups,
  });
}

export function useBudgetHeads() {
  return useQuery({
    queryKey: procurementKeys.budgetHeads(),
    queryFn: masterData.fetchBudgetHeads,
  });
}

/**
 * Editing master data invalidates the whole procurement tree, not just the
 * admin screen's own query: a renamed department shows on the register, the
 * insights page and every open case file, all of which cache it separately.
 */
function useMasterDataMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  message: (result: TResult, args: TArgs) => string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result, args) => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
      toast.success(message(result, args));
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateLookup() {
  return useMasterDataMutation(masterData.createLookup, (row) => `Added ${row.name}`);
}

export function useUpdateLookup() {
  return useMasterDataMutation(masterData.updateLookup, (row) => `Saved ${row.name}`);
}

export function useCreateLookups() {
  return useMasterDataMutation(masterData.createLookups, (result) =>
    result.skipped > 0
      ? `Added ${result.added}, skipped ${result.skipped} already on the list`
      : `Added ${result.added}`,
  );
}

export function useDeleteLookup() {
  return useMasterDataMutation(masterData.deleteLookup, () => "Entry deleted");
}

// ===== Signatures =====

/**
 * The signer's own saved signature.
 *
 * Never cached across accounts — the query key is global but the RLS policy
 * scopes the row to `auth.uid()`, and signing out clears the client. Kept fresh
 * rather than stale-timed: it is one small row and getting it wrong means
 * offering somebody else's mark.
 */
export function useMySignature() {
  return useQuery({
    queryKey: procurementKeys.mySignature(),
    queryFn: signatures.fetchMySignature,
  });
}

export function useSaveMySignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signatures.saveMySignature,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.mySignature() });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteMySignature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signatures.deleteMySignature,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.mySignature() });
      toast.success("Saved signature removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Every signature on a case, for the reader who wants to see who signed what. */
export function useCaseSignatures(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.caseSignatures(caseId ?? ""),
    queryFn: () => signatures.fetchCaseSignatures(caseId as string),
    enabled: Boolean(caseId),
  });
}

/** The same signatures, with the signer's name and the role they held at the
 * moment they signed — for the purchase order PDF's own signature block. */
export function useCaseSignaturesNamed(caseId: string | undefined) {
  return useQuery({
    queryKey: [...procurementKeys.caseSignatures(caseId ?? ""), "named"] as const,
    queryFn: () => signatures.fetchCaseSignaturesNamed(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCreateBudgetHead() {
  return useMasterDataMutation(masterData.createBudgetHead, (row) => `Added ${row.name}`);
}

export function useUpdateBudgetHead() {
  return useMasterDataMutation(masterData.updateBudgetHead, (row) => `Saved ${row.name}`);
}

// ===== The tender =====

export function useTender(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tender(caseId ?? ""),
    queryFn: () => tender.fetchTender(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTenderSummary(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tenderSummary(caseId ?? ""),
    queryFn: () => tender.fetchTenderSummary(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTenderGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tenderGaps(caseId ?? ""),
    queryFn: () => tender.fetchTenderGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTenderItems(tenderId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tenderItems(tenderId ?? ""),
    queryFn: () => tender.fetchTenderItems(tenderId as string),
    enabled: Boolean(tenderId),
  });
}

export function useTenderInvitees(tenderId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tenderInvitees(tenderId ?? ""),
    queryFn: () => tender.fetchInvitees(tenderId as string),
    enabled: Boolean(tenderId),
  });
}

export function useBidders(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.bidders(caseId ?? ""),
    queryFn: () => tender.fetchBidders(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCorrigenda(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.corrigenda(caseId ?? ""),
    queryFn: () => tender.fetchCorrigenda(caseId as string),
    enabled: Boolean(caseId),
  });
}

/**
 * Anything that touches the tender invalidates the whole procurement tree.
 *
 * The gaps, the summary, the checklist, the action bar's availability and the
 * case row all read this and each caches separately, so a narrower invalidation
 * leaves the screen disagreeing with itself — the officer records the last bid
 * and the handoff button stays greyed out. Same reasoning as
 * `useSaveRequisition`, and it is written down in PROCUREMENT.md §9.
 */
function useTenderMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: procurementKeys.all }),
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * What each firm sent with its bid, and how much of it has been read.
 *
 * Polled while anything is still being ingested: a submission uploaded a moment
 * ago is not yet answerable, and the roster says so rather than letting the
 * evaluation draw conclusions from a document the pipeline has not opened.
 */
export function useBidSubmissions(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.bidSubmissions(caseId ?? ""),
    queryFn: () => tender.fetchBidSubmissions(caseId as string),
    enabled: Boolean(caseId),
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const pending = rows.some((row) => Number(row.indexed_count) < Number(row.document_count));
      return pending ? 5000 : false;
    },
  });
}

export function useBidderDocuments(bidderId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.bidderDocuments(bidderId ?? ""),
    queryFn: () => tender.fetchBidderDocuments(bidderId as string),
    enabled: Boolean(bidderId),
  });
}

export const useSaveTender = () => useTenderMutation(tender.saveTender);
export const useSaveBidder = () => useTenderMutation(tender.saveBidder);
export const useDeleteBidder = () => useTenderMutation(tender.deleteBidder);
export const useReplaceInvitees = () => useTenderMutation(tender.replaceInvitees);
export const usePublishBoqToTender = () => useTenderMutation(tender.publishBoqToTender);
export const useFloatTender = () => useTenderMutation(tender.floatTender);
export const useCloseBidding = () => useTenderMutation(tender.closeBidding);
export const useIssueCorrigendum = () => useTenderMutation(tender.issueCorrigendum);
export const useRevokeCorrigendum = () => useTenderMutation(tender.revokeCorrigendum);
export const useRecordCorrigendumNotice = () =>
  useTenderMutation(tender.recordCorrigendumNotice);
export const useLinkNoticeDocument = () => useTenderMutation(tender.linkNoticeDocument);

// ===== The vendor register =====

export function useVendors() {
  return useQuery({
    queryKey: procurementKeys.vendors(),
    queryFn: vendors.fetchVendors,
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useAllVendors() {
  return useQuery({
    queryKey: procurementKeys.allVendors(),
    queryFn: vendors.fetchAllVendors,
    staleTime: REFERENCE_STALE_MS,
  });
}

// A renamed or barred vendor shows on every roster, so these invalidate as
// widely as the master-data mutations do.
export const useCreateVendor = () => useTenderMutation(vendors.createVendor);
export const useUpdateVendor = () => useTenderMutation(vendors.updateVendor);
export const useSetVendorBlacklist = () => useTenderMutation(vendors.setVendorBlacklist);

// ===== The technical evaluation committee =====

export function useTecChecklist(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tecChecklist(caseId ?? ""),
    queryFn: () => tec.fetchTecChecklist(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTecEvaluations(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tecEvaluations(caseId ?? ""),
    queryFn: () => tec.fetchTecEvaluations(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTecConsensus(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tecConsensus(caseId ?? ""),
    queryFn: () => tec.fetchTecConsensus(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTecGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tecGaps(caseId ?? ""),
    queryFn: () => tec.fetchTecGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useTecAiSuggestions(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.tecAiSuggestions(caseId ?? ""),
    queryFn: () => tec.fetchTecAiSuggestions(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveTecChecklistItem = () => useTenderMutation(tec.saveTecChecklistItem);
export const useSubmitTecEvaluation = () => useTenderMutation(tec.submitTecEvaluation);
export const useSetBidderQualification = () => useTenderMutation(tec.setBidderQualification);
export const useRequestTecAiEvaluation = () => useTenderMutation(tec.requestTecAiEvaluation);

// ===== The commercial desk =====

export function useCommercialRecord(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialRecord(caseId ?? ""),
    queryFn: () => commercial.fetchCommercialRecord(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialQuotes(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialQuotes(caseId ?? ""),
    queryFn: () => commercial.fetchCommercialQuotes(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialRanking(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialRanking(caseId ?? ""),
    queryFn: () => commercial.fetchCommercialRanking(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialLineComparison(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialMatrix(caseId ?? ""),
    queryFn: () => commercial.fetchLineComparison(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialReasonableness(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialReasonableness(caseId ?? ""),
    queryFn: () => commercial.fetchReasonableness(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialGaps(caseId ?? ""),
    queryFn: () => commercial.fetchCommercialGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveQuote = () => useTenderMutation(commercial.saveQuote);
export const useRecordQuoteSchedule = () => useTenderMutation(commercial.recordQuoteSchedule);
export const useSetRankingBasis = () => useTenderMutation(commercial.setRankingBasis);

// ===== The comparative statement =====

export function useLiveCstVersion(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.cstLiveVersion(caseId ?? ""),
    queryFn: () => cst.fetchLiveCstVersion(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCstVersions(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.cstVersions(caseId ?? ""),
    queryFn: () => cst.fetchCstVersions(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCstScrutiny(caseId: string | undefined, version: number | undefined) {
  return useQuery({
    queryKey: procurementKeys.cstScrutiny(caseId ?? "", version ?? 0),
    queryFn: () => cst.fetchCstScrutiny(caseId as string, version as number),
    enabled: Boolean(caseId) && Boolean(version),
  });
}

export function useCommercialRecommendation(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialRecommendation(caseId ?? ""),
    queryFn: () => cst.fetchRecommendation(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useRecommendationHistory(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.recommendationHistory(caseId ?? ""),
    queryFn: () => cst.fetchRecommendationHistory(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCommercialApprovals(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.commercialApprovals(caseId ?? ""),
    queryFn: () => cst.fetchCommercialApprovals(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useCstGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.cstGaps(caseId ?? ""),
    queryFn: () => cst.fetchCstGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveCstScrutiny = () => useTenderMutation(cst.saveCstScrutiny);
export const useRecordRecommendation = () => useTenderMutation(cst.recordRecommendation);
export const useApproveCstAuthority = () => useTenderMutation(cst.approveCstAuthority);

// ===== Price negotiation =====

export function useNegotiation(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.negotiation(caseId ?? ""),
    queryFn: () => negotiation.fetchNegotiation(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useNegotiationRounds(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.negotiationRounds(caseId ?? ""),
    queryFn: () => negotiation.fetchNegotiationRounds(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useNegotiationGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.negotiationGaps(caseId ?? ""),
    queryFn: () => negotiation.fetchNegotiationGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveNegotiationMandate = () => useTenderMutation(negotiation.saveNegotiationMandate);
export const useOpenNegotiationRound = () => useTenderMutation(negotiation.openNegotiationRound);
export const useUpdateNegotiationRound = () => useTenderMutation(negotiation.updateNegotiationRound);
export const useCloseNegotiationRound = () => useTenderMutation(negotiation.closeNegotiationRound);

// ===== Purchase proposal =====

export function useProposal(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.proposal(caseId ?? ""),
    queryFn: () => proposal.fetchProposal(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useProposalGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.proposalGaps(caseId ?? ""),
    queryFn: () => proposal.fetchProposalGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveProposal = () => useTenderMutation(proposal.saveProposal);

// ===== Purchase order =====

export function usePurchaseOrder(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.purchaseOrder(caseId ?? ""),
    queryFn: () => purchaseOrder.fetchPurchaseOrder(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function usePoLines(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.poLines(caseId ?? ""),
    queryFn: () => purchaseOrder.fetchPoLines(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function usePoAmendments(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.poAmendments(caseId ?? ""),
    queryFn: () => purchaseOrder.fetchPoAmendments(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function usePoAiDraft(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.poAiDraft(caseId ?? ""),
    queryFn: () => purchaseOrder.fetchPoAiDraft(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function usePoGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.poGaps(caseId ?? ""),
    queryFn: () => purchaseOrder.fetchPoGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSavePurchaseOrder = () => useTenderMutation(purchaseOrder.savePurchaseOrder);
export const useRecordVendorAck = () => useTenderMutation(purchaseOrder.recordVendorAck);
export const useAmendPurchaseOrder = () => useTenderMutation(purchaseOrder.amendPurchaseOrder);
export const useRequestPoAiDraft = () => useTenderMutation(purchaseOrder.requestPoAiDraft);

// ===== Goods receipt =====

export function useLiveGoodsReceipt(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.liveGoodsReceipt(caseId ?? ""),
    queryFn: () => goodsReceipt.fetchLiveGoodsReceipt(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useGrnCycles(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.grnCycles(caseId ?? ""),
    queryFn: () => goodsReceipt.fetchGoodsReceiptCycles(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useGrnLines(grnId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.grnLines(grnId ?? ""),
    queryFn: () => goodsReceipt.fetchGrnLines(grnId as string),
    enabled: Boolean(grnId),
  });
}

export function useGrnSummary(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.grnSummary(caseId ?? ""),
    queryFn: () => goodsReceipt.fetchGrnSummary(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useGrnCloseGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.grnCloseGaps(caseId ?? ""),
    queryFn: () => goodsReceipt.fetchGrnCloseGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function useGrnForwardGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.grnForwardGaps(caseId ?? ""),
    queryFn: () => goodsReceipt.fetchGrnForwardGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSaveGrnLine = () => useTenderMutation(goodsReceipt.saveGrnLine);

// ===== Payment recommendation =====

export function usePaymentRecommendation(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.paymentRecommendation(caseId ?? ""),
    queryFn: () => payment.fetchPaymentRecommendation(caseId as string),
    enabled: Boolean(caseId),
  });
}

export function usePaymentGaps(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.paymentGaps(caseId ?? ""),
    queryFn: () => payment.fetchPaymentGaps(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useSavePaymentRecommendation = () => useTenderMutation(payment.savePaymentRecommendation);

export function usePaymentAiDraft(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.paymentAiDraft(caseId ?? ""),
    queryFn: () => payment.fetchPaymentAiDraft(caseId as string),
    enabled: Boolean(caseId),
  });
}

export const useRequestPaymentAiDraft = () => useTenderMutation(payment.requestPaymentAiDraft);
