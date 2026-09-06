import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import {
  useBoqLines,
  useBudgetLedger,
  useCaseDocuments,
  useLookups,
  useRequisition,
  useRequisitionGaps,
  useSaveBoqLines,
  useSaveRequisition,
  useUpdateCase,
} from "../hooks/useProcurement";
import { formatDate, formatMoney } from "../lib/format";
import { BoqEditor } from "./BoqEditor";
import { BoqImport } from "./BoqImport";
import { CaseAssistant } from "./CaseAssistant";
import { boqIssues, boqTotal } from "../lib/boq";
import { CaseDocuments } from "./CaseDocuments";
import { ReadinessChecklist, RequiredLabel } from "./ReadinessChecklist";
// Section, LookupField and the "none" sentinel are shared with the tender form.
import { FormSection as Section, LookupField, NONE, pickLookup as pick } from "./FormSection";
import { requiredRing, requisitionChecks, stepOutstanding } from "../lib/requisitionChecks";
import type { BoqDraftLine } from "../api/requisition";
import type { CaseListItem } from "../types";

type Details = {
  title: string;
  departmentId: string;
  justification: string;
  requiredBy: string;
  priorityId: string;
  categoryId: string;
  procurementTypeId: string;
  costCentreId: string;
  warehouseId: string;
  budgetHeadId: string;
  costSource: "boq" | "manual";
  manualCost: number;
  deliveryNote: string;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] text-foreground">{value}</p>
    </div>
  );
}

/**
 * The requisition itself: what is wanted, when, against which budget, itemised
 * where it can be, with the paperwork attached.
 *
 * One scrolling page rather than a step wizard — the requester can see the
 * whole ask at once and fill it in the order the information reaches them,
 * which is rarely the order a wizard insists on. Everything is saved together,
 * so a half-typed line never reprices the case.
 */
export function RequisitionEditor({
  procurementCase,
  readOnly,
  showDocuments = true,
}: {
  procurementCase: CaseListItem;
  readOnly?: boolean;
  /** The case file already carries a documents panel; the intake page does not. */
  showDocuments?: boolean;
}) {
  const caseId = procurementCase.id;
  const { user } = useAuth();
  const { data: requisition } = useRequisition(caseId);
  const { data: boqRows } = useBoqLines(caseId);
  const { data: gaps } = useRequisitionGaps(caseId);
  const { data: ledger } = useBudgetLedger();
  const { data: documents } = useCaseDocuments(caseId);

  const { data: departments } = useLookups("department");
  const { data: priorities } = useLookups("priority");
  const { data: categories } = useLookups("category");
  const { data: procurementTypes } = useLookups("procurement_type");
  const { data: costCentres } = useLookups("cost_centre");
  const { data: warehouses } = useLookups("warehouse");
  const { data: units } = useLookups("unit");

  const saveRequisition = useSaveRequisition(caseId);
  const saveBoq = useSaveBoqLines(caseId);
  const updateCase = useUpdateCase();

  const [details, setDetails] = useState<Details | null>(null);
  const [lines, setLines] = useState<BoqDraftLine[] | null>(null);

  // Load once the server has answered, and again whenever the case moves —
  // a send-back returns the requester to a form they need to see afresh.
  useEffect(() => {
    setDetails({
      title: procurementCase.title,
      departmentId: procurementCase.department_id ?? "",
      justification: requisition?.justification ?? "",
      requiredBy: requisition?.required_by ?? "",
      priorityId: requisition?.priority_id ?? "",
      categoryId: requisition?.category_id ?? "",
      procurementTypeId: requisition?.procurement_type_id ?? "",
      costCentreId: requisition?.cost_centre_id ?? "",
      warehouseId: requisition?.warehouse_id ?? "",
      budgetHeadId: requisition?.budget_head_id ?? "",
      costSource: (requisition?.cost_source as "boq" | "manual") ?? "manual",
      manualCost: Number(requisition?.manual_cost ?? procurementCase.estimated_cost ?? 0),
      deliveryNote: requisition?.delivery_note ?? "",
    });
  }, [requisition, procurementCase]);

  useEffect(() => {
    if (!boqRows) return;
    setLines(
      boqRows.map((row) => ({
        id: row.id,
        item_name: row.item_name,
        specification: row.specification,
        quantity: Number(row.quantity),
        unit: row.unit,
        hsn_code: row.hsn_code,
        estimated_rate: row.estimated_rate === null ? null : Number(row.estimated_rate),
      })),
    );
  }, [boqRows]);

  const workingLines = lines ?? [];
  const billTotal = boqTotal(workingLines);
  const pricedLines = workingLines.filter((line) => (line.estimated_rate ?? 0) > 0).length;
  const canDeriveFromBill = workingLines.length > 0 && pricedLines > 0;

  const effectiveCost =
    details?.costSource === "boq" && canDeriveFromBill ? billTotal : (details?.manualCost ?? 0);

  const budgetHead = useMemo(
    () => ledger?.find((row) => row.id === details?.budgetHeadId) ?? null,
    [ledger, details?.budgetHeadId],
  );

  // What is already committed by this case is not a shortfall against itself.
  const headroom = budgetHead
    ? Number(budgetHead.available) + Number(procurementCase.estimated_cost ?? 0)
    : null;
  const shortfall = headroom !== null && effectiveCost > headroom ? effectiveCost - headroom : 0;

  // Driven by the unsaved form, not by `gaps`, so the checklist and the field
  // rings move as the requester types. `gaps` is still fetched and still comes
  // from the database — it enables the raise button on the page above, and the
  // checklist falls back to it when the two disagree, which is what an unsaved
  // edit (or a drifted client rule) looks like from here.
  const checks = useMemo(
    () =>
      requisitionChecks({
        title: details?.title ?? "",
        departmentId: details?.departmentId ?? "",
        requiredBy: details?.requiredBy ?? "",
        effectiveCost,
      }),
    [details?.title, details?.departmentId, details?.requiredBy, effectiveCost],
  );

  if (!details) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const set = <K extends keyof Details>(key: K, value: Details[K]) =>
    setDetails((current) => (current ? { ...current, [key]: value } : current));

  const saving = saveRequisition.isPending || saveBoq.isPending || updateCase.isPending;

  const onSave = async () => {
    if (!user) return;
    const issues = boqIssues(workingLines);
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }
    if (!details.title.trim()) {
      toast.error("The requisition needs a title.");
      return;
    }

    try {
      await updateCase.mutateAsync({
        caseId,
        patch: {
          title: details.title.trim(),
          department_id: pick(details.departmentId),
        },
      });
      await saveBoq.mutateAsync({ caseId, userId: user.id, lines: workingLines });
      await saveRequisition.mutateAsync({
        caseId,
        userId: user.id,
        patch: {
          justification: details.justification.trim() || null,
          required_by: details.requiredBy || null,
          priority_id: pick(details.priorityId),
          category_id: pick(details.categoryId),
          procurement_type_id: pick(details.procurementTypeId),
          cost_centre_id: pick(details.costCentreId),
          warehouse_id: pick(details.warehouseId),
          budget_head_id: pick(details.budgetHeadId),
          cost_source: details.costSource === "boq" && canDeriveFromBill ? "boq" : "manual",
          manual_cost: details.costSource === "boq" && canDeriveFromBill ? 0 : details.manualCost,
          delivery_note: details.deliveryNote.trim() || null,
        },
      });
      toast.success(`${procurementCase.case_no} saved`);
    } catch {
      // The mutations already reported what went wrong.
    }
  };

  const lookupName = (rows: { id: string; name: string }[] | undefined, id: string | null) =>
    rows?.find((row) => row.id === id)?.name ?? "Not stated";

  if (readOnly) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold text-foreground">The requisition</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {requisition?.justification || "No justification was recorded."}
            </p>
          </header>
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Needed by" value={formatDate(requisition?.required_by)} />
            <Field label="Priority" value={lookupName(priorities, requisition?.priority_id ?? null)} />
            <Field label="Category" value={lookupName(categories, requisition?.category_id ?? null)} />
            <Field
              label="Procurement type"
              value={lookupName(procurementTypes, requisition?.procurement_type_id ?? null)}
            />
            <Field
              label="Cost centre"
              value={lookupName(costCentres, requisition?.cost_centre_id ?? null)}
            />
            <Field
              label="Delivery point"
              value={lookupName(warehouses, requisition?.warehouse_id ?? null)}
            />
            <Field label="Budget head" value={budgetHead?.name ?? "Not charged to a head"} />
            <Field label="Estimated value" value={formatMoney(procurementCase.estimated_cost)} />
            <Field
              label="Costed from"
              value={requisition?.cost_source === "boq" ? "The bill of quantities" : "A lump-sum estimate"}
            />
          </div>
        </section>

        <Section label="bill of quantities" title="What is being bought">
          <BoqEditor lines={workingLines} units={[]} readOnly onChange={() => undefined} />
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReadinessChecklist checks={checks} serverGaps={gaps ?? undefined} />

      <Section
        label="step 1"
        title="What is needed"
        hint="Say it the way a colleague in another department would understand it."
        outstanding={stepOutstanding(checks, 1)}
      >
        <div className="space-y-4">
          <div>
            <RequiredLabel htmlFor="req-title" done={details.title.trim().length > 0}>
              Requisition title
            </RequiredLabel>
            <Input
              id="req-title"
              className={cn("mt-1.5", requiredRing(details.title.trim().length > 0))}
              value={details.title}
              placeholder="Spectrum analyser, 26.5 GHz, for the RF laboratory"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="req-justification" className="text-[13px]">
              Why it is needed
            </Label>
            <Textarea
              id="req-justification"
              className="mt-1.5"
              rows={3}
              value={details.justification}
              placeholder="What this replaces or enables, and what happens without it."
              onChange={(e) => set("justification", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LookupField
              id="req-department"
              label="Department"
              value={details.departmentId}
              options={departments ?? []}
              placeholder="Pick a department"
              required
              onChange={(value) => set("departmentId", value === NONE ? "" : value)}
            />
            <LookupField
              label="Material category"
              value={details.categoryId}
              options={categories ?? []}
              placeholder="Pick a category"
              onChange={(value) => set("categoryId", value === NONE ? "" : value)}
            />
            <LookupField
              label="Procurement type"
              value={details.procurementTypeId}
              options={procurementTypes ?? []}
              placeholder="Goods, services or works"
              onChange={(value) => set("procurementTypeId", value === NONE ? "" : value)}
            />
            <LookupField
              label="Priority"
              value={details.priorityId}
              options={priorities ?? []}
              placeholder="How urgent"
              onChange={(value) => set("priorityId", value === NONE ? "" : value)}
            />
            <LookupField
              label="Cost centre"
              value={details.costCentreId}
              options={costCentres ?? []}
              placeholder="Which cost centre"
              onChange={(value) => set("costCentreId", value === NONE ? "" : value)}
            />
            <LookupField
              label="Delivery point"
              value={details.warehouseId}
              options={warehouses ?? []}
              placeholder="Where it should arrive"
              onChange={(value) => set("warehouseId", value === NONE ? "" : value)}
            />
            <div>
              <RequiredLabel htmlFor="req-required-by" done={Boolean(details.requiredBy)}>
                Needed by
              </RequiredLabel>
              <Input
                id="req-required-by"
                type="date"
                className={cn("mt-1.5", requiredRing(Boolean(details.requiredBy)))}
                value={details.requiredBy}
                onChange={(e) => set("requiredBy", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="req-delivery-note" className="text-[13px]">
                Delivery or installation notes
              </Label>
              <Input
                id="req-delivery-note"
                className="mt-1.5"
                value={details.deliveryNote}
                placeholder="Site access, calibration, commissioning — anything the vendor must know."
                onChange={(e) => set("deliveryNote", e.target.value)}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        label="step 2"
        title="Bill of quantities"
        hint="List the items where you can. Leave it empty for a service or a lump-sum job and enter an estimate instead."
      >
        <div className="space-y-4">
          <BoqImport
            caseId={caseId}
            caseNo={procurementCase.case_no}
            stage={procurementCase.stage}
            hasLines={workingLines.length > 0}
            onAccept={(imported, mode) =>
              setLines((current) =>
                mode === "replace" ? imported : [...(current ?? []), ...imported],
              )
            }
          />
          <BoqEditor lines={workingLines} units={units ?? []} onChange={(next) => setLines(next)} />
        </div>
      </Section>

      <Section
        label="step 3"
        title="The money"
        hint="The figure finance decides against, and the head it is charged to."
        outstanding={stepOutstanding(checks, 3)}
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[13px]">Budget head</Label>
              <Select
                value={details.budgetHeadId || NONE}
                onValueChange={(value) => set("budgetHeadId", value === NONE ? "" : value)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Charge it to a head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not charged yet</SelectItem>
                  {(ledger ?? [])
                    .filter((row) => row.active)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name} · {formatMoney(row.available)} left
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {budgetHead && (
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                  {budgetHead.fiscal_year} · allocated {formatMoney(budgetHead.allocated)} ·
                  committed {formatMoney(budgetHead.committed)}
                </p>
              )}
            </div>

            <div>
              <Label className="text-[13px]">Where the figure comes from</Label>
              <div className="mt-1.5 space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
                  <input
                    type="radio"
                    name="cost-source"
                    className="mt-1"
                    checked={details.costSource === "boq" && canDeriveFromBill}
                    disabled={!canDeriveFromBill}
                    onChange={() => set("costSource", "boq")}
                  />
                  <span className="text-[13px]">
                    <span className="font-medium text-foreground">
                      The bill total — {formatMoney(billTotal)}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {canDeriveFromBill
                        ? `${pricedLines} of ${workingLines.length} line(s) carry a rate.`
                        : "No priced lines yet, so no total can be derived."}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5">
                  <input
                    type="radio"
                    name="cost-source"
                    className="mt-1"
                    checked={details.costSource === "manual" || !canDeriveFromBill}
                    onChange={() => set("costSource", "manual")}
                  />
                  <span className="text-[13px]">
                    <span className="font-medium text-foreground">Enter a figure</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      Use when the rates are indicative or the scope is priced differently.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Whenever the value check is outstanding this input is on screen:
              deriving from the bill needs a priced line, and a priced line
              makes the total non-zero. So the checklist's jump to `req-cost`
              can never land on a field that is not rendered. */}
          {(details.costSource === "manual" || !canDeriveFromBill) && (
            <div className="max-w-xs">
              <RequiredLabel htmlFor="req-cost" done={effectiveCost > 0}>
                Estimated value
              </RequiredLabel>
              <Input
                id="req-cost"
                type="number"
                min={0}
                className={cn("mt-1.5 tabular-nums", requiredRing(effectiveCost > 0))}
                value={details.manualCost || ""}
                placeholder="0"
                onChange={(e) => set("manualCost", Number(e.target.value))}
              />
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-3 border-t border-border pt-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              raising this for
            </span>
            <span className="font-mono text-[1.35rem] tabular-nums text-foreground">
              {formatMoney(effectiveCost)}
            </span>
            {shortfall > 0 && (
              <span className="text-[13px] text-destructive">
                {formatMoney(shortfall)} more than {budgetHead?.name} has left. Reduce the scope, or
                ask finance to revise the allocation.
              </span>
            )}
          </div>
        </div>
      </Section>

      {showDocuments && (
        <Section
          label="step 4 · optional"
          title="Supporting documents"
          hint="The estimate, the drawings, the specification — whatever you already have. Nothing here blocks the requisition."
        >
          <CaseDocuments
            caseId={caseId}
            caseNo={procurementCase.case_no}
            stage={procurementCase.stage}
            canUpload
          />
        </Section>
      )}

      {showDocuments && (documents ?? []).length > 0 && (
        <CaseAssistant caseId={caseId} caseNo={procurementCase.case_no} />
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          Saved changes stay on the draft until you raise it.
        </p>
        <Button type="button" className="ml-auto" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save the requisition
        </Button>
      </div>
    </div>
  );
}
