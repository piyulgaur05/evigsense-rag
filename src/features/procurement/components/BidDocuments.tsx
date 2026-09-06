import { useRef, useState } from "react";
import { CircleDashed, FileText, Loader2, Paperclip, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { attachDocumentToCase, detachCaseDocument, signedDocumentUrl } from "../api/documents";
import { useBidderDocuments } from "../hooks/useProcurement";
import { formatDate } from "../lib/format";

/**
 * The papers one firm sent with its bid.
 *
 * They are ordinary case documents — same bucket, same ingest, same OCR, same
 * embeddings — carrying nothing but an attribution to the bidder. That is the
 * whole design: a certificate bundle uploaded here is searchable and answerable
 * the moment the pipeline finishes with it, and the technical evaluation can
 * later ask what *this* firm sent without a second storage path, a second
 * indexer, or a second set of permissions to get wrong.
 *
 * The reading state is shown rather than hidden. A submission that has only
 * been half-indexed gives thin answers, and a reader who cannot see that will
 * mistake "not yet read" for "not provided" — which on a qualification question
 * is the difference between a gap and a disqualification.
 */
export function BidDocuments({
  caseId,
  caseNo,
  bidderId,
  vendorName,
  canUpload,
  onAsk,
}: {
  caseId: string;
  caseNo: string;
  bidderId: string;
  vendorName: string;
  canUpload: boolean;
  /** Opens the case assistant already narrowed to this firm. */
  onAsk?: () => void;
}) {
  const { user } = useAuth();
  const { data: documents, isLoading, refetch } = useBidderDocuments(bidderId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await attachDocumentToCase({
          caseId,
          caseNo,
          stage: "tender",
          docType: "Bid / vendor response",
          file,
          userId: user.id,
          bidderId,
        });
      }
      toast.success(
        files.length === 1
          ? `Filed against ${vendorName}. It will be readable once it has been processed.`
          : `${files.length} documents filed against ${vendorName}.`,
      );
      void refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach the file.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (storagePath: string) => {
    try {
      window.open(await signedDocumentUrl(storagePath), "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the file.");
    }
  };

  const rows = documents ?? [];
  const stillReading = rows.filter(
    (row) => row.document?.status === "queued" || row.document?.status === "processing",
  ).length;

  return (
    <div className="space-y-2">
      {isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing filed against this bid yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const status = row.document?.status;
            const reading = status === "queued" || status === "processing";
            const failed = status === "failed";
            return (
              <li key={row.id} className="flex items-center gap-2 text-[12px]">
                {reading ? (
                  <CircleDashed className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : failed ? (
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <button
                  type="button"
                  onClick={() => row.document && open(row.document.storage_path)}
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                >
                  {row.document?.original_filename ?? row.document?.title ?? "Document"}
                </button>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]",
                    failed ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {reading ? "reading" : failed ? "unreadable" : formatDate(row.created_at)}
                </span>
                {canUpload && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                    onClick={async () => {
                      await detachCaseDocument(row.id);
                      void refetch();
                    }}
                    aria-label={`Remove ${row.document?.original_filename ?? "this document"}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {stillReading > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {stillReading === 1 ? "One document is" : `${stillReading} documents are`} still being
          read. Answers about this bid will be incomplete until they finish.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => upload(event.target.files)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[12px]"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Paperclip className="mr-1.5 h-3 w-3" />
              )}
              Attach their papers
            </Button>
          </>
        )}
        {onAsk && rows.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[12px]"
            onClick={onAsk}
          >
            <Sparkles className="mr-1.5 h-3 w-3" />
            Ask about this bid
          </Button>
        )}
      </div>
    </div>
  );
}
