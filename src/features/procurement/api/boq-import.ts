import { supabase } from "@/integrations/supabase/client";
import type { BoqDraftLine } from "./requisition";

export type ExtractedBoq = {
  lines: BoqDraftLine[];
  notes: string;
  source: string;
  truncated: boolean;
  total: number;
};

/** The file is still being read by the ingest pipeline; ask again shortly. */
export type PendingExtraction = { pending: true; message: string; status: string };

export type BoqExtraction = ExtractedBoq | PendingExtraction;

export const isPending = (result: BoqExtraction): result is PendingExtraction =>
  "pending" in result;

/** What the picker accepts. Anything the ingest pipeline can read is fair game. */
export const BOQ_IMPORT_ACCEPT = ".csv,.tsv,.xlsx,.xls,.pdf,.docx,.txt,.md";

const SPREADSHEET = /\.(csv|tsv|xlsx|xls)$/i;

export const isSpreadsheet = (file: File) => SPREADSHEET.test(file.name);

/**
 * Turn a spreadsheet into the plain rows the model reads.
 *
 * Done in the browser rather than server-side because the file is already
 * here, the answer is instant, and a spreadsheet's own cells are far better
 * evidence than a PDF rendering of the same table. `exceljs` is already a
 * dependency of this product.
 */
export async function spreadsheetToText(file: File): Promise<string> {
  if (/\.(csv|tsv|txt|md)$/i.test(file.name)) {
    return (await file.text()).slice(0, 200_000);
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const out: string[] = [];
  workbook.eachSheet((sheet) => {
    out.push(`# Sheet: ${sheet.name}`);
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value;
        if (value === null || value === undefined) {
          cells.push("");
        } else if (typeof value === "object" && "result" in value) {
          cells.push(String((value as { result?: unknown }).result ?? ""));
        } else if (typeof value === "object" && "text" in value) {
          cells.push(String((value as { text?: unknown }).text ?? ""));
        } else {
          cells.push(String(value));
        }
      });
      // Tab separated: the model reads a grid far more reliably than prose.
      out.push(cells.join("\t"));
    });
  });

  return out.join("\n").slice(0, 200_000);
}

async function invokeExtract(body: Record<string, unknown>): Promise<BoqExtraction> {
  const { data, error } = await supabase.functions.invoke("extract-boq", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  if (data?.pending) {
    return { pending: true, message: data.message, status: data.status } as PendingExtraction;
  }
  return {
    lines: (data?.lines ?? []) as BoqDraftLine[],
    notes: data?.notes ?? "",
    source: data?.source ?? "the file",
    truncated: Boolean(data?.truncated),
    total: Number(data?.total ?? 0),
  };
}

export const extractBoqFromText = (args: { text: string; caseId?: string }) =>
  invokeExtract({ text: args.text, caseId: args.caseId });

export const extractBoqFromDocument = (args: { documentId: string; caseId?: string }) =>
  invokeExtract({ documentId: args.documentId, caseId: args.caseId });
