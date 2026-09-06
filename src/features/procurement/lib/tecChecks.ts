import type { FormCheck } from "./formChecks";

/**
 * What stands between the committee and recommending the case for commercial
 * evaluation. The mirror of `procurement_guard_tec_ready`, for the same
 * reason `tenderChecks` mirrors its own guard: the database only knows after
 * a write, which is exactly when the chair has stopped looking at the screen.
 * Change the guard, change this.
 *
 * Deliberately the only rule. The checklist and the member evaluations are
 * real work at this desk, but neither gates the recommend action — the
 * reference this stage is modelled on leaves both to the chair's judgement,
 * and a case should not be stuck here because one committee member never
 * logged in to submit a reading.
 */
export function tecChecks(state: { anyoneQualified: boolean }): FormCheck[] {
  return [
    {
      id: "qualified",
      label: "Mark at least one bidder qualified",
      step: 1,
      fieldId: "tec-bidders",
      done: state.anyoneQualified,
    },
  ];
}
