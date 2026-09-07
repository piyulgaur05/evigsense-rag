import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRecordQuoteSchedule } from "../hooks/useProcurement";
import type { QuoteScheduleLine } from "../types";

/**
 * Reads a price schedule out of pasted rows and writes it through
 * `procurement_record_quote_schedule`, which does the matching against the
 * published bill and raises whatever is wrong with the sheet.
 *
 * A model-assisted read of an uploaded file — the commercial-desk mirror of
 * `BoqImport` — is real future work and not yet built; this is the manual
 * predecessor it would extend, and it already exercises the same write path
 * and the same review-before-commit shape: nothing is written until
 * **Read this schedule** is pressed, and the issues it raises are shown
 * immediately rather than discovered later on the statement.
 */
export function QuoteScheduleImport({
  quoteId,
  onDone,
}: {
  quoteId: string;
  caseId: string;
  bidderId: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const recordSchedule = useRecordQuoteSchedule();

  const parse = (): QuoteScheduleLine[] => {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = line.split(/\t|,/).map((cell) => cell.trim());
        const [itemName, rate, qty, amount] = cells;
        return {
          item_name: itemName,
          unit_rate: rate ? Number(rate.replace(/,/g, "")) : null,
          quantity: qty ? Number(qty.replace(/,/g, "")) : null,
          amount: amount ? Number(amount.replace(/,/g, "")) : null,
        };
      });
  };

  const submit = async () => {
    const lines = parse();
    if (lines.length === 0) {
      toast.error("Paste at least one row first.");
      return;
    }
    try {
      const issues = await recordSchedule.mutateAsync({ quoteId, lines, source: "manual" });
      const errors = issues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        toast.warning(`Read ${lines.length} rows; ${errors.length} still need a rate or a match.`);
      } else {
        toast.success(`Read ${lines.length} rows against the published bill.`);
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read the schedule.");
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <p className="text-[11px] text-muted-foreground">
        One line per item: name, rate, quantity (optional), amount (optional) — tab or comma
        separated. Matched against the published bill by name; anything that does not match is
        reported, not silently dropped.
      </p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={"Spectrum analyser, 26.5 GHz\t1600000\nCalibration kit, 3.5 mm\t100000\t2"}
        rows={4}
        className="text-[12px]"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => void submit()}
          disabled={recordSchedule.isPending}
        >
          Read this schedule
        </Button>
      </div>
    </div>
  );
}
