/**
 * What a requisition needs before finance will see it — computed in the browser.
 *
 * The database already answers this twice: `procurement_guard_requisition_ready`
 * refuses `mpr.submit` without it, and `procurement_requisition_gaps` lists what
 * is missing. Both are authoritative and neither is going anywhere. What they
 * cannot do is answer *while somebody is typing* — they read committed rows, so
 * a checklist driven by them only moves after a save, which is exactly when a
 * requester has stopped looking at it.
 *
 * So the same four rules live here as well, against the unsaved form state, and
 * they must not drift:
 *
 *   c.title        <> ''      AND
 *   c.department_id IS NOT NULL AND
 *   r.required_by  IS NOT NULL AND
 *   c.estimated_cost > 0
 *
 * Change the guard, change this. The client copy decides what the form paints
 * red or green; the database copy still decides whether the case actually moves,
 * so a stale copy here is a cosmetic bug, never a way past the gate.
 */

import type { FormCheck } from "./formChecks";

// Counting, painting and jumping to a missing field is the same job on every
// form, so it lives in ./formChecks. Re-exported here so nothing that already
// imported it from this module had to change.
export { focusField, outstanding, requiredRing, stepOutstanding } from "./formChecks";
export type { FormCheck } from "./formChecks";

export type CheckId = "title" | "department" | "requiredBy" | "cost";

/** The shape is shared now; the name stays so existing imports keep reading. */
export type RequisitionCheck = FormCheck;

export type RequisitionState = {
  title: string;
  departmentId: string;
  requiredBy: string;
  /** The figure actually being raised — bill total or the typed one. */
  effectiveCost: number;
};

export function requisitionChecks(state: RequisitionState): RequisitionCheck[] {
  return [
    {
      id: "title",
      label: "Give it a title",
      step: 1,
      fieldId: "req-title",
      done: state.title.trim().length > 0,
    },
    {
      id: "department",
      label: "Pick the department",
      step: 1,
      fieldId: "req-department",
      done: state.departmentId.trim().length > 0,
    },
    {
      id: "requiredBy",
      label: "Say when it is needed by",
      step: 1,
      fieldId: "req-required-by",
      done: state.requiredBy.trim().length > 0,
    },
    {
      id: "cost",
      label: "Put a value on it",
      step: 3,
      fieldId: "req-cost",
      done: Number.isFinite(state.effectiveCost) && state.effectiveCost > 0,
    },
  ];
}
