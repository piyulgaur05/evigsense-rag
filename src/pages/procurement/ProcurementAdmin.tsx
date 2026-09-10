import { useMemo, useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useAllLookups,
  useAllVendors,
  useBudgetHeads,
  useBudgetLedger,
  useCreateBudgetHead,
  useCreateLookup,
  useCreateLookups,
  useDeleteLookup,
  useUpdateBudgetHead,
  useUpdateLookup,
} from "@/features/procurement/hooks/useProcurement";
import { countLookupUsage } from "@/features/procurement/api/masterData";
import {
  MASTER_DATA_CATEGORIES,
  countByKind,
  parseBulkEntries,
  type MasterDataCategory,
} from "@/features/procurement/lib/masterData";
import { formatMoney } from "@/features/procurement/lib/format";
import { VendorPanel } from "@/features/procurement/components/VendorPanel";
import type { BudgetHead, Lookup } from "@/features/procurement/types";

const BUDGET_TAB = "budget_heads";
const VENDOR_TAB = "vendors";

function Panel({
  label,
  title,
  hint,
  aside,
  children,
}: {
  label: string;
  title: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{hint}</p>}
        </div>
        {aside && <div className="ml-auto shrink-0">{aside}</div>}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** The list itself: add a row, rename one, retire one, or delete one outright. */
function LookupPanel({ category, rows }: { category: MasterDataCategory; rows: Lookup[] }) {
  const { user } = useAuth();
  const createLookup = useCreateLookup();
  const createLookups = useCreateLookups();
  const updateLookup = useUpdateLookup();
  const deleteLookup = useDeleteLookup();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [editing, setEditing] = useState<Lookup | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [deleting, setDeleting] = useState<Lookup | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const entries = parseBulkEntries(bulkText);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (rows.some((row) => row.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`${category.singular} "${trimmed}" is already on the list`);
      return;
    }
    createLookup.mutate(
      {
        draft: {
          kind: category.kind,
          name: trimmed,
          code: code.trim() || null,
          sort_order: rows.length,
          active: true,
        },
        userId: user?.id ?? "",
      },
      {
        onSuccess: () => {
          setName("");
          setCode("");
        },
      },
    );
  };

  const openDelete = (row: Lookup) => {
    setDeleting(row);
    setUsage(null);
    // Counted on open rather than per row: nine head-only counts per entry
    // would be a lot of requests for a list nobody is about to delete from.
    void countLookupUsage(row.id)
      .then(setUsage)
      .catch(() => setUsage(null));
  };

  return (
    <Panel
      label="master data"
      title={category.label}
      hint={category.hint}
      aside={
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          Paste a list
        </Button>
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        read by · {category.usedIn.join(" · ")}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <Label className="text-[13px]">{category.singular}</Label>
          <Input
            className="mt-1.5"
            value={name}
            placeholder={`Add a ${category.singular.toLowerCase()}`}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
          />
        </div>
        {category.codeLabel && (
          <div className="w-40">
            <Label className="text-[13px]">{category.codeLabel}</Label>
            <Input
              className="mt-1.5"
              value={code}
              placeholder="Optional"
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
            />
          </div>
        )}
        <Button onClick={add} disabled={!name.trim() || createLookup.isPending}>
          {createLookup.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add
        </Button>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {category.singular}
              </th>
              {category.codeLabel && (
                <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {category.codeLabel}
                </th>
              )}
              <th className="pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={category.codeLabel ? 4 : 3}
                  className="py-8 text-center text-muted-foreground"
                >
                  No {category.label.toLowerCase()} yet. The requisition will show this field as
                  empty until one is added.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className={cn("py-2.5 pr-4", !row.active && "text-muted-foreground")}>
                  {row.name}
                </td>
                {category.codeLabel && (
                  <td className="py-2.5 pr-4 font-mono text-[12px] text-muted-foreground">
                    {row.code || "—"}
                  </td>
                )}
                <td className="py-2.5 pr-4">
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[0.14em]",
                      row.active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {row.active ? "in use" : "retired"}
                  </span>
                </td>
                <td className="py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(row);
                        setEditName(row.name);
                        setEditCode(row.code ?? "");
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateLookup.mutate({ id: row.id, patch: { active: !row.active } })
                      }
                    >
                      {row.active ? (
                        "Retire"
                      ) : (
                        <>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Restore
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${row.name}`}
                      onClick={() => openDelete(row)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        Retiring hides an entry from the requisition without touching the cases that already use
        it. That is the reversible move — prefer it to deleting.
      </p>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste {category.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              One per line. A spreadsheet column pastes straight in; add a comma or a tab for the{" "}
              {category.codeLabel ? category.codeLabel.toLowerCase() : "code"}. Names already on
              the list are skipped.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            value={bulkText}
            placeholder={
              category.codeLabel
                ? "Civil Engineering, CIV\nElectrical, ELE"
                : "Goods\nServices\nWorks"
            }
            onChange={(event) => setBulkText(event.target.value)}
          />
          <p className="text-[12px] text-muted-foreground">
            {entries.length === 0
              ? "Nothing to add yet."
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} ready.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={entries.length === 0 || createLookups.isPending}
              onClick={() =>
                createLookups.mutate(
                  { kind: category.kind, entries, userId: user?.id ?? "" },
                  {
                    onSuccess: () => {
                      setBulkText("");
                      setBulkOpen(false);
                    },
                  },
                )
              }
            >
              {createLookups.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {entries.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {editing?.name}</DialogTitle>
            <DialogDescription>
              Every case that already names this one will show the new name — the cases point at
              the entry, not at a copy of its text.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[13px]">{category.singular}</Label>
              <Input
                className="mt-1.5"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            {category.codeLabel && (
              <div>
                <Label className="text-[13px]">{category.codeLabel}</Label>
                <Input
                  className="mt-1.5"
                  value={editCode}
                  onChange={(event) => setEditCode(event.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editName.trim() || updateLookup.isPending}
              onClick={() =>
                editing &&
                updateLookup.mutate(
                  {
                    id: editing.id,
                    patch: { name: editName.trim(), code: editCode.trim() || null },
                  },
                  { onSuccess: () => setEditing(null) },
                )
              }
            >
              {updateLookup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {usage === null
                ? "Checking what still points at it…"
                : usage === 0
                  ? "Nothing points at this entry, so deleting it loses nothing."
                  : `${usage} ${usage === 1 ? "record" : "records"} still name this entry. Deleting it leaves that field blank on each of them, and the change cannot be undone. Retire it instead to keep the record intact.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                deleteLookup.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

type BudgetForm = {
  name: string;
  code: string;
  fiscalYear: string;
  departmentId: string;
  categoryId: string;
  allocated: string;
  notes: string;
};

const NONE = "none";

function currentFiscalYear(): string {
  // The Indian fiscal year runs April to March, so anything before April
  // belongs to the year that started the previous calendar year.
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const emptyBudgetForm = (): BudgetForm => ({
  name: "",
  code: "",
  fiscalYear: currentFiscalYear(),
  departmentId: NONE,
  categoryId: NONE,
  allocated: "",
  notes: "",
});

/** The ledger heads a requisition is charged against. */
function BudgetHeadPanel({
  heads,
  departments,
  categories,
}: {
  heads: BudgetHead[];
  departments: Lookup[];
  categories: Lookup[];
}) {
  const { user } = useAuth();
  const { data: ledger } = useBudgetLedger();
  const createHead = useCreateBudgetHead();
  const updateHead = useUpdateBudgetHead();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetForm>(emptyBudgetForm);

  // Committed and available are derived in the database from live case values,
  // so they are read from the ledger rather than stored on the head itself.
  const spend = useMemo(() => {
    const map = new Map<string, { committed: number; available: number }>();
    for (const row of ledger ?? []) {
      map.set(row.id, { committed: Number(row.committed), available: Number(row.available) });
    }
    return map;
  }, [ledger]);

  const startNew = () => {
    setEditingId(null);
    setForm(emptyBudgetForm());
    setOpen(true);
  };

  const startEdit = (head: BudgetHead) => {
    setEditingId(head.id);
    setForm({
      name: head.name,
      code: head.code ?? "",
      fiscalYear: head.fiscal_year,
      departmentId: head.department_id ?? NONE,
      categoryId: head.category_id ?? NONE,
      allocated: String(Number(head.allocated)),
      notes: head.notes ?? "",
    });
    setOpen(true);
  };

  const save = () => {
    const allocated = Number(form.allocated);
    if (!form.name.trim() || !form.fiscalYear.trim()) return;
    if (!Number.isFinite(allocated) || allocated < 0) {
      toast.error("The allocation has to be a number, and not a negative one");
      return;
    }

    const draft = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      fiscal_year: form.fiscalYear.trim(),
      department_id: form.departmentId === NONE ? null : form.departmentId,
      category_id: form.categoryId === NONE ? null : form.categoryId,
      allocated,
      notes: form.notes.trim() || null,
      active: true,
    };

    if (editingId) {
      updateHead.mutate({ id: editingId, patch: draft }, { onSuccess: () => setOpen(false) });
    } else {
      createHead.mutate({ draft, userId: user?.id ?? "" }, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <Panel
      label="master data"
      title="Budget heads"
      hint="The allocations a requisition is charged against. What each head has left is worked out from the live cases charged to it, so it is shown here rather than typed."
      aside={
        <Button size="sm" onClick={startNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add a head
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {["Head", "Year", "Department", "Allocated", "Committed", "Left", ""].map(
                (heading, index) => (
                  <th
                    key={heading || index}
                    className={cn(
                      "pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
                      index >= 3 && index <= 5 && "text-right",
                    )}
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {heads.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No budget heads yet. A requisition can still be raised without one — the money
                  section simply has nothing to pick.
                </td>
              </tr>
            )}
            {heads.map((head) => {
              const figures = spend.get(head.id);
              const department = departments.find((row) => row.id === head.department_id);
              return (
                <tr key={head.id} className="border-b border-border/60">
                  <td className={cn("py-2.5 pr-4", !head.active && "text-muted-foreground")}>
                    {head.name}
                    {head.code && (
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {head.code}
                      </span>
                    )}
                    {!head.active && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        retired
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[12px] text-muted-foreground">
                    {head.fiscal_year}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{department?.name ?? "—"}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {formatMoney(Number(head.allocated))}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {figures ? formatMoney(figures.committed) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pr-4 text-right tabular-nums",
                      figures && figures.available < 0 && "text-destructive",
                    )}
                  >
                    {figures ? formatMoney(figures.available) : "—"}
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(head)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateHead.mutate({ id: head.id, patch: { active: !head.active } })
                        }
                      >
                        {head.active ? "Retire" : "Restore"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        A head is never deleted, only retired — the cases charged against it keep their history,
        and the ledger still adds up.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit budget head" : "Add a budget head"}</DialogTitle>
            <DialogDescription>
              Name and fiscal year together have to be unique — the same head in a new year is a
              new row, which is what keeps last year's commitments out of this year's headroom.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-[13px]">Name</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                placeholder="Laboratory Equipment"
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label className="text-[13px]">Code</Label>
              <Input
                className="mt-1.5"
                value={form.code}
                placeholder="EI-CAP-2026"
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </div>
            <div>
              <Label className="text-[13px]">Fiscal year</Label>
              <Input
                className="mt-1.5"
                value={form.fiscalYear}
                placeholder="2026-27"
                onChange={(event) => setForm({ ...form, fiscalYear: event.target.value })}
              />
            </div>
            <div>
              <Label className="text-[13px]">Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(value) => setForm({ ...form, departmentId: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Any department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any department</SelectItem>
                  {departments.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[13px]">Material category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm({ ...form, categoryId: value })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Any category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Any category</SelectItem>
                  {categories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[13px]">Allocated</Label>
              <Input
                className="mt-1.5 tabular-nums"
                inputMode="decimal"
                value={form.allocated}
                placeholder="5000000"
                onChange={(event) => setForm({ ...form, allocated: event.target.value })}
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {form.allocated && Number.isFinite(Number(form.allocated))
                  ? formatMoney(Number(form.allocated))
                  : "Rupees, plain digits."}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[13px]">Notes</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!form.name.trim() || createHead.isPending || updateHead.isPending}
            >
              {(createHead.isPending || updateHead.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/**
 * Master data management.
 *
 * Every list the requisition picks from used to be a `psql` session — the one
 * gap in the portal that made a fresh deployment unusable without a database
 * client. This is that screen: the seven lookup kinds and the budget ledger,
 * behind `master_data.manage`.
 *
 * The stage configuration is deliberately absent. Stages, their order and the
 * moves between them are reference data the engine validates against, and
 * editing them from a form is a schema change wearing a dialog's clothes.
 */
export default function ProcurementAdmin() {
  const { can } = useAuth();
  // master_data.manage is the full bundle (lookups, budget heads, vendors).
  // budget.manage and vendor.manage are narrower grants — finance holds the
  // first, the tender desk the second — that reach only their own section of
  // this same route, with no path to the other sections or to the lookups.
  const canAll = can("master_data.manage");
  const canBudget = canAll || can("budget.manage");
  const canVendor = canAll || can("vendor.manage");
  const scopedSections = canAll ? [] : [canBudget && "budget", canVendor && "vendor"].filter(Boolean);
  // With exactly one section granted, showing a one-item sidebar just to pick
  // it is friction with no choice behind it — go straight to that section.
  const onlySection = !canAll && scopedSections.length === 1 ? scopedSections[0] : null;
  const { data: lookups, isLoading } = useAllLookups();
  const { data: heads } = useBudgetHeads();
  const { data: vendors } = useAllVendors();
  const [tab, setTab] = useState<string>(() => {
    if (onlySection === "budget") return BUDGET_TAB;
    if (onlySection === "vendor") return VENDOR_TAB;
    if (canAll) return MASTER_DATA_CATEGORIES[0].kind;
    return canBudget ? BUDGET_TAB : VENDOR_TAB;
  });

  const counts = useMemo(() => countByKind(lookups), [lookups]);
  const rows = useMemo(
    () => (lookups ?? []).filter((row) => row.kind === tab),
    [lookups, tab],
  );

  const departments = useMemo(
    () => (lookups ?? []).filter((row) => row.kind === "department" && row.active),
    [lookups],
  );
  const categories = useMemo(
    () => (lookups ?? []).filter((row) => row.kind === "category" && row.active),
    [lookups],
  );

  const category = MASTER_DATA_CATEGORIES.find((entry) => entry.kind === tab);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="px-5 py-8 sm:px-8">
        <h1 className="font-display text-[2rem] text-foreground">
          {onlySection === "budget" ? "Budget heads" : onlySection === "vendor" ? "Vendors" : "Master data"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
          {onlySection === "budget"
            ? "The budget heads every requisition is charged against. Changes here reach every open case immediately, because a case points at the entry rather than keeping a copy of its name."
            : onlySection === "vendor"
              ? "The register of firms that bid. Changes here reach every open tender immediately, because a bidder points at the entry rather than keeping a copy of its name."
              : "The lists every requisition picks from, the budget heads it is charged against, and the register of firms that bid. Changes here reach every open case immediately, because a case points at the entry rather than keeping a copy of its name."}
        </p>

        <div
          className={cn(
            "mt-8 grid gap-6",
            !onlySection && "lg:grid-cols-[15rem_1fr]",
          )}
        >
          {!onlySection && (
            <nav className="h-fit rounded-lg border border-border bg-card p-2 lg:sticky lg:top-20">
              {canAll && (
                <>
                  <p className="px-2.5 pb-2 pt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    categories
                  </p>
                  {MASTER_DATA_CATEGORIES.map((entry) => {
                    const count = counts[entry.kind];
                    return (
                      <button
                        key={entry.kind}
                        type="button"
                        onClick={() => setTab(entry.kind)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                          tab === entry.kind
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <span className="truncate">{entry.label}</span>
                        <span className="ml-2 font-mono text-[11px] tabular-nums">
                          {count?.active ?? 0}
                        </span>
                      </button>
                    );
                  })}

                  <div className="my-2 border-t border-border" />
                </>
              )}

              {canBudget && (
              <button
                type="button"
                onClick={() => setTab(BUDGET_TAB)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                  tab === BUDGET_TAB
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="truncate">Budget heads</span>
                <span className="ml-2 font-mono text-[11px] tabular-nums">
                  {(heads ?? []).filter((head) => head.active).length}
                </span>
              </button>
              )}

              {canVendor && (
              <button
                type="button"
                onClick={() => setTab(VENDOR_TAB)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                  tab === VENDOR_TAB
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="truncate">Vendors</span>
                <span className="ml-2 font-mono text-[11px] tabular-nums">
                  {(vendors ?? []).filter((vendor) => vendor.active && !vendor.blacklisted).length}
                </span>
              </button>
              )}
            </nav>
          )}

          <div>
            {onlySection === "budget" ? (
              <BudgetHeadPanel
                heads={heads ?? []}
                departments={departments}
                categories={categories}
              />
            ) : onlySection === "vendor" ? (
              <VendorPanel vendors={vendors ?? []} />
            ) : tab === BUDGET_TAB ? (
              <BudgetHeadPanel
                heads={heads ?? []}
                departments={departments}
                categories={categories}
              />
            ) : tab === VENDOR_TAB ? (
              <VendorPanel vendors={vendors ?? []} />
            ) : category ? (
              <LookupPanel category={category} rows={rows} />
            ) : null}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
