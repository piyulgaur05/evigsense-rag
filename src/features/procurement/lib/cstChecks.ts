import type { FormCheck } from "./formChecks";

/**
 * What stands between the comparative statement and being placed before the
 * purchase committee. The mirror of `procurement_cst_gaps` — change the
 * database function, change this.
 *
 * Order matters here the same way it matters in the database: the statement
 * has to be generated (frozen for review) before the purchase officer and
 * finance can approve it, and both of those have to approve before the
 * commercial team's own recommendation — the "commercial acceptance" — can be
 * recorded at all. The head of division's sign-off is the last gate, after
 * the recommendation exists.
 */
export function cstChecks(state: {
  statementGenerated: boolean;
  purchaseOfficerApproved: boolean;
  financeApproved: boolean;
  hasRecommendation: boolean;
  overrideJustified: boolean;
  authorityCleared: boolean;
  signedOff: boolean;
}): FormCheck[] {
  return [
    {
      id: "statement-generated",
      label: "Generate the comparative statement",
      step: 1,
      fieldId: "cst-approvals",
      done: state.statementGenerated,
    },
    {
      id: "purchase-officer-approved",
      label: "Get the purchase officer's approval",
      step: 1,
      fieldId: "cst-approvals",
      done: state.purchaseOfficerApproved,
    },
    {
      id: "finance-approved",
      label: "Get finance's approval",
      step: 1,
      fieldId: "cst-approvals",
      done: state.financeApproved,
    },
    {
      id: "recommendation",
      label: "Accept a bidder (or another outcome)",
      step: 2,
      fieldId: "cst-recommendation",
      done: state.hasRecommendation,
    },
    {
      id: "override-justified",
      label: "Justify recommending other than L1",
      step: 2,
      fieldId: "cst-recommendation",
      done: state.overrideJustified,
    },
    {
      id: "authority-cleared",
      label: "Get the competent authority's clearance",
      step: 2,
      fieldId: "cst-recommendation",
      done: state.authorityCleared,
    },
    {
      id: "signed-off",
      label: "Get the head of division's sign-off",
      step: 3,
      fieldId: "cst-signoff",
      done: state.signedOff,
    },
  ];
}
