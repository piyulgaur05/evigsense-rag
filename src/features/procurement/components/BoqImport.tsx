import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { attachDocumentToCase } from "../api/documents";
import {
  BOQ_IMPORT_ACCEPT,
  extractBoqFromDocument,
  extractBoqFromText,
  isPending,
  isSpreadsheet,
  spreadsheetToText,
  type ExtractedBoq,
} from "../api/boq-import";
import type { BoqDraftLine } from "../api/requisition";
import { formatMoney } from "../lib/format";
import { boqTotal } from "../lib/boq";
import type { ProcurementStage } from "../types";

/**
 * Read the bill of quantities out of a file instead of retyping it.
 *
 * Two things happen to the file, and both are worth having: it is attached to
 * the case like any other document — so it is stored, read, indexed and
 * answerable by the assistant — and its items are offered back as draft lines.
 *
 * Nothing is written to the bill without being shown first. An extraction that
 * saved itself would be worse than typing, because nobody would check it.
 */
export function BoqImport({
  caseId,
  caseNo,
  stage,
  onAccept,
  hasLines,
}: {
  caseId: string;
  caseNo: string;
  stage: ProcurementStage;
  onAccept: (lines: BoqDraftLine[], mode: "append" | "replace") => void;
  hasLines: boolean;
}) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedBoq | null>(null);
  const [waiting, setWaiting] = useState<{ documentId: string; message: string } | null>(null);

  const read = async (documentId: string | null, text: string | null, label: string) => {
    // Reading a bill out of a document is a model call over a long prompt; it
    // can take the better part of a minute, so the button says so.
    setBusy(`Reading ${label} — this can take a minute…`);
    try {
      const extraction = text
        ? await extractBoqFromText({ text, caseId })
        : await extractBoqFromDocument({ documentId: documentId as string, caseId });

      if (isPending(extraction)) {
        setWaiting({ documentId: documentId as string, message: extraction.message });
        setResult(null);
        return;
      }

      setWaiting(null);
      setResult(extraction);
      if (extraction.lines.length === 0) {
        toast.info(extraction.notes || `No items found in ${label}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file");
    } finally {
      setBusy(null);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file || !user) return;
    setResult(null);
    setWaiting(null);

    try {
      setBusy(`Attaching ${file.name}…`);
      const documentId = await attachDocumentToCase({
        caseId,
        caseNo,
        stage,
        docType: "Bill of quantities",
        file,
        userId: user.id,
      });
      toast.success(`${file.name} attached to ${caseNo}`);

      // A spreadsheet's own cells beat anything read back out of a rendering
      // of it, and the browser already has the file — so read it here and do
      // not wait for the ingest queue.
      if (isSpreadsheet(file)) {
        const text = await spreadsheetToText(file);
        await read(null, text, file.name);
      } else {
        await read(documentId, null, file.name);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach that file");
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const accept = (mode: "append" | "replace") => {
    if (!result) return;
    onAccept(result.lines, mode);
    toast.success(
      mode === "replace"
        ? `The bill now has ${result.lines.length} item(s) from ${result.source}.`
        : `${result.lines.length} item(s) added from ${result.source}.`,
    );
    setResult(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border px-4 py-3">
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[13px] text-foreground">Have the items in a file already?</p>
          <p className="text-[12px] text-muted-foreground">
            A spreadsheet, a CSV, or the scope of work as a PDF. It is attached to the case and
            read for you — you check the result before anything is saved.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={BOQ_IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={Boolean(busy)}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {busy ?? "Read items from a file"}
        </Button>
      </div>

      {waiting && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
          <p className="text-[13px] text-muted-foreground">{waiting.message}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={Boolean(busy)}
            onClick={() => read(waiting.documentId, null, "the document")}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      )}

      {result && result.lines.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
            <p className="text-[13px] font-medium text-foreground">
              {result.lines.length} item(s) read from {result.source}
            </p>
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {formatMoney(boqTotal(result.lines))}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7"
              aria-label="Discard what was read"
              onClick={() => setResult(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {(result.notes || result.truncated) && (
            <p className="border-b border-border px-4 py-2.5 text-[12px] text-muted-foreground">
              {result.notes}
              {result.truncated &&
                " Only the first part of the file was read — check for items further down."}
            </p>
          )}

          <div className="max-h-64 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="border-b border-border px-4 py-2 font-normal">Item</th>
                  <th className="border-b border-border py-2 pr-2 text-right font-normal">Qty</th>
                  <th className="border-b border-border py-2 pr-2 font-normal">Unit</th>
                  <th className="border-b border-border py-2 pr-4 text-right font-normal">Rate</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line, index) => (
                  <tr key={index}>
                    <td className="border-b border-border px-4 py-1.5">
                      {line.item_name}
                      {line.specification && (
                        <span className="block text-muted-foreground">{line.specification}</span>
                      )}
                    </td>
                    <td className="border-b border-border py-1.5 pr-2 text-right font-mono tabular-nums">
                      {line.quantity}
                    </td>
                    <td className="border-b border-border py-1.5 pr-2 text-muted-foreground">
                      {line.unit ?? "—"}
                    </td>
                    <td className="border-b border-border py-1.5 pr-4 text-right font-mono tabular-nums">
                      {line.estimated_rate === null ? "—" : formatMoney(line.estimated_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            <p className="text-[12px] text-muted-foreground">
              Check the rates and quantities — they go on the case as read.
            </p>
            <div className="ml-auto flex gap-2">
              {hasLines && (
                <Button type="button" variant="outline" size="sm" onClick={() => accept("append")}>
                  Add to the bill
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => accept("replace")}>
                {hasLines ? "Replace the bill" : "Use these items"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
