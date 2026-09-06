import type { FormCheck } from "./formChecks";
import type { TenderMode, TenderStatus } from "../types";

/**
 * What a tender needs before the case may leave the tender desk.
 *
 * The mirror of `procurement_guard_tender_ready`, for the same reason
 * `requisitionChecks` mirrors its guard: the database reads committed rows and
 * so can only answer after a save, which is exactly when the officer has
 * stopped looking. Change the guard, change this. The database copy still
 * decides whether the case actually moves, so a stale copy here is a cosmetic
 * bug and never a way past the gate.
 *
 * Three of these rules are conditional on the mode, and they are left out of
 * the array entirely when the mode does not oblige them rather than being
 * listed as already satisfied. That way "3 of 7 still to fill in" changes as
 * the mode changes, which is the honest count — an open tender is not a
 * portal tender with two boxes ticked for free.
 */

export type TenderState = {
  mode: TenderMode;
  status: TenderStatus | null;
  referenceNo: string;
  portalReference: string;
  singleJustification: string;
  bidEndAt: string;
  inviteeCount: number;
  /** Bids on file with status 'received'. */
  bidderCount: number;
  /** Of those, how many have no amount against them. */
  bidsMissingAmount: number;
};

export function tenderChecks(state: TenderState): FormCheck[] {
  const checks: FormCheck[] = [
    {
      id: "reference",
      label: "Give the tender a reference number",
      step: 1,
      fieldId: "tender-reference",
      done: state.referenceNo.trim().length > 0,
    },
  ];

  if (state.mode === "gem" || state.mode === "eprocurement") {
    checks.push({
      id: "portal",
      label: "Record the number the portal gave it",
      step: 1,
      fieldId: "tender-portal-reference",
      done: state.portalReference.trim().length > 0,
    });
  }

  if (state.mode === "limited" || state.mode === "single") {
    checks.push({
      id: "invitees",
      label: "Name at least one invited vendor",
      step: 1,
      fieldId: "tender-invitees",
      done: state.inviteeCount > 0,
    });
  }

  if (state.mode === "single") {
    checks.push({
      id: "justification",
      label: "Justify going to a single source",
      step: 1,
      fieldId: "tender-justification",
      done: state.singleJustification.trim().length > 0,
    });
  }

  checks.push({
    id: "bidEnd",
    label: "Set the bid submission deadline",
    step: 2,
    fieldId: "tender-bid-end",
    done: state.bidEndAt.trim().length > 0,
  });

  // Server state rather than form state, so its `done` comes off the loaded
  // tender. It still belongs in the list: it is a thing standing between this
  // case and the committee, and the reader is looking at it on screen.
  checks.push({
    id: "floated",
    label: "Float the tender",
    step: 4,
    fieldId: "tender-lifecycle",
    done: state.status !== null && state.status !== "draft" && state.status !== "ready",
  });

  // Closing bidding is deliberately absent. The hand-off closes it, which is
  // what its own description has always promised; listing it here made a step
  // the button performs look like a step blocking the button, and the officer
  // who pressed the button the description told them to press was refused for
  // not having pressed a different one first.

  checks.push({
    id: "bidders",
    label: "Record at least one bid",
    step: 5,
    fieldId: "tender-bidders",
    done: state.bidderCount > 0,
  });

  checks.push({
    id: "amounts",
    label: "Put an amount against every bid",
    step: 5,
    fieldId: "tender-bidders",
    done: state.bidderCount > 0 && state.bidsMissingAmount === 0,
  });

  return checks;
}
