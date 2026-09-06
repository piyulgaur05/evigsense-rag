import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  focusField,
  outstanding,
  type FormCheck,
} from "../lib/formChecks";

/**
 * What is still missing, and where it lives.
 *
 * The old version listed the database's gap strings in a grey box at the top of
 * a long form — accurate, and useless: it named "The date it is needed by"
 * without saying which of the four sections held that field, and it only
 * refreshed after a save. Each row here is a button that scrolls to the field
 * and focuses it, and the state comes from the live form, so a row goes green
 * as the requester types rather than when they next press Save.
 *
 * Colour never carries the meaning alone: done is a green tick, outstanding is
 * a red ring plus the word, and the count is written out.
 */
export function ReadinessChecklist({
  checks,
  serverGaps,
  completeMessage = "Everything finance needs is here.",
  hint = "Pick one to jump to the field. Everything else on this page is optional — finance will ask if they need more.",
  saveLabel = "Save the requisition",
  className,
}: {
  checks: FormCheck[];
  /**
   * What `procurement_requisition_gaps` last said, for the one case the client
   * copy cannot cover: the two lists disagreeing. That means either an edit
   * that has not been saved yet, or the client rules having drifted from the
   * guard — and the guard is the one that decides, so it gets the last word on
   * screen rather than letting the requester meet a refusal with no reason.
   */
  serverGaps?: string[];
  /** What the box says once nothing is left. Names the desk that is waiting. */
  completeMessage?: string;
  /** The line under the list, for whatever is optional on this particular form. */
  hint?: string;
  /** What the button that saves this form is called, for the disagreement note. */
  saveLabel?: string;
  className?: string;
}) {
  const open = outstanding(checks);
  const done = checks.length - open.length;
  const complete = open.length === 0;
  const serverDisagrees = complete && (serverGaps?.length ?? 0) > 0;

  return (
    <section
      className={cn(
        "rounded-lg border bg-card px-5 py-4",
        complete ? "border-ok/40" : "border-destructive/40",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        {complete ? (
          <Check className="h-4 w-4 shrink-0 text-ok" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <p className="text-[13px] font-medium text-foreground">
          {complete
            ? completeMessage
            : `${open.length} of ${checks.length} still to fill in`}
        </p>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {done}/{checks.length} done
        </span>
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.id}>
            <button
              type="button"
              onClick={() => focusField(check.fieldId)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                check.done
                  ? "text-muted-foreground hover:bg-accent"
                  : "text-foreground hover:bg-accent",
              )}
            >
              {check.done ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
              ) : (
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-destructive"
                />
              )}
              <span className={cn(check.done && "line-through decoration-muted-foreground/50")}>
                {check.label}
              </span>
              {!check.done && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  step {check.step}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {!complete && (
        <p className="mt-2 px-2 text-[12px] text-muted-foreground">{hint}</p>
      )}

      {serverDisagrees && (
        <p className="mt-2 px-2 text-[12px] text-destructive">
          Saved copy still missing: {serverGaps?.join(", ").toLowerCase()}. Press{" "}
          <span className="font-medium">{saveLabel}</span> — the checklist above reads
          what is on screen, and the case moves on what has been saved.
        </p>
      )}
    </section>
  );
}

/** A label that says whether its field is still needed, in words and in colour. */
export function RequiredLabel({
  htmlFor,
  children,
  done,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-medium leading-none text-foreground peer-disabled:opacity-70"
      >
        {children}
      </label>
      {done ? (
        <Check className="h-3.5 w-3.5 text-ok" aria-label="filled in" />
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
          needed
        </span>
      )}
    </div>
  );
}
