import { ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signedDocumentUrl } from "../api/documents";
import { useCaseDocuments } from "../hooks/useProcurement";
import { IngestState } from "./CaseDocuments";
import { formatDateTime } from "../lib/format";

/**
 * Whatever a stage's own "Generate…" button has filed on the case,
 * one-line-per-version — the officer who just pressed it should be able to
 * open what came out without leaving the panel for the case-wide paperwork
 * list further down the page.
 *
 * Reads `procurement_case_documents` filtered to this one `docType`, the
 * same visibility and the same ingest status every other document on the
 * case carries — a generated file is not a special case once it has landed.
 */
export function GeneratedDocuments({ caseId, docType }: { caseId: string; docType: string }) {
  const { data: documents } = useCaseDocuments(caseId);
  const rows = (documents ?? []).filter((d) => d.doc_type === docType && d.is_generated);

  if (rows.length === 0) return null;

  const view = async (storagePath: string) => {
    try {
      const url = await signedDocumentUrl(storagePath);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the document.");
    }
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">
                {row.document?.original_filename ?? row.document?.title ?? "Document"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {formatDateTime(row.created_at)}
                <span aria-hidden>·</span>
                <IngestState status={row.document?.status} />
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 px-2 text-[11px]"
            onClick={() => row.document && void view(row.document.storage_path)}
            disabled={!row.document}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </Button>
        </div>
      ))}
    </div>
  );
}
