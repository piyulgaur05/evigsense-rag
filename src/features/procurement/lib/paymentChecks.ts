import type { FormCheck } from "./formChecks";

/**
 * What stands between the payment recommendation and clearing it. The
 * mirror of `procurement_payment_gaps` — change the database function,
 * change this.
 */
export function paymentChecks(state: {
  hasInvoiceNumber: boolean;
  hasInvoiceDate: boolean;
  hasInvoiceAmount: boolean;
}): FormCheck[] {
  return [
    {
      id: "invoice-number",
      label: "Record the invoice number",
      step: 1,
      fieldId: "payment-details",
      done: state.hasInvoiceNumber,
    },
    {
      id: "invoice-date",
      label: "Record the invoice date",
      step: 1,
      fieldId: "payment-details",
      done: state.hasInvoiceDate,
    },
    {
      id: "invoice-amount",
      label: "Record the invoice amount",
      step: 1,
      fieldId: "payment-details",
      done: state.hasInvoiceAmount,
    },
  ];
}
