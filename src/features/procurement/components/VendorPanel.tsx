import { useMemo, useState } from "react";
import { Ban, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreateVendor, useSetVendorBlacklist, useUpdateVendor } from "../hooks/useProcurement";
import { MSME_LABEL } from "../lib/tender";
import { FormSection } from "./FormSection";
import type { MsmeCategory, Vendor } from "../types";

type Form = {
  name: string;
  registrationId: string;
  gstNumber: string;
  panNumber: string;
  msmeCategory: MsmeCategory | "";
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  notes: string;
};

const EMPTY: Form = {
  name: "",
  registrationId: "",
  gstNumber: "",
  panNumber: "",
  msmeCategory: "",
  contactPerson: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  notes: "",
};

/**
 * The vendor register.
 *
 * The one piece of master data that is not a `procurement_lookups` row, because
 * a firm is not a name in a list: it has a registration number, a tax
 * identifier, a contact and a standing. Forcing it into the lookup shape would
 * have broken the counting, the bulk paste and the delete-usage check that
 * every other list on this screen relies on.
 *
 * There is no delete. Bidder and invitee rows reference vendors with
 * ON DELETE RESTRICT precisely so that tidying the register cannot rewrite what
 * happened on a tender three years ago. Retiring takes a firm out of the
 * pickers; barring records why it is out.
 */
export function VendorPanel({ vendors }: { vendors: Vendor[] }) {
  const { user } = useAuth();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const setBlacklist = useSetVendorBlacklist();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [barring, setBarring] = useState<Vendor | null>(null);
  const [barReason, setBarReason] = useState("");

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(term) ||
        (vendor.registration_id ?? "").toLowerCase().includes(term) ||
        (vendor.city ?? "").toLowerCase().includes(term),
    );
  }, [vendors, search]);

  const openFor = (vendor: Vendor | null) => {
    setEditing(vendor);
    setForm(
      vendor
        ? {
            name: vendor.name,
            registrationId: vendor.registration_id ?? "",
            gstNumber: vendor.gst_number ?? "",
            panNumber: vendor.pan_number ?? "",
            msmeCategory: (vendor.msme_category as MsmeCategory | null) ?? "",
            contactPerson: vendor.contact_person ?? "",
            email: vendor.email ?? "",
            phone: vendor.phone ?? "",
            city: vendor.city ?? "",
            state: vendor.state ?? "",
            notes: vendor.notes ?? "",
          }
        : EMPTY,
    );
    setOpen(true);
  };

  const submit = () => {
    if (!user || !form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      registration_id: form.registrationId.trim() || null,
      gst_number: form.gstNumber.trim() || null,
      pan_number: form.panNumber.trim() || null,
      msme_category: form.msmeCategory || null,
      contact_person: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      notes: form.notes.trim() || null,
    };

    const done = { onSuccess: () => setOpen(false) };
    if (editing) updateVendor.mutate({ id: editing.id, patch: payload }, done);
    else createVendor.mutate({ vendor: payload, userId: user.id }, done);
  };

  return (
    <FormSection
      label="register"
      title="Vendors"
      hint="Every firm the organisation deals with. A bid points at a row here rather than carrying a typed name, so the same supplier is the same firm on every tender it bids for."
      action={
        <Button size="sm" variant="outline" onClick={() => openFor(null)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add a firm
        </Button>
      }
    >
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, registration number or town"
          className="h-7 border-0 px-0 text-[13px] shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Firm</th>
              <th className="py-2 pr-3 font-normal">Registration</th>
              <th className="py-2 pr-3 font-normal">Contact</th>
              <th className="py-2 pr-3 font-normal">Standing</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  {search ? "No firm by that name." : "The register is empty."}
                </td>
              </tr>
            )}
            {shown.map((vendor) => (
              <tr key={vendor.id} className="border-b border-border/60 align-top">
                <td className="py-2.5 pr-3">
                  <span className={cn("block", !vendor.active && "text-muted-foreground")}>
                    {vendor.name}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {[vendor.city, vendor.state].filter(Boolean).join(", ") || "—"}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-[12px] text-muted-foreground">
                  {vendor.registration_id ?? "—"}
                  {vendor.msme_category && (
                    <span className="block">
                      {MSME_LABEL[vendor.msme_category as MsmeCategory]}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">
                  {vendor.contact_person && <span className="block">{vendor.contact_person}</span>}
                  <span className="block break-all">{vendor.email ?? vendor.phone ?? "—"}</span>
                </td>
                <td className="py-2.5 pr-3">
                  {vendor.blacklisted ? (
                    <span className="inline-flex items-center gap-1.5 text-destructive">
                      <Ban className="h-3.5 w-3.5" />
                      Barred
                    </span>
                  ) : vendor.active ? (
                    <span className="inline-flex items-center gap-1.5 text-ok">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      In use
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Retired</span>
                  )}
                  {vendor.blacklisted && vendor.blacklist_reason && (
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {vendor.blacklist_reason}
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openFor(vendor)}
                      aria-label={`Edit ${vendor.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[12px]"
                      onClick={() =>
                        updateVendor.mutate({
                          id: vendor.id,
                          patch: { active: !vendor.active },
                        })
                      }
                    >
                      {vendor.active ? "Retire" : "Restore"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-7 px-2 text-[12px]",
                        !vendor.blacklisted && "text-destructive hover:text-destructive",
                      )}
                      onClick={() => {
                        if (vendor.blacklisted) {
                          if (!user) return;
                          setBlacklist.mutate({
                            id: vendor.id,
                            blacklisted: false,
                            reason: null,
                            userId: user.id,
                          });
                        } else {
                          setBarring(vendor);
                          setBarReason("");
                        }
                      }}
                    >
                      {vendor.blacklisted ? "Lift the bar" : "Bar"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        A firm is never deleted. Once it has been invited to or bid on anything, its name is part
        of that record — retire it to take it out of the pickers, or bar it to say why it is out.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit the firm" : "Add a firm"}</DialogTitle>
            <DialogDescription>
              Only the name is required. Everything else makes the firm easier to find and the
              paperwork easier to fill in later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="vendor-name" className="text-[13px]">
                Name
              </Label>
              <Input
                id="vendor-name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Has to be unique. If a firm is already here under a slightly different spelling,
                edit that one rather than adding a second.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="vendor-registration" className="text-[13px]">
                  Registration number
                </Label>
                <Input
                  id="vendor-registration"
                  value={form.registrationId}
                  onChange={(event) => set("registrationId", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-msme" className="text-[13px]">
                  MSME category
                </Label>
                <Select
                  value={form.msmeCategory || "unset"}
                  onValueChange={(value) =>
                    set("msmeCategory", value === "unset" ? "" : (value as MsmeCategory))
                  }
                >
                  <SelectTrigger id="vendor-msme" className="mt-1.5">
                    <SelectValue placeholder="Not stated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not stated</SelectItem>
                    {Object.entries(MSME_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="vendor-gst" className="text-[13px]">
                  GST number
                </Label>
                <Input
                  id="vendor-gst"
                  value={form.gstNumber}
                  onChange={(event) => set("gstNumber", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-pan" className="text-[13px]">
                  PAN
                </Label>
                <Input
                  id="vendor-pan"
                  value={form.panNumber}
                  onChange={(event) => set("panNumber", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-contact" className="text-[13px]">
                  Who to speak to
                </Label>
                <Input
                  id="vendor-contact"
                  value={form.contactPerson}
                  onChange={(event) => set("contactPerson", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-email" className="text-[13px]">
                  Email
                </Label>
                <Input
                  id="vendor-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set("email", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-phone" className="text-[13px]">
                  Telephone
                </Label>
                <Input
                  id="vendor-phone"
                  value={form.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-city" className="text-[13px]">
                  Town
                </Label>
                <Input
                  id="vendor-city"
                  value={form.city}
                  onChange={(event) => set("city", event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="vendor-state" className="text-[13px]">
                  State
                </Label>
                <Input
                  id="vendor-state"
                  value={form.state}
                  onChange={(event) => set("state", event.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vendor-notes" className="text-[13px]">
                Notes
              </Label>
              <Textarea
                id="vendor-notes"
                value={form.notes}
                onChange={(event) => set("notes", event.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!form.name.trim() || createVendor.isPending || updateVendor.isPending}
            >
              {editing ? "Save" : "Add the firm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(barring)} onOpenChange={(next) => !next && setBarring(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bar {barring?.name}?</DialogTitle>
            <DialogDescription>
              A barred firm cannot be picked on any new tender. Its name stays on everything it
              has already bid for, which is the point of barring rather than deleting.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="vendor-bar-reason" className="text-[13px]">
              Why
            </Label>
            <Textarea
              id="vendor-bar-reason"
              value={barReason}
              onChange={(event) => setBarReason(event.target.value)}
              rows={3}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              This shows on the register beside the firm, so write it for whoever reads it next.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBarring(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!barReason.trim()}
              onClick={() => {
                if (!user || !barring) return;
                setBlacklist.mutate(
                  {
                    id: barring.id,
                    blacklisted: true,
                    reason: barReason.trim(),
                    userId: user.id,
                  },
                  { onSuccess: () => setBarring(null) },
                );
              }}
            >
              Bar the firm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormSection>
  );
}
