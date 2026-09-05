import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "../lib/format";
import { boqLineAmount, boqTotal, emptyBoqLine } from "../lib/boq";
import type { BoqDraftLine } from "../api/requisition";

/**
 * What is being bought, item by item. Optional — a service or a lump-sum job
 * has no bill of quantities, and forcing one would only produce a single line
 * saying "the work".
 */
export function BoqEditor({
  lines,
  units,
  readOnly,
  onChange,
}: {
  lines: BoqDraftLine[];
  units: { id: string; name: string }[];
  readOnly?: boolean;
  onChange: (lines: BoqDraftLine[]) => void;
}) {
  const update = (index: number, patch: Partial<BoqDraftLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const total = boqTotal(lines);

  if (readOnly && lines.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No itemised bill of quantities on this case.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="w-8 border-b border-border py-2 pr-2 font-normal">#</th>
              <th className="border-b border-border py-2 pr-2 font-normal">Item</th>
              <th className="w-20 border-b border-border py-2 pr-2 font-normal">Qty</th>
              <th className="w-28 border-b border-border py-2 pr-2 font-normal">Unit</th>
              <th className="w-24 border-b border-border py-2 pr-2 font-normal">HSN</th>
              <th className="w-28 border-b border-border py-2 pr-2 text-right font-normal">Rate</th>
              <th className="w-28 border-b border-border py-2 text-right font-normal">Amount</th>
              {!readOnly && <th className="w-10 border-b border-border py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="align-top">
                <td className="border-b border-border py-2 pr-2 font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </td>
                <td className="border-b border-border py-2 pr-2">
                  {readOnly ? (
                    <>
                      <span className="text-foreground">{line.item_name}</span>
                      {line.specification && (
                        <span className="mt-0.5 block text-[12px] text-muted-foreground">
                          {line.specification}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        value={line.item_name}
                        placeholder="Spectrum analyser, 26.5 GHz"
                        onChange={(e) => update(index, { item_name: e.target.value })}
                      />
                      <Input
                        value={line.specification ?? ""}
                        placeholder="Specification, make/model, tolerance"
                        onChange={(e) => update(index, { specification: e.target.value })}
                      />
                    </div>
                  )}
                </td>
                <td className="border-b border-border py-2 pr-2">
                  {readOnly ? (
                    <span className="font-mono tabular-nums">{line.quantity}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="tabular-nums"
                      value={Number.isFinite(line.quantity) ? line.quantity : ""}
                      onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                    />
                  )}
                </td>
                <td className="border-b border-border py-2 pr-2">
                  {readOnly ? (
                    <span className="text-muted-foreground">{line.unit ?? "—"}</span>
                  ) : (
                    <Select
                      value={line.unit ?? ""}
                      onValueChange={(value) => update(index, { unit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.name}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="border-b border-border py-2 pr-2">
                  {readOnly ? (
                    <span className="font-mono text-[12px] text-muted-foreground">
                      {line.hsn_code ?? "—"}
                    </span>
                  ) : (
                    <Input
                      value={line.hsn_code ?? ""}
                      placeholder="9030"
                      onChange={(e) => update(index, { hsn_code: e.target.value })}
                    />
                  )}
                </td>
                <td className="border-b border-border py-2 pr-2 text-right">
                  {readOnly ? (
                    <span className="font-mono tabular-nums">
                      {line.estimated_rate === null ? "—" : formatMoney(line.estimated_rate)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="text-right tabular-nums"
                      placeholder="Rate"
                      value={line.estimated_rate ?? ""}
                      onChange={(e) =>
                        update(index, {
                          estimated_rate: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  )}
                </td>
                <td className="border-b border-border py-2 text-right font-mono tabular-nums text-foreground">
                  {line.estimated_rate === null ? "—" : formatMoney(boqLineAmount(line))}
                </td>
                {!readOnly && (
                  <td className="border-b border-border py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => onChange(lines.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="py-4 text-[13px] text-muted-foreground">
                  No items yet. Add the first one, or leave the bill empty and enter a lump-sum
                  estimate instead.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...lines, emptyBoqLine()])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add an item
          </Button>
        )}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          bill total
        </span>
        <span className="font-mono text-[15px] tabular-nums text-foreground">
          {formatMoney(total)}
        </span>
      </div>
    </div>
  );
}
