import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVendors } from "../hooks/useProcurement";
import { MSME_LABEL } from "../lib/tender";
import type { MsmeCategory } from "../types";

/**
 * Picks a firm out of the register.
 *
 * There is deliberately no "add a new vendor" box here. A bidder that could be
 * typed freehand is a bidder that can be a typo, and the register exists so
 * that the same firm is the same row on every tender it bids for — which is
 * what makes anything downstream countable. Adding a firm is a trip to the
 * register, and the link below says so rather than leaving the officer stuck.
 */
export function VendorPicker({
  id,
  value,
  onChange,
  disabled,
  exclude = [],
  placeholder = "Choose a vendor",
  className,
}: {
  id?: string;
  value: string | null;
  onChange: (vendorId: string) => void;
  disabled?: boolean;
  /** Firms already on this tender, so the list does not offer them twice. */
  exclude?: string[];
  placeholder?: string;
  className?: string;
}) {
  const { data: vendors, isLoading } = useVendors();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = vendors?.find((vendor) => vendor.id === value) ?? null;

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vendors ?? [])
      .filter((vendor) => vendor.id === value || !exclude.includes(vendor.id))
      .filter(
        (vendor) =>
          !term ||
          vendor.name.toLowerCase().includes(term) ||
          (vendor.registration_id ?? "").toLowerCase().includes(term),
      );
  }, [vendors, search, exclude, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.name ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or registration number"
            className="h-7 border-0 px-0 text-[13px] shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {shown.length === 0 && (
            <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">
              {search ? "No firm by that name." : "The register is empty."}
            </p>
          )}
          {shown.map((vendor) => (
            <button
              key={vendor.id}
              type="button"
              onClick={() => {
                onChange(vendor.id);
                setOpen(false);
                setSearch("");
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent"
            >
              <Check
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  vendor.id === value ? "text-ok" : "invisible",
                )}
              />
              <span className="min-w-0">
                <span className="block truncate">{vendor.name}</span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {[
                    vendor.registration_id,
                    vendor.msme_category
                      ? MSME_LABEL[vendor.msme_category as MsmeCategory]
                      : null,
                    vendor.city,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no registration number"}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-border px-3 py-2">
          <Link
            to="/procurement/admin"
            className="text-[12px] text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            Not on the register? Add the firm there first.
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
