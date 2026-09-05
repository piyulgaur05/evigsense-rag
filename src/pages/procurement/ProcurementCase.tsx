import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { CaseAssistant } from "@/features/procurement/components/CaseAssistant";
import { CaseTimeline } from "@/features/procurement/components/CaseTimeline";
import { CaseDocuments } from "@/features/procurement/components/CaseDocuments";
import { ClarificationThread } from "@/features/procurement/components/ClarificationThread";
import { StageActionBar } from "@/features/procurement/components/StageActionBar";
import { StageBadge } from "@/features/procurement/components/StageBadge";
import { StageIndex } from "@/features/procurement/components/StageIndex";
import { StageWorkPanel } from "@/features/procurement/stages/StageWorkPanel";
import { useCase, useStageConfig, useStageHistory } from "@/features/procurement/hooks/useProcurement";
import { formatDate, formatMoney } from "@/features/procurement/lib/format";
import type { ProcurementStage } from "@/features/procurement/types";

/**
 * One screen per case rather than one per stage. The stage index moves the
 * reader through the file without ever losing the case, which is the part the
 * old stage-by-stage layout kept getting wrong.
 */
export default function ProcurementCase() {
  const { caseNo } = useParams<{ caseNo: string }>();
  const { can, user, hasProcurementRole } = useAuth();
  const { data: procurementCase, isLoading, error } = useCase(caseNo);
  const { data: stages } = useStageConfig();
  const { data: history } = useStageHistory(procurementCase?.id);
  const [selected, setSelected] = useState<ProcurementStage | null>(null);

  // Follow the case when it moves, unless the reader has picked a stage.
  useEffect(() => {
    if (procurementCase && selected === null) setSelected(procurementCase.stage);
  }, [procurementCase, selected]);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  if (error || !procurementCase) {
    return (
      <PortalLayout>
        <div className="px-5 py-16 text-center sm:px-8">
          <h1 className="font-display text-[1.5rem] text-foreground">No such case</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {caseNo} is either not a case, or not one you can see.
          </p>
          <Link
            to="/procurement/register"
            className="mt-4 inline-flex items-center gap-2 text-[13px] text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the register
          </Link>
        </div>
      </PortalLayout>
    );
  }

  // A requisition stays the requester's to correct until it leaves them.
  const canEditRequisition =
    procurementCase.case_status === "open" &&
    (procurementCase.requester_id === user?.id ||
      procurementCase.created_by === user?.id ||
      hasProcurementRole("proc_admin"));

  const activeStage = selected ?? procurementCase.stage;
  const isCurrent = activeStage === procurementCase.stage;
  const config = stages?.find((s) => s.stage === activeStage);

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <Link
          to="/procurement/register"
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          register
        </Link>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[13px] tabular-nums text-muted-foreground">
              {procurementCase.case_no}
            </p>
            <h1 className="mt-1 font-display text-[2rem] leading-tight text-foreground">
              {procurementCase.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
              <span>{procurementCase.department?.name ?? "No department"}</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatMoney(procurementCase.estimated_cost)}
              </span>
              <span>opened {formatDate(procurementCase.created_at)}</span>
            </div>
          </div>

          <StageBadge
            status={procurementCase.status_label}
            caseStatus={procurementCase.case_status}
            className="shrink-0 text-[12px]"
          />
        </div>

        {procurementCase.case_status === "rejected" && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-destructive">
              rejected
            </p>
            <p className="mt-1.5 text-[13px] text-foreground">
              {(procurementCase.rejection as { remarks?: string } | null)?.remarks ??
                "No reason was recorded."}
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_330px]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              stages
            </p>
            <StageIndex
              stages={stages ?? []}
              current={procurementCase.stage}
              history={history ?? []}
              selected={activeStage}
              onSelect={setSelected}
            />
          </aside>

          <div className="min-w-0 space-y-6">
            <StageWorkPanel
              stage={activeStage}
              config={config}
              procurementCase={procurementCase}
              isCurrent={isCurrent}
              canEditRequisition={canEditRequisition}
            />

            {isCurrent && procurementCase.case_status === "open" && (
              <StageActionBar caseId={procurementCase.id} caseNo={procurementCase.case_no} />
            )}

            <div className="xl:hidden">
              <CaseDocuments
                caseId={procurementCase.id}
                caseNo={procurementCase.case_no}
                stage={activeStage}
                canUpload={can("upload_docs")}
              />
            </div>
          </div>

          <aside className="hidden min-w-0 space-y-6 xl:block">
            <CaseDocuments
              caseId={procurementCase.id}
              caseNo={procurementCase.case_no}
              stage={activeStage}
              canUpload={can("upload_docs")}
            />
            <CaseAssistant caseId={procurementCase.id} caseNo={procurementCase.case_no} />
            <ClarificationThread caseId={procurementCase.id} stage={procurementCase.stage} />
            <section className="rounded-lg border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold text-foreground">Activity</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Every decision, movement, question and document on this case.
                </p>
              </header>
              <div className="px-5 py-5">
                <CaseTimeline caseId={procurementCase.id} />
              </div>
            </section>
          </aside>

          <div className="space-y-6 xl:hidden lg:col-start-2">
            <CaseAssistant caseId={procurementCase.id} caseNo={procurementCase.case_no} />
            <ClarificationThread caseId={procurementCase.id} stage={procurementCase.stage} />
            <section className="rounded-lg border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold text-foreground">Activity</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Every decision, movement, question and document on this case.
                </p>
              </header>
              <div className="px-5 py-5">
                <CaseTimeline caseId={procurementCase.id} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
