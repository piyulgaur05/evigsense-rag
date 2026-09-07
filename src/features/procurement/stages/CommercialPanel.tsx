import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useBidders,
  useCommercialGaps,
  useCommercialLineComparison,
  useCommercialQuotes,
  useCommercialRanking,
  useCommercialReasonableness,
  useCommercialRecord,
  useSaveQuote,
  useSetRankingBasis,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { ComparativeMatrix } from "../components/ComparativeMatrix";
import { commercialChecks } from "../lib/commercialChecks";
import { COMMERCIAL_COMPLIANCE_LABEL, RANKING_BASIS_LABEL, reasonablenessTier } from "../lib/commercial";
import { formatMoney } from "../lib/format";
import type {
  CaseListItem,
  CommercialCompliance,
  ProcurementStage,
  RankingBasis,
} from "../types";

/**
 * The commercial desk.
 *
 * Bids are opened by the head of division's own signed action, then priced
 * against every published bill line so an evaluated cost can be worked out —
 * base price plus tax, freight and other charges, less any discount, plus a
 * stated loading. Nothing here ranks by the amount a firm quoted; the ranking
 * reads the evaluated cost the database derived, on whatever basis this case
 * has chosen.
 */
export function CommercialPanel({
  procurementCase,
  stage,
  onAskAbout,
}: {
  procurementCase: CaseListItem;
  stage: ProcurementStage;
  onAskAbout?: (bidderId: string, vendorName: string) => void;
}) {
  const { can } = useAuth();
  const caseId = procurementCase.id;

  const { data: bidders, isLoading: loadingBidders } = useBidders(caseId);
  const { data: record } = useCommercialRecord(caseId);
  const { data: quotes } = useCommercialQuotes(caseId);
  const { data: ranking } = useCommercialRanking(caseId);
  const { data: matrix } = useCommercialLineComparison(caseId);
  const { data: reasonableness } = useCommercialReasonableness(caseId);
  const { data: gaps } = useCommercialGaps(caseId);
  const saveQuote = useSaveQuote();
  const setBasis = useSetRankingBasis();

  const atThisDesk =
    stage === "commercial" &&
    procurementCase.stage === "commercial" &&
    procurementCase.case_status === "open";
  const quotesLocked = record?.quote_status === "locked";
  const canPrice = can("commercial.evaluate");
  const readOnly = !atThisDesk || quotesLocked;

  const received = useMemo(
    () => (bidders ?? []).filter((bidder) => bidder.status === "received"),
    [bidders],
  );

  const checks = commercialChecks({
    openingApproved: !(gaps ?? []).includes(
      "The head of division to approve opening the commercial bids",
    ),
    anyoneRankable: !(gaps ?? []).includes("At least one priced bid that can be ranked"),
    everyBidCalled: !(gaps ?? []).includes("A commercial compliance call on every bid received"),
    scheduleCurrent: !(gaps ?? []).some((gap) => gap.startsWith("A price schedule read")),
  });

  if (loadingBidders) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const tier = reasonablenessTier(reasonableness?.status ?? null);

  return (
    <div className="space-y-6" id="commercial-opening">
      <ReadinessChecklist
        checks={checks}
        serverGaps={gaps}
        completeMessage="The bids compared here are ready for the comparative statement."
        hint="The head of division opens the bids from the action bar below; pricing and the compliance call happen here."
      />

      <FormSection
        label="the estimate"
        title="How this compares"
        hint="One check: the recommended cost against the estimate the bidders quoted against, grossed up by the tender's own tax rate. There is no market-rate or last-purchase-price comparison here."
      >
        {reasonableness ? (
          <div className="grid gap-px overflow-x-auto bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Estimate (inclusive)
              </p>
              <p className="mt-1.5 text-[13px] tabular-nums text-foreground">
                {formatMoney(reasonableness.estimate_inclusive)}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                L1 evaluated cost
              </p>
              <p className="mt-1.5 text-[13px] tabular-nums text-foreground">
                {formatMoney(reasonableness.l1_cost)}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Variance
              </p>
              <p className="mt-1.5 text-[13px] tabular-nums text-foreground">
                {reasonableness.variance !== null ? formatMoney(reasonableness.variance) : "—"}
                {reasonableness.variance_pct !== null ? ` (${reasonableness.variance_pct}%)` : ""}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Position
              </p>
              <p
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 text-[13px]",
                  tier.tone === "ok" && "text-ok",
                  tier.tone === "destructive" && "text-destructive",
                  tier.tone === "muted" && "text-muted-foreground",
                )}
              >
                {tier.label}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nothing to compare yet.</p>
        )}
      </FormSection>

      <FormSection
        label="ranking"
        title="Ranked bids"
        hint="L1 is read off the evaluated cost by default. Switching the basis is itself recorded."
        action={
          !readOnly && canPrice ? (
            <Select
              value={record?.ranking_basis ?? "evaluated_cost"}
              onValueChange={(value) => setBasis.mutate({ caseId, basis: value as RankingBasis } as never)}
            >
              <SelectTrigger className="h-7 w-[190px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANKING_BASIS_LABEL) as RankingBasis[]).map((basis) => (
                  <SelectItem key={basis} value={basis} className="text-[12px]">
                    {RANKING_BASIS_LABEL[basis]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      >
        {(ranking ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
            No bid has a price on file yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Firm</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Evaluated cost</th>
                  <th className="px-3 py-2">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {(ranking ?? []).map((row) => (
                  <tr
                    key={row.bidder_id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      row.is_l1 && "bg-ok/5",
                    )}
                  >
                    <td className="px-3 py-2 tabular-nums">
                      {row.eligible ? row.rank : "—"}
                      {row.is_l1 && (
                        <span className="ml-1.5 rounded-full bg-ok/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ok">
                          L1
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.vendor_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.base_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.gst_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                      {formatMoney(row.evaluated_cost)}
                    </td>
                    <td className="px-3 py-2">
                      {row.eligible ? (
                        COMMERCIAL_COMPLIANCE_LABEL[row.commercial_compliance as CommercialCompliance]
                      ) : (
                        <span className="text-muted-foreground">{row.ineligible_reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      {(matrix ?? []).length > 0 && (
        <FormSection
          label="item by item"
          title="The published bill, line by line"
          hint="Every priced rate against every published line, side by side. An item's own lowest rate need not belong to the overall L1."
        >
          <ComparativeMatrix rows={matrix ?? []} />
        </FormSection>
      )}

      <FormSection
        label="the bidders"
        title="Price each bid"
        hint="A lump figure, or a rate against every published line — read from a file, or typed by hand."
      >
        {received.length === 0 ? (
          <p
            id="commercial-bidders"
            className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground"
          >
            No bids were recorded at the tender desk.
          </p>
        ) : (
          <div id="commercial-bidders" className="space-y-4">
            {received.map((bidder) => (
              <QuoteCard
                key={bidder.id}
                caseId={caseId}
                bidderId={bidder.id}
                vendorName={bidder.vendor?.name ?? "Unnamed firm"}
                bidAmount={bidder.bid_amount}
                quote={quotes?.find((q) => q.bidder_id === bidder.id)}
                readOnly={readOnly || !canPrice}
                onSave={(args) => saveQuote.mutate({ bidderId: bidder.id, ...args })}
                onAskAbout={
                  onAskAbout ? () => onAskAbout(bidder.id, bidder.vendor?.name ?? "this firm") : undefined
                }
              />
            ))}
          </div>
        )}
      </FormSection>
    </div>
  );
}

function QuoteCard({
  caseId,
  bidderId,
  vendorName,
  bidAmount,
  quote,
  readOnly,
  onSave,
  onAskAbout,
}: {
  caseId: string;
  bidderId: string;
  vendorName: string;
  bidAmount: number | null;
  quote:
    | {
        id: string;
        base_price: number;
        gst_pct: number;
        freight: number;
        other_charges: number;
        discount: number;
        loading_amount: number;
        loading_note: string | null;
        commercial_compliance: string;
        evaluated_cost: number;
        fully_priced: boolean;
        schedule_issues: unknown;
      }
    | undefined;
  readOnly: boolean;
  onSave: (args: {
    basePrice?: number | null;
    gstPct?: number | null;
    freight?: number | null;
    otherCharges?: number | null;
    discount?: number | null;
    loadingAmount?: number | null;
    loadingNote?: string | null;
    commercialCompliance?: CommercialCompliance;
  }) => void;
  onAskAbout?: () => void;
}) {
  const [form, setForm] = useState({
    basePrice: quote?.base_price ?? bidAmount ?? 0,
    gstPct: quote?.gst_pct ?? 0,
    freight: quote?.freight ?? 0,
    otherCharges: quote?.other_charges ?? 0,
    discount: quote?.discount ?? 0,
    loadingAmount: quote?.loading_amount ?? 0,
    loadingNote: quote?.loading_note ?? "",
  });

  const issues = Array.isArray(quote?.schedule_issues) ? (quote?.schedule_issues as { code: string; detail: string }[]) : [];

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <p className="text-[14px] font-medium text-foreground">{vendorName}</p>
          <p className="text-[12px] text-muted-foreground">
            Bid on file: {bidAmount !== null ? formatMoney(bidAmount) : "not recorded"}
          </p>
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
            quote?.fully_priced ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground",
          )}
        >
          {quote?.fully_priced ? "fully priced" : "priced by hand"}
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            base and taxes
          </p>
          <div className="grid grid-cols-2 gap-2">
            <LabelledInput
              label="Base price"
              value={form.basePrice}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, basePrice: v }))}
            />
            <LabelledInput
              label="GST %"
              value={form.gstPct}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, gstPct: v }))}
            />
            <LabelledInput
              label="Freight"
              value={form.freight}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, freight: v }))}
            />
            <LabelledInput
              label="Other charges"
              value={form.otherCharges}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, otherCharges: v }))}
            />
            <LabelledInput
              label="Discount"
              value={form.discount}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, discount: v }))}
            />
            <LabelledInput
              label="Loading"
              value={form.loadingAmount}
              disabled={readOnly}
              onChange={(v) => setForm((f) => ({ ...f, loadingAmount: v }))}
            />
          </div>
          {form.loadingAmount > 0 && (
            <Textarea
              value={form.loadingNote}
              onChange={(e) => setForm((f) => ({ ...f, loadingNote: e.target.value }))}
              placeholder="Why this loading is here — a loading needs a stated reason."
              disabled={readOnly}
              rows={2}
              className="text-[12px]"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-foreground">
              Evaluated cost: {formatMoney(quote?.evaluated_cost ?? 0)}
            </p>
            {!readOnly && (
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  onSave({
                    basePrice: form.basePrice,
                    gstPct: form.gstPct,
                    freight: form.freight,
                    otherCharges: form.otherCharges,
                    discount: form.discount,
                    loadingAmount: form.loadingAmount,
                    loadingNote: form.loadingNote || null,
                  })
                }
              >
                Save
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              compliance and schedule
            </p>
            <div className="flex gap-1.5">
              {onAskAbout && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onAskAbout}>
                  Ask about this bid
                </Button>
              )}
            </div>
          </div>

          <Select
            value={quote?.commercial_compliance ?? "pending"}
            onValueChange={(value) => onSave({ commercialCompliance: value as CommercialCompliance })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COMMERCIAL_COMPLIANCE_LABEL) as CommercialCompliance[]).map((value) => (
                <SelectItem key={value} value={value} className="text-[12px]">
                  {COMMERCIAL_COMPLIANCE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {issues.length > 0 && (
            <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              {issues.map((issue, i) => (
                <p key={i} className="text-[11px] text-destructive">
                  {issue.detail}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelledInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <Input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 h-8 text-[13px] tabular-nums"
      />
    </label>
  );
}
