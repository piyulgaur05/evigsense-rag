import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PortalLayout } from "@/features/procurement/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLookups, useOpenCase } from "@/features/procurement/hooks/useProcurement";
import { formatMoney } from "@/features/procurement/lib/format";

const schema = z.object({
  title: z.string().trim().min(6, "Give the requisition a title someone else would recognise"),
  departmentId: z.string().min(1, "Pick the department this is for"),
  estimatedCost: z
    .number({ invalid_type_error: "Enter the estimated value in rupees" })
    .positive("The estimated value must be more than zero"),
  justification: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Requisition intake as one sectioned page rather than a step wizard: the
 * requester can see the whole ask at once, and nothing is hidden behind a
 * "next" button they have to guess their way through.
 */
export default function ProcurementNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: departments } = useLookups("department");
  const openCase = useOpenCase();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", departmentId: "", estimatedCost: 0, justification: "" },
  });

  const estimatedCost = watch("estimatedCost");

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    try {
      const created = await openCase.mutateAsync({
        title: values.title,
        departmentId: values.departmentId,
        estimatedCost: values.estimatedCost,
        requesterId: user.id,
      });
      toast.success(`${created.case_no} opened`);
      navigate(`/procurement/case/${created.case_no}`);
    } catch {
      // useOpenCase already surfaced the message.
    }
  };

  return (
    <PortalLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <h1 className="font-display text-[2rem] text-foreground">New requisition</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Open the case first. You can attach the estimate, drawings and bill of quantities before
          raising it for finance.
        </p>

        <section className="mt-8 rounded-lg border border-border bg-card p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            what is needed
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="title" className="text-[13px]">
                Title
              </Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="Spectrum analyser, 26.5 GHz, for the RF laboratory"
                className="mt-1.5 text-[13px]"
              />
              {errors.title && (
                <p className="mt-1.5 text-[12px] text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="justification" className="text-[13px]">
                Why it is needed <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="justification"
                {...register("justification")}
                rows={3}
                placeholder="What this replaces or enables, and what happens without it."
                className="mt-1.5 text-[13px]"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            who and how much
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="department" className="text-[13px]">
                Department
              </Label>
              <Select onValueChange={(v) => setValue("departmentId", v, { shouldValidate: true })}>
                <SelectTrigger id="department" className="mt-1.5 text-[13px]">
                  <SelectValue placeholder="Pick a department" />
                </SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.departmentId && (
                <p className="mt-1.5 text-[12px] text-destructive">{errors.departmentId.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="estimatedCost" className="text-[13px]">
                Estimated value
              </Label>
              <Input
                id="estimatedCost"
                type="number"
                min={0}
                step={1000}
                {...register("estimatedCost", { valueAsNumber: true })}
                className="mt-1.5 font-mono tabular-nums text-[13px]"
              />
              <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {estimatedCost > 0 ? formatMoney(estimatedCost) : "rupees, before tax"}
              </p>
              {errors.estimatedCost && (
                <p className="mt-1.5 text-[12px] text-destructive">
                  {errors.estimatedCost.message}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting || openCase.isPending}>
            {(isSubmitting || openCase.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Open the case
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/procurement/register")}>
            Cancel
          </Button>
        </div>
      </form>
    </PortalLayout>
  );
}
