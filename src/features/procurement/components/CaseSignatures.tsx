import { useMemo } from "react";
import { PenLine } from "lucide-react";
import { useCaseSignatures, useStageActions, useStageConfig } from "../hooks/useProcurement";
import { formatDateTime } from "../lib/format";

/**
 * Who put their name to what.
 *
 * A signature nobody downstream can see proves nothing to the people who need
 * it, so this reads under the ordinary case-visibility rule: if you can open
 * the case, you can see every mark on it. The images are the copies taken at
 * signing time, not the signers' current saved signatures — replacing a saved
 * signature cannot rewrite what was signed.
 *
 * Absent until a case has one. Decisions taken before signing was enforced have
 * no row here, and that gap is the honest record rather than something to paper
 * over with a placeholder.
 */
export function CaseSignatures({ caseId }: { caseId: string }) {
  const { data: signatures } = useCaseSignatures(caseId);
  const { data: stageActions } = useStageActions();
  const { data: stageConfig } = useStageConfig();

  const actionLabel = useMemo(() => {
    const labels = new Map<string, string>();
    for (const action of stageActions ?? []) labels.set(action.code, action.label);
    return labels;
  }, [stageActions]);

  const stageLabel = useMemo(() => {
    const labels = new Map<string, string>();
    for (const stage of stageConfig ?? []) labels.set(stage.stage, stage.label);
    return labels;
  }, [stageConfig]);

  if (!signatures?.length) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <PenLine className="h-3.5 w-3.5" />
        signed
      </p>

      <ul className="mt-3 space-y-3">
        {signatures.map((signature) => (
          <li key={signature.id} className="flex items-center gap-3">
            {/* White plate: signatures are drawn in black ink and would vanish
                against the dark theme's card. */}
            <div className="shrink-0 rounded border border-border bg-white p-1.5">
              <img
                src={signature.image}
                alt={`Signature on ${actionLabel.get(signature.action_code) ?? signature.action_code}`}
                className="h-9 w-24 object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] text-foreground">
                {actionLabel.get(signature.action_code) ?? signature.action_code}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {stageLabel.get(signature.stage) ?? signature.stage.replace(/_/g, " ")} ·{" "}
                {formatDateTime(signature.signed_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
