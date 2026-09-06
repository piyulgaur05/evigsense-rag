import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequiredLabel } from "./ReadinessChecklist";
import { requiredRing } from "../lib/formChecks";

/**
 * The furniture every stage form is built from.
 *
 * Lifted out of `RequisitionEditor` when the tender form needed the same
 * shapes. Sharing the components rather than copying them is what keeps the two
 * forms looking like one product: a requester who has raised a requisition and
 * then sees a tender should not have to learn a second set of conventions for
 * "this field is still needed".
 */

export const NONE = "none";

/** A `Select` sends "none" rather than an empty string; the row wants NULL. */
export const pickLookup = (value: string) => (value === NONE || value === "" ? null : value);

/**
 * A step of the form.
 *
 * `outstanding` is how many of this step's required fields are still empty —
 * undefined for a step that requires nothing, which is why the optional steps
 * stay quiet rather than showing a reassuring green tick they have not earned.
 */
export function FormSection({
  label,
  title,
  hint,
  outstanding,
  action,
  children,
}: {
  label: string;
  title: string;
  hint?: string;
  outstanding?: number;
  /** Sits beside the heading, for a section that has one thing it can do. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card",
        outstanding && outstanding > 0 ? "border-destructive/30" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{hint}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {action}
          {outstanding !== undefined && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                outstanding > 0 ? "bg-destructive/10 text-destructive" : "bg-ok/10 text-ok",
              )}
            >
              {outstanding > 0 ? (
                `${outstanding} to fill in`
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  done
                </>
              )}
            </span>
          )}
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export function LookupField({
  id,
  label,
  value,
  options,
  placeholder,
  required,
  disabled,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  options: { id: string; name: string }[];
  placeholder: string;
  /** Required fields carry the "needed" chip and the red ring while empty. */
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const filled = Boolean(value);
  return (
    <div>
      {required ? (
        <RequiredLabel htmlFor={id} done={filled}>
          {label}
        </RequiredLabel>
      ) : (
        <Label htmlFor={id} className="text-[13px]">
          {label}
        </Label>
      )}
      <Select value={value || NONE} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className={cn("mt-1.5", required && requiredRing(filled))}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {/* A required field offers no way back to "not stated": clearing it
              would only put the case back behind the gate it just passed. */}
          {!required && <SelectItem value={NONE}>Not stated</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A read-only fact, as the stage summaries show them. */
export function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] text-foreground">{value}</p>
    </div>
  );
}
