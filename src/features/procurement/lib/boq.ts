import type { BoqDraftLine } from "../api/requisition";

/** A blank line, so "add an item" always starts from something valid. */
export const emptyBoqLine = (): BoqDraftLine => ({
  item_name: "",
  specification: null,
  quantity: 1,
  unit: null,
  hsn_code: null,
  estimated_rate: null,
});

export function boqLineAmount(line: BoqDraftLine): number {
  return Math.round(line.quantity * (line.estimated_rate ?? 0) * 100) / 100;
}

export function boqTotal(lines: BoqDraftLine[]): number {
  return lines.reduce((sum, line) => sum + boqLineAmount(line), 0);
}

/** A line is only worth saving once it says what the item is. */
export function boqIssues(lines: BoqDraftLine[]): string[] {
  const named = lines.filter((line) => line.item_name.trim().length > 0);
  const issues: string[] = [];
  if (named.length < lines.length) issues.push("Every line needs an item name.");
  if (named.some((line) => !(line.quantity > 0))) {
    issues.push("Every line needs a quantity above zero.");
  }
  return issues;
}

