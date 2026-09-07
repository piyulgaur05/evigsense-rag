import type {
  CommercialCompliance,
  CstScrutinyItemKey,
  JustificationReason,
  QuoteScheduleIssueCode,
  RankingBasis,
  ReasonablenessStatus,
} from "../types";

/**
 * How the commercial desk's coded columns read on screen. Kept here for the
 * same reason `lib/tec.ts` exists — the roster, the schedule import, and the
 * statement should all say the same words for the same value.
 */

export const RANKING_BASIS_LABEL: Record<RankingBasis, string> = {
  evaluated_cost: "Evaluated cost",
  base_price: "Base price",
  weighted_score: "Weighted score",
};

export const COMMERCIAL_COMPLIANCE_LABEL: Record<CommercialCompliance, string> = {
  pending: "Pending",
  compliant: "Compliant",
  conditionally_compliant: "Conditionally compliant",
  non_compliant: "Non-compliant",
};

export const QUOTE_ISSUE_LABEL: Record<QuoteScheduleIssueCode, string> = {
  unmatched_row: "Not on the published bill",
  missing_line: "A published line was not priced",
  missing_rate: "Priced with no rate",
  quantity_mismatch: "Quantity disagrees with the published bill",
  amount_mismatch: "Amount disagrees with quantity × rate",
  duplicate_line: "The same line priced twice",
  total_mismatch: "The sheet's own total does not add up",
};

export const JUSTIFICATION_REASON_LABEL: Record<JustificationReason, string> = {
  delivery_lead_time: "Delivery lead time",
  lifecycle_cost_benefit: "Lifecycle cost benefit",
  oem_support_availability: "OEM support availability",
  risk_mitigation_split: "Risk mitigation / split award",
  technical_warranty_superiority: "Technical or warranty superiority",
  non_responsiveness_rejection: "Non-responsiveness of the lower bidder",
  budget_excess: "Budget excess otherwise justified",
  other: "Other (state in the remarks)",
};

export const CST_SCRUTINY_ITEMS: { key: CstScrutinyItemKey; label: string; hint: string }[] = [
  {
    key: "arithmetic_verified",
    label: "Arithmetic verified",
    hint: "Every rate, tax and total on the statement checks out.",
  },
  {
    key: "taxes_and_loadings_consistent",
    label: "Taxes and loadings are consistent",
    hint: "The same basis applied to every bidder, and every loading carries a stated reason.",
  },
  {
    key: "terms_brought_to_par",
    label: "Terms brought to par",
    hint: "Delivery, warranty and payment terms are comparable across bidders, not just their prices.",
  },
  {
    key: "estimate_comparison_recorded",
    label: "Comparison against the estimate recorded",
    hint: "The reasonableness position is on file, not just visible on screen.",
  },
  {
    key: "deviations_documented",
    label: "Deviations documented",
    hint: "Anything a bidder quoted differently from the published bill is written down.",
  },
];

/** Words, not just colour, for the reasonableness position — `--ok` and
 * `--destructive` are the only two tokens meant to carry state here. */
export function reasonablenessTier(
  status: ReasonablenessStatus | null,
): { label: string; tone: "ok" | "muted" | "destructive" } {
  if (status === "within") return { label: "Within the estimate", tone: "ok" };
  if (status === "over") return { label: "Over the estimate", tone: "destructive" };
  return { label: "No estimate on file", tone: "muted" };
}
