import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as cases from "../api/cases";
import * as documents from "../api/documents";
import * as assistant from "../api/assistant";
import * as insights from "../api/insights";
import * as requisition from "../api/requisition";
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
