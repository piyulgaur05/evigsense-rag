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

export function useCaseDocuments(caseId: string | undefined) {
  return useQuery({
    queryKey: procurementKeys.documents(caseId ?? ""),
    queryFn: () => documents.fetchCaseDocuments(caseId as string),
    enabled: Boolean(caseId),
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
    onError: (error: Error) => toast.error(error.message),
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
