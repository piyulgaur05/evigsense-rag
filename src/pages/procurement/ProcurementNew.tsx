import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AlertCircle, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { RequisitionEditor } from "@/features/procurement/components/RequisitionEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useCase,
  useLookups,
  useOpenCase,
  useRequisitionGaps,
  useStageDecision,
} from "@/features/procurement/hooks/useProcurement";

const schema = z.object({
  title: z.string().trim().min(6, "Give the requisition a title someone else would recognise"),
  departmentId: z.string().min(1, "Pick the department this is for"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Raising a requisition happens in two moves rather than five wizard steps.
 *
 * The first move opens a draft — a title and a department is all it takes,
 * because a case number has to exist before anything can be attached to it.
 * Everything after that is one page the requester fills in whatever order the
 * information arrives, and the draft survives leaving and coming back.
 */
export default function ProcurementNew() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const draftNo = params.get("case") ?? undefined;

  const { user } = useAuth();
  const { data: departments } = useLookups("department");
  const openCase = useOpenCase();
  const decide = useStageDecision();

  const { data: draft, isLoading: draftLoading } = useCase(draftNo);
  const { data: gaps } = useRequisitionGaps(draft?.id);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", departmentId: "" },
  });

  // A draft that has already been raised belongs on the case file, not here.
  useEffect(() => {
    if (draft && draft.stage !== "draft") {
      navigate(`/procurement/case/${draft.case_no}`, { replace: true });
    }
  }, [draft, navigate]);

  const onOpenDraft = async (values: FormValues) => {
    if (!user) return;
    try {
      const created = await openCase.mutateAsync({
        title: values.title,
        departmentId: values.departmentId,
        estimatedCost: 0,
        requesterId: user.id,
      });
      toast.success(`${created.case_no} opened as a draft`);
      setParams({ case: created.case_no }, { replace: true });
    } catch {
      // useOpenCase already surfaced the message.
    }
  };

  /**
   * Raising and sending are one act for the requester and two entries in the
   * trail: the case is raised out of draft, then put to finance. Both go
   * through the engine, so the guard on the second one still decides whether
   * finance ever sees it.
   */
  const onRaise = async () => {
    if (!draft) return;
    try {
      await decide.mutateAsync({ caseId: draft.id, actionCode: "draft.submit" });
      await decide.mutateAsync({ caseId: draft.id, actionCode: "mpr.submit" });
      toast.success(`${draft.case_no} is with finance`);
      navigate(`/procurement/case/${draft.case_no}`);
    } catch {
      // The engine's own message is the useful one.
    }
  };

  if (draftNo && draftLoading) {
    return (
      <PortalLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  if (draft) {
    const blocked = (gaps ?? []).length > 0;
    return (
      <PortalLayout>
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            draft · {draft.case_no}
          </p>
          <h1 className="mt-1 font-display text-[2rem] text-foreground">{draft.title}</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
            Nobody else can see this yet. Fill in what you know, attach the paperwork, and raise it
            when it is ready.
          </p>

          <div className="mt-8">
            <RequisitionEditor procurementCase={draft} />
          </div>

          <div
            className={cn(
              "mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-5 py-4",
              blocked ? "border-destructive/40" : "border-ok/40",
            )}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                {blocked ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <Check className="h-4 w-4 shrink-0 text-ok" />
                )}
                {blocked ? "Not ready yet" : "Ready to raise it"}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {blocked
                  ? // Naming the outstanding items beats "finish the items above":
                    // the checklist is several screens up by the time anybody
                    // reaches this button.
                    `Still needed — ${(gaps ?? []).join(", ").toLowerCase()}.`
                  : "It goes straight to the finance desk for a budget decision."}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/procurement/register")}
              >
                Leave it as a draft
              </Button>
              <Button type="button" onClick={onRaise} disabled={blocked || decide.isPending}>
                {decide.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Raise and send for finance clearance
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <form onSubmit={handleSubmit(onOpenDraft)} className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
        <h1 className="font-display text-[2rem] text-foreground">New requisition</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Start with what it is and who it is for. The case number comes back straight away, and
          everything else — the bill of quantities, the budget head, the documents — goes on the
          draft after that.
        </p>

        <section className="mt-8 rounded-lg border border-border bg-card p-5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-[13px]">
                Requisition title
              </Label>
              <Input
                id="title"
                className="mt-1.5"
                placeholder="Spectrum analyser, 26.5 GHz, for the RF laboratory"
                {...register("title")}
              />
              {errors.title && (
                <p className="mt-1.5 text-[13px] text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label className="text-[13px]">Department</Label>
              <Select
                value={watch("departmentId")}
                onValueChange={(value) =>
                  setValue("departmentId", value, { shouldValidate: true })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick a department" />
                </SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departmentId && (
                <p className="mt-1.5 text-[13px] text-destructive">
                  {errors.departmentId.message}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center gap-3">
          <p className="text-[13px] text-muted-foreground">
            This creates a draft only you can see.
          </p>
          <Button type="submit" className="ml-auto" disabled={isSubmitting || openCase.isPending}>
            {isSubmitting || openCase.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Open the draft
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </PortalLayout>
  );
}
