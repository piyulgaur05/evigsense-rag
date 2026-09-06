import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAvailableActions, useStageDecision } from "../hooks/useProcurement";
import { DecisionSignature, type AppliedSignature } from "./DecisionSignature";
import type { StageAction } from "../types";

/**
 * What the case can do next. The buttons come from the database — the same
 * rows the SQL guard checks — so the bar can never offer a move the engine
 * would then refuse.
 */
export function StageActionBar({ caseId, caseNo }: { caseId: string; caseNo: string }) {
  const { data: actions, isLoading } = useAvailableActions(caseId);
  const decide = useStageDecision();
  const [remarks, setRemarks] = useState("");
  const [pending, setPending] = useState<StageAction | null>(null);
  // Confirm first, then sign. The two are separate dialogs because they ask
  // different questions — "are you sure" and "put your name to it" — and
  // collapsing them would let a stray Enter key sign something.
  const [signing, setSigning] = useState<StageAction | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Working out what you can do here…
      </div>
    );
  }

  if (!actions?.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-5 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          waiting on someone else
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Nothing at this stage is yours to decide.
        </p>
      </div>
    );
  }

  const destructive = (action: StageAction) => action.action === "reject";

  const record = async (action: StageAction, signature?: AppliedSignature) => {
    try {
      await decide.mutateAsync({
        caseId,
        actionCode: action.code,
        remarks: remarks.trim() || undefined,
        // The engine reads the signature out of the payload and writes it to
        // procurement_case_signatures; it refuses the action outright if a
        // requires_signature move arrives without one.
        payload: signature ? { signature } : undefined,
      });
      toast.success(`${caseNo} — ${action.label.toLowerCase()}`);
      setRemarks("");
    } catch {
      // useStageDecision already surfaced the database's message.
    } finally {
      setPending(null);
      setSigning(null);
    }
  };

  /**
   * Confirming an unsigned action records it; confirming a signed one hands
   * over to the signature dialog, which records it once the mark is made.
   */
  const confirm = () => {
    if (!pending) return;
    if (pending.requires_signature) {
      setSigning(pending);
      setPending(null);
      return;
    }
    void record(pending);
  };

  const remarksMissing = Boolean(pending?.requires_remarks) && remarks.trim().length === 0;

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          your decision
        </p>

        <div className="mt-3">
          <Label htmlFor="stage-remarks" className="text-[13px]">
            Remarks
          </Label>
          <Textarea
            id="stage-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="What you decided and why. This goes on the record."
            className="mt-1.5 text-[13px]"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.code}
              size="sm"
              variant={destructive(action) ? "destructive" : action.sort_order <= 10 ? "default" : "outline"}
              onClick={() => setPending(action)}
              title={action.description ?? undefined}
            >
              {action.label}
              {/* Said before the press, not after: a decision that will ask for
                  a signature should not surprise anybody mid-flow. */}
              {action.requires_signature && (
                <PenLine className="ml-1.5 h-3.5 w-3.5 opacity-70" aria-label="needs your signature" />
              )}
            </Button>
          ))}
        </div>
      </div>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description} This is recorded against {caseNo} under your name.
              {pending?.requires_signature ? " You will be asked to sign it." : ""}
              {remarksMissing ? " Remarks are required before you can go ahead." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remarksMissing || decide.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              {decide.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {pending?.requires_signature ? "Continue to sign" : pending?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DecisionSignature
        open={Boolean(signing)}
        actionLabel={signing?.label ?? ""}
        caseNo={caseNo}
        busy={decide.isPending}
        onCancel={() => setSigning(null)}
        onSigned={(signature) => signing && void record(signing, signature)}
      />
    </>
  );
}
