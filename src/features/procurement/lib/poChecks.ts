import type { FormCheck } from "./formChecks";

/**
 * What stands between the order and issuing it. The mirror of
 * `procurement_po_gaps` — change the database function, change this.
 */
export function poChecks(state: {
  hasDeliveryDate: boolean;
  hasDeliveryAddress: boolean;
  hasPaymentTerms: boolean;
  hasLines: boolean;
}): FormCheck[] {
  return [
    {
      id: "delivery-date",
      label: "Set the delivery date",
      step: 1,
      fieldId: "po-details",
      done: state.hasDeliveryDate,
    },
    {
      id: "delivery-address",
      label: "Give a delivery address",
      step: 1,
      fieldId: "po-details",
      done: state.hasDeliveryAddress,
    },
    {
      id: "payment-terms",
      label: "State the payment terms",
      step: 1,
      fieldId: "po-details",
      done: state.hasPaymentTerms,
    },
    {
      id: "lines",
      label: "Have at least one order line",
      step: 1,
      fieldId: "po-lines",
      done: state.hasLines,
    },
  ];
}
