/**
 * The shared half of the readiness checklists.
 *
 * Every stage that has a gate in the database wants the same thing in front of
 * it: a list of what is still missing, computed against the form as it is being
 * typed rather than against committed rows. The rules differ per stage — those
 * live in `requisitionChecks.ts`, `tenderChecks.ts` and whatever follows — but
 * counting them, painting them and jumping to them does not.
 *
 * These four functions started life in `requisitionChecks.ts` and moved here
 * when the tender form needed them. That file re-exports them, so nothing that
 * imported them before had to change.
 */

export type FormCheck = {
  id: string;
  /** Imperative, because it is read as an instruction in the checklist. */
  label: string;
  /** Which section of the form carries the field, for "Step 1 · 2 left". */
  step: number;
  /** DOM id of the control, so the checklist row can jump straight to it. */
  fieldId: string;
  done: boolean;
};

export function outstanding(checks: FormCheck[]): FormCheck[] {
  return checks.filter((check) => !check.done);
}

/** How many of a given step's requirements are still open. */
export function stepOutstanding(checks: FormCheck[], step: number): number {
  return checks.filter((check) => check.step === step && !check.done).length;
}

/**
 * The ring a required control wears while it is empty.
 *
 * Applied to the control itself rather than a wrapper so it survives the
 * component's own focus styles, and kept subtle — a form that shouts in red
 * before anybody has typed anything reads as broken rather than unfinished.
 */
export function requiredRing(done: boolean): string {
  return done ? "" : "border-destructive/60 focus-visible:ring-destructive/40";
}

/**
 * Scrolls a field into view and focuses it.
 *
 * The checklist is at the top of a long page and names things that are several
 * screens down; without this it tells the reader what is wrong and leaves them
 * to hunt for it, which is the complaint that prompted the whole change.
 */
export function focusField(fieldId: string): void {
  const element = document.getElementById(fieldId);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  // The scroll is animated; focusing immediately fights it in Safari and
  // Firefox, which both re-scroll on focus.
  window.setTimeout(() => element.focus({ preventScroll: true }), 320);
}
