import type { TecChecklistItemKey, TecChecklistStatus, TecComplianceStatus } from "../types";

/**
 * How the committee's coded columns read on screen. Kept here for the same
 * reason `lib/tender.ts` exists — the checklist, the evaluation form and the
 * consensus summary should all say the same words for the same value.
 */

export const TEC_CHECKLIST_ITEMS: { key: TecChecklistItemKey; label: string; hint: string }[] = [
  {
    key: "specs_match_requisition",
    label: "Specs match the requisition",
    hint: "What was floated is what was actually asked for.",
  },
  {
    key: "mandatory_documents",
    label: "Mandatory documents are in",
    hint: "Registrations, certificates, whatever the notice required.",
  },
  {
    key: "delivery_feasible",
    label: "Delivery and scope are feasible",
    hint: "The timeline and quantities are realistic for what was quoted.",
  },
  {
    key: "eligibility_verified",
    label: "Eligibility is verified",
    hint: "Turnover, past work, authorisations — whatever the notice asked bidders to show.",
  },
];

export function tecChecklistItemLabel(key: string): string {
  return TEC_CHECKLIST_ITEMS.find((entry) => entry.key === key)?.label ?? key;
}

export const TEC_CHECKLIST_STATUS_LABEL: Record<TecChecklistStatus, string> = {
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  clarify: "Needs clarification",
};

export const TEC_COMPLIANCE_LABEL: Record<TecComplianceStatus, string> = {
  pending: "Pending",
  compliant: "Compliant",
  non_compliant: "Non-compliant",
};

/**
 * Words, not just colour, for the consensus a chair sees against each bidder.
 * Only `--ok` and `--destructive` are meant to carry state in this design
 * system, so the middle ground is muted foreground rather than a third colour
 * invented for this one screen.
 */
export function consensusTier(qualifiedPct: number | null): { label: string; tone: "ok" | "muted" | "destructive" } {
  if (qualifiedPct === null) return { label: "No readings yet", tone: "muted" };
  if (qualifiedPct >= 80) return { label: "Strong support", tone: "ok" };
  if (qualifiedPct >= 50) return { label: "Mixed support", tone: "muted" };
  return { label: "Little support", tone: "destructive" };
}
