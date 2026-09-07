import type { FormCheck } from "./formChecks";

/**
 * What stands between the purchase proposal and the approving authority's
 * decision. The mirror of `procurement_proposal_gaps` — change the database
 * function, change this.
 */
export function proposalChecks(state: { hasRecommendation: boolean }): FormCheck[] {
  return [
    {
      id: "recommendation",
      label: "Write the recommendation for the approving authority",
      step: 1,
      fieldId: "proposal-recommendation",
      done: state.hasRecommendation,
    },
  ];
}
