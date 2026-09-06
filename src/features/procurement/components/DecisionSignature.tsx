import { useEffect, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useDeleteMySignature,
  useMySignature,
  useSaveMySignature,
} from "../hooks/useProcurement";
import type { SignatureKind } from "../api/signatures";

export type AppliedSignature = { image: string; kind: SignatureKind };

/**
 * The signature a decision carries.
 *
 * Fourteen actions are marked `requires_signature` and the engine now refuses
 * them without one, so this is a gate rather than a flourish. It stays out of
 * the action bar and opens over it: signing is a deliberate act, and a pad
 * sitting permanently inside the page invites a scribble in passing.
 *
 * Two states. Somebody who has saved a signature is shown it and signs in one
 * press — a finance officer clearing six budgets in a morning should not draw
 * their name six times. Everybody else gets the pad, with a tick to keep what
 * they drew for next time. "Sign differently this once" is always available,
 * and never overwrites what was saved unless the tick is set.
 */
export function DecisionSignature({
  open,
  actionLabel,
  caseNo,
  busy,
  onCancel,
  onSigned,
}: {
  open: boolean;
  /** Named on the button, so nobody signs "Sign Document" for a budget clearance. */
  actionLabel: string;
  caseNo: string;
  busy?: boolean;
  onCancel: () => void;
  onSigned: (signature: AppliedSignature) => void;
}) {
  const { user } = useAuth();
  const { data: saved, isLoading } = useMySignature();
  const saveSignature = useSaveMySignature();
  const forget = useDeleteMySignature();

  const [drawing, setDrawing] = useState(false);
  const [keepForNextTime, setKeepForNextTime] = useState(true);

  // Reopening after a decision should offer the saved signature again rather
  // than leaving the pad open from last time.
  useEffect(() => {
    if (open) setDrawing(false);
  }, [open]);

  const offerSaved = Boolean(saved && saved.use_by_default) && !drawing;

  const signWithSaved = () => {
    if (!saved) return;
    onSigned({ image: saved.image, kind: saved.kind });
  };

  const signWithNew = async (image: string, kind: SignatureKind) => {
    // Saved before the decision is recorded on purpose: if the engine refuses
    // the decision, the signer should not also lose the signature they drew.
    if (keepForNextTime && user) {
      try {
        await saveSignature.mutateAsync({
          userId: user.id,
          image,
          kind,
          useByDefault: true,
        });
      } catch {
        // useSaveMySignature reported it; the decision can still be signed.
      }
    }
    onSigned({ image, kind });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            Sign — {actionLabel}
          </DialogTitle>
          <DialogDescription>
            This signature is recorded against {caseNo} with your name and the time, and everyone
            who can see the case can see it. It cannot be edited or withdrawn afterwards.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : offerSaved && saved ? (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                your signature
              </p>
              <div className="mt-2 rounded-lg border border-border bg-white p-4 text-center">
                <img
                  src={saved.image}
                  alt="Your saved signature"
                  className="mx-auto max-h-28 object-contain"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDrawing(true)} disabled={busy}>
                Sign differently this once
              </Button>
              <Button className="ml-auto" onClick={signWithSaved} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {actionLabel}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground hover:text-destructive"
                disabled={busy || forget.isPending || !user}
                onClick={() => user && forget.mutate(user.id)}
              >
                Forget this signature
              </Button>
            </div>
          </div>
        ) : (
          <SignaturePad
            bare
            submitLabel={actionLabel}
            onCancel={onCancel}
            onSave={(image, kind) => void signWithNew(image, kind)}
            extra={
              <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <Checkbox
                  id="keep-signature"
                  checked={keepForNextTime}
                  onCheckedChange={(checked) => setKeepForNextTime(checked === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="keep-signature"
                  className="cursor-pointer text-[13px] font-normal leading-snug"
                >
                  Keep this signature and use it by default next time
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    Stored against your account only. Replacing it later does not change anything
                    you have already signed, and you can remove it from the signing dialog.
                  </span>
                </Label>
              </div>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
