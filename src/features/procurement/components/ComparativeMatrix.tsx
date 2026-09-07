import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "../lib/format";
import type { CommercialLineComparisonRow } from "../types";

/**
 * The cross-bidder item matrix: every firm's rate against every published
 * line, pivoted so a reader can see which bidder is cheapest on which line —
 * the comparison the reference this stage was modelled on never renders, and
 * the reason this product prices item by item rather than as one lump sum.
 *
 * Item-wise L1 is advisory here: nothing in this slice offers a split award
 * across firms, only the evidence a later decision to do so would rest on.
 */
export function ComparativeMatrix({ rows }: { rows: CommercialLineComparisonRow[] }) {
  const { lines, vendors } = useMemo(() => {
    const lineMap = new Map<string, { line_no: number; item_name: string; unit: string | null }>();
    const vendorSet = new Set<string>();
    for (const row of rows) {
      if (row.tender_item_id && !lineMap.has(row.tender_item_id)) {
        lineMap.set(row.tender_item_id, {
          line_no: row.line_no ?? 0,
          item_name: row.item_name ?? "",
          unit: row.unit,
        });
      }
      if (row.vendor_name) vendorSet.add(row.vendor_name);
    }
    return {
      lines: [...lineMap.entries()].sort((a, b) => a[1].line_no - b[1].line_no),
      vendors: [...vendorSet].sort(),
    };
  }, [rows]);

  const cell = (tenderItemId: string, vendorName: string) =>
    rows.find((row) => row.tender_item_id === tenderItemId && row.vendor_name === vendorName);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-3 py-2">Line</th>
            {vendors.map((vendor) => (
              <th key={vendor} className="px-3 py-2 text-right">
                {vendor}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(([itemId, line]) => (
            <tr key={itemId} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 text-foreground">
                {line.line_no}. {line.item_name}
                {line.unit && <span className="text-muted-foreground"> ({line.unit})</span>}
              </td>
              {vendors.map((vendor) => {
                const c = cell(itemId, vendor);
                return (
                  <td
                    key={vendor}
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      c?.is_line_l1 && "bg-ok/5 font-medium text-ok",
                    )}
                  >
                    {c?.unit_rate != null ? formatMoney(c.unit_rate) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
