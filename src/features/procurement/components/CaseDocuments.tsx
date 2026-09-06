import { useMemo, useRef } from "react";
import { AlertCircle, Check, Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  CASE_DOCUMENT_TYPES,
  STAGE_DEFAULT_DOC_TYPE,
  signedDocumentUrl,
  type CaseDocument,
} from "../api/documents";
import {
  useAttachDocument,
  useCaseDocuments,
  useDetachDocument,
  useStageConfig,
  useUpdateDocumentType,
} from "../hooks/useProcurement";
import { formatDate } from "../lib/format";
import type { ProcurementStage } from "../types";

const INGEST_LABEL: Record<string, string> = {
  queued: "queued",
  processing: "reading",
  // The pipeline's finished state is 'active'; 'completed' is the queue's own.
  active: "indexed",
  completed: "indexed",
  failed: "could not be read",
};

function IngestState({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const label = INGEST_LABEL[status] ?? status;

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertCircle className="h-3 w-3" />
        {label}
      </span>
    );
  }
  if (status === "active" || status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-ok">
        <Check className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {label}
    </span>
  );
}

/**
 * The case file's paperwork — the whole file, at every stage.
 *
 * Two things this panel has to make obvious, because the schema already
 * guarantees them and the old version showed neither:
 *
 * 1. Documents belong to the *case*, not to the stage that added them. The
 *    SELECT policy on `procurement_case_documents` is the case visibility
 *    predicate, so a tender officer opening the file sees the requester's
 *    estimate, and a payments officer sees the tender and the committee
 *    minutes. Grouping by stage shows the file accumulating rather than
 *    presenting one flat list that could be mistaken for "mine".
 * 2. Everything here is answerable. Each file rides the ordinary ingest
 *    pipeline and `procurement_search_case_chunks` searches all of it for
 *    anyone who can see the case.
 *
 * The document-type picker used to sit in front of the attach button, which
 * made a twenty-two-item taxonomy decision the price of attaching a file. It is
 * now guessed from the stage and editable on the row afterwards.
 */
export function CaseDocuments({
  caseId,
  caseNo,
  stage,
  canUpload,
}: {
  caseId: string;
  caseNo: string;
  stage: ProcurementStage;
  canUpload: boolean;
}) {
  const { user, hasProcurementRole } = useAuth();
  const { data: documents, isLoading } = useCaseDocuments(caseId);
  const { data: stageConfig } = useStageConfig();
  const attach = useAttachDocument(caseId);
  const detach = useDetachDocument(caseId);
  const retype = useUpdateDocumentType(caseId);
  const fileInput = useRef<HTMLInputElement>(null);

  // Stage order and labels come from the database, which owns the workflow;
  // falling back to the enum order keeps the panel readable if it has not
  // loaded yet.
  const stageOrder = useMemo(() => {
    const order = new Map<string, number>();
    (stageConfig ?? []).forEach((row, index) => order.set(row.stage, row.sequence ?? index));
    return order;
  }, [stageConfig]);

  const stageLabel = useMemo(() => {
    const labels = new Map<string, string>();
    (stageConfig ?? []).forEach((row) => labels.set(row.stage, row.label));
    return labels;
  }, [stageConfig]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, CaseDocument[]>();
    for (const link of documents ?? []) {
      const bucket = buckets.get(link.stage) ?? [];
      bucket.push(link);
      buckets.set(link.stage, bucket);
    }
    return [...buckets.entries()].sort(
      ([a], [b]) => (stageOrder.get(a) ?? 99) - (stageOrder.get(b) ?? 99),
    );
  }, [documents, stageOrder]);

  const onPick = async (file: File | undefined) => {
    if (!file || !user) return;
    try {
      await attach.mutateAsync({
        caseId,
        caseNo,
        stage,
        docType: STAGE_DEFAULT_DOC_TYPE[stage] ?? "Other",
        file,
        userId: user.id,
      });
      toast.success(`${file.name} added to ${caseNo}`);
    } catch {
      // useAttachDocument already reported it.
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const open = async (storagePath: string) => {
    try {
      window.open(await signedDocumentUrl(storagePath), "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the file");
    }
  };

  const total = documents?.length ?? 0;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          paperwork
        </p>
        {total > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {total}
          </span>
        )}
        {canUpload && (
          <>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={attach.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {attach.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="mr-2 h-4 w-4" />
              )}
              Add a document
            </Button>
          </>
        )}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Everything added here stays on the case for the rest of its life. Anyone who can see the
        case — finance, tender, the committee, accounts — can open it and ask the assistant about
        it, whichever desk it came from.
      </p>

      {isLoading ? (
        <p className="mt-4 text-[13px] text-muted-foreground">Loading the file…</p>
      ) : total === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Nothing on the file yet.
          {canUpload ? " Add the estimate, a drawing or a specification if you have one." : ""}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map(([groupStage, links]) => (
            <div key={groupStage}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {stageLabel.get(groupStage) ?? groupStage.replace(/_/g, " ")}
                {groupStage === stage && " · here now"}
              </p>
              <ul className="mt-1.5 divide-y divide-border border-t border-border">
                {links.map((link) => {
                  // The detach and relabel policies both admit the uploader or
                  // the procurement administrator and nobody else, so the
                  // controls follow the same rule — offering them to anyone
                  // else would produce a silent no-op on click.
                  const mine =
                    link.uploaded_by === user?.id || hasProcurementRole("proc_admin");
                  return (
                    <li key={link.id} className="flex items-start gap-3 py-2.5">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-foreground">
                          {link.document?.original_filename ?? link.document?.title ?? "Missing file"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          <span>{formatDate(link.created_at)}</span>
                          <span aria-hidden>·</span>
                          <IngestState status={link.document?.status} />
                        </p>
                        {mine ? (
                          <Select
                            value={link.doc_type}
                            onValueChange={(docType) =>
                              retype.mutate({ linkId: link.id, docType })
                            }
                          >
                            <SelectTrigger
                              className={cn(
                                "mt-1.5 h-7 w-full max-w-[15rem] border-dashed text-[12px]",
                                "text-muted-foreground",
                              )}
                              aria-label="What this document is"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CASE_DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {link.doc_type}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {link.document?.storage_path && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="Open"
                            onClick={() => void open(link.document!.storage_path)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {mine && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label="Remove from case"
                            disabled={detach.isPending}
                            onClick={() => detach.mutate(link.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
