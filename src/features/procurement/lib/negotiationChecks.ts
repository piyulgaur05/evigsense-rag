import type { FormCheck } from "./formChecks";

/**
 * What stands between a negotiation and "agreement reached". The mirror of
 * `procurement_pnc_agreement_gaps` — change the database function, change
 * this.
 */
export function negotiationChecks(state: {
  mandateRecorded: boolean;
  hasObjective: boolean;
  noOpenRound: boolean;
  hasAgreedRound: boolean;
}): FormCheck[] {
  return [
    {
      id: "mandate-recorded",
      label: "Record why the committee is negotiating",
      step: 1,
      fieldId: "pnc-mandate",
      done: state.mandateRecorded,
    },
    {
      id: "has-objective",
      label: "Add at least one negotiation objective",
      step: 1,
      fieldId: "pnc-mandate",
      done: state.hasObjective,
    },
    {
      id: "no-open-round",
      label: "Close the open round",
      step: 2,
      fieldId: "pnc-rounds",
      done: state.noOpenRound,
    },
    {
      id: "has-agreed-round",
      label: "Record the terms both sides agreed to",
      step: 2,
      fieldId: "pnc-rounds",
      done: state.hasAgreedRound,
    },
  ];
}
