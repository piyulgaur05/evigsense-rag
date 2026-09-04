import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as cases from "../api/cases";
import * as documents from "../api/documents";
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
