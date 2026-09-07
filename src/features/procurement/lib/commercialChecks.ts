import type { FormCheck } from "./formChecks";

/**
 * What stands between the commercial desk and drawing up the comparative
 * statement. The mirror of `procurement_commercial_gaps` — change the
 * database function, change this.
 */
export function commercialChecks(state: {
  openingApproved: boolean;
  anyoneRankable: boolean;
  everyBidCalled: boolean;
  scheduleCurrent: boolean;
}): FormCheck[] {
  return [
    {
      id: "opening-approved",
      label: "Get the head of division to approve opening the bids",
      step: 1,
      fieldId: "commercial-opening",
      done: state.openingApproved,
    },
    {
      id: "rankable",
      label: "Price at least one bid",
      step: 2,
      fieldId: "commercial-bidders",
      done: state.anyoneRankable,
    },
    {
      id: "compliance-called",
      label: "Call commercial compliance on every bid received",
      step: 2,
      fieldId: "commercial-bidders",
      done: state.everyBidCalled,
    },
    {
      id: "schedule-current",
      label: "Re-read the price schedule — a corrigendum changed the published bill",
      step: 2,
      fieldId: "commercial-bidders",
      done: state.scheduleCurrent,
    },
  ];
}
