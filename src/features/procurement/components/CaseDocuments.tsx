import { useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { CASE_DOCUMENT_TYPES, signedDocumentUrl } from "../api/documents";
import { useAttachDocument, useCaseDocuments, useDetachDocument } from "../hooks/useProcurement";
import { formatDate } from "../lib/format";
import type { ProcurementStage } from "../types";

const INGEST_LABEL: Record<string, string> = {
  queued: "queued",
  processing: "reading",
  completed: "indexed",
  failed: "failed",
};

/**
 * The case file's paperwork. Uploads go through the product's ordinary ingest
 * pipeline, so anything attached here is OCR'd, indexed and answerable by the
 * assistant like any other document.
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
  const { user } = useAuth();
  const { data: documents, isLoading } = useCaseDocuments(caseId);
  const attach = useAttachDocument(caseId);
  const detach = useDetachDocument(caseId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>(CASE_DOCUMENT_TYPES[0]);

  const onPick = async (file: File | undefined) => {
    if (!file || !user) return;
    try {
      await attach.mutateAsync({ caseId, caseNo, stage, docType, file, userId: user.id });
      toast.success(`${file.name} attached to ${caseNo}`);
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

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        paperwork
      </p>

      {canUpload && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-9 w-[220px] text-[13px]">
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

          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={attach.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {attach.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-2 h-4 w-4" />
            )}
            Attach
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Loading the file…</p>
      ) : !documents?.length ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nothing on the file yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {documents.map((link) => (
            <li key={link.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground">
                  {link.document?.original_filename ?? link.document?.title ?? "Missing file"}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {link.doc_type} · {link.stage.replace(/_/g, " ")} · {formatDate(link.created_at)}
                  {link.document?.status ? (
                    <>
                      {" · "}
                      <span
                        className={
                          link.document.status === "completed" ? "text-signal" : undefined
                        }
                      >
                        {INGEST_LABEL[link.document.status] ?? link.document.status}
                      </span>
                    </>
                  ) : null}
                </p>
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
                {canUpload && (
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
          ))}
        </ul>
      )}
    </section>
  );
}
