import type { Lookup } from "../types";

/**
 * The master data catalogue.
 *
 * Every list a requisition picks from is a row in `procurement_lookups`, keyed
 * by `kind` — one table rather than seven, because they all have the same
 * shape and the only thing that differs is where they surface. This config is
 * what turns a `kind` string into a screen: what to call it, whether a code
 * means anything for it, and which parts of the portal read it.
 *
 * `usedIn` is not decoration. Master data is edited by somebody who cannot see
 * the consequences from the admin screen, so naming the forms a list feeds is
 * the difference between a considered rename and a surprise three stages later.
 */
export type LookupKind =
  | "department"
  | "category"
  | "cost_centre"
  | "procurement_type"
  | "priority"
  | "unit"
  | "warehouse";

export type MasterDataCategory = {
  kind: LookupKind;
  /** Plural, for the sidebar and the table heading. */
  label: string;
  /** Singular, for buttons and the empty state. */
  singular: string;
  /** What the optional `code` column means here. Omitted where a code is meaningless. */
  codeLabel?: string;
  /** Where in the portal this list is read. */
  usedIn: string[];
  hint: string;
};

export const MASTER_DATA_CATEGORIES: MasterDataCategory[] = [
  {
    kind: "department",
    label: "Departments",
    singular: "Department",
    codeLabel: "Dept code",
    usedIn: ["Requisition", "Register filter", "Budget heads", "Insights"],
    hint: "The department a case belongs to. Also what the register and the insights page group by, so a rename here re-labels historic cases.",
  },
  {
    kind: "category",
    label: "Material categories",
    singular: "Material category",
    usedIn: ["Requisition", "Budget heads"],
    hint: "What kind of thing is being bought. Picked on the requisition and available to scope a budget head.",
  },
  {
    kind: "cost_centre",
    label: "Cost centres",
    singular: "Cost centre",
    codeLabel: "Code",
    usedIn: ["Requisition"],
    hint: "The internal account the spend is booked against. Recorded on the requisition; the budget head is what actually carries the money.",
  },
  {
    kind: "procurement_type",
    label: "Procurement types",
    singular: "Procurement type",
    usedIn: ["Requisition"],
    hint: "Goods, services, works, rate contract, and so on — the route the purchase takes.",
  },
  {
    kind: "priority",
    label: "Priorities",
    singular: "Priority",
    usedIn: ["Requisition"],
    hint: "How urgent the requester says it is. Nothing in the engine acts on it; the SLA per stage is set in the stage config, not here.",
  },
  {
    kind: "unit",
    label: "Units of measure",
    singular: "Unit",
    usedIn: ["Bill of quantities"],
    hint: "The unit each bill-of-quantities line is counted in. Kept short — Nos., Kg, Set — because it sits inside a table cell.",
  },
  {
    kind: "warehouse",
    label: "Delivery points",
    singular: "Delivery point",
    codeLabel: "WH code",
    usedIn: ["Requisition", "Goods receipt"],
    hint: "Where the goods are to be delivered, and where stores later records what arrived.",
  },
];

export function categoryFor(kind: string): MasterDataCategory | undefined {
  return MASTER_DATA_CATEGORIES.find((category) => category.kind === kind);
}

/** Groups a flat lookup list by kind so the screen can count each category. */
export function countByKind(rows: Lookup[] | undefined): Record<string, { active: number; total: number }> {
  const counts: Record<string, { active: number; total: number }> = {};
  for (const row of rows ?? []) {
    const bucket = (counts[row.kind] ??= { active: 0, total: 0 });
    bucket.total += 1;
    if (row.active) bucket.active += 1;
  }
  return counts;
}

/**
 * Parses a pasted block into draft entries.
 *
 * Master data arrives as a column out of a spreadsheet far more often than it
 * is typed one row at a time, so a paste box beats fifteen trips through a
 * dialog. `name, code` on a line is honoured; a bare name is fine too, which is
 * what most of these lists are.
 */
export function parseBulkEntries(text: string): { name: string; code: string | null }[] {
  const seen = new Set<string>();
  const entries: { name: string; code: string | null }[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Tab first: a spreadsheet paste is tab-separated, and a name may itself
    // contain a comma ("Stores, Central").
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const name = (parts[0] ?? "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const code = (parts[1] ?? "").trim();
    entries.push({ name, code: code || null });
  }

  return entries;
}
