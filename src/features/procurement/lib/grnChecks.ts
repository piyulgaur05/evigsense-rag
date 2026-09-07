import type { FormCheck } from "./formChecks";

/**
 * What stands between the current delivery and closing it. The mirror of
 * `procurement_grn_close_cycle_gaps` — change the database function, change
 * this. Forwarding to payment has no rules of its own beyond "the current
 * cycle is closed," which the panel reads directly off the cycle's status
 * rather than duplicating here.
 */
export function grnCloseChecks(state: {
  hasDelivery: boolean;
  fullyClassified: boolean;
}): FormCheck[] {
  return [
    {
      id: "has-delivery",
      label: "Record at least one line actually delivered",
      step: 1,
      fieldId: "grn-lines",
      done: state.hasDelivery,
    },
    {
      id: "fully-classified",
      label: "Classify every delivered line as accepted or rejected",
      step: 1,
      fieldId: "grn-lines",
      done: state.fullyClassified,
    },
  ];
}
