import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useBidders,
  useGrnCloseGaps,
  useGrnCycles,
  useGrnForwardGaps,
  useGrnLines,
  useGrnSummary,
  useLiveGoodsReceipt,
  usePurchaseOrder,
  useSaveGrnLine,
} from "../hooks/useProcurement";
import { FormSection } from "../components/FormSection";
import { ReadinessChecklist } from "../components/ReadinessChecklist";
import { grnCloseChecks } from "../lib/grnChecks";
import { formatMoney } from "../lib/format";
import type { CaseListItem, GrnLine, ProcurementStage } from "../types";

/**
 * The goods receipt desk.
 *
 * One open delivery cycle at a time, seeded from the issued order's own
 * lines. Closing a cycle (`grn.close_cycle`, a holding action on the
 * ordinary action bar) reopens the next one automatically if a balance
 * remains — the officer never has to notice that themselves. Forwarding to
 * payment (`grn.forward`) needs the current cycle closed, not a full
 * receipt; a short delivery can go forward exactly like a complete one.
 */
export function GoodsReceiptPanel({ procurementCase, stage }: { procurementCase: CaseListItem; stage: ProcurementStage }) {
  const { can } = useAuth();
  const caseId = procurementCase.id;

  const { data: liveGrn, isLoading } = useLiveGoodsReceipt(caseId);
  const { data: cycles } = useGrnCycles(caseId);
  const { data: lines } = useGrnLines(liveGrn?.id);
  const { data: summary } = useGrnSummary(caseId);
  const { data: closeGaps } = useGrnCloseGaps(caseId);
  const { data: forwardGaps } = useGrnForwardGaps(caseId);
  const { data: po } = usePurchaseOrder(caseId);
  const { data: bidders } = useBidders(caseId);

  const saveLine = useSaveGrnLine();

  const atThisDesk =
    stage === "goods_receipt" &&
    procurementCase.stage === "goods_receipt" &&
    procurementCase.case_status === "open";
  const canRecord = can("grn.create");
  const isOpen = liveGrn?.status === "open";
  const readOnly = !atThisDesk || !canRecord || !isOpen;

  const vendor = bidders?.find((b) => b.id === po?.recommended_bidder_id);

  const checks = grnCloseChecks({
    hasDelivery: !(closeGaps ?? []).includes("At least one line actually delivered"),
    fullyClassified: !(closeGaps ?? []).includes("Every delivered line classified as accepted or rejected"),
  });

  const priorCycles = (cycles ?? []).filter((c) => c.id !== liveGrn?.id);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!liveGrn) {
    return (
      <section className="rounded-lg border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
        The receipt has not been seeded yet — refresh once the case has fully arrived.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {isOpen ? (
        <ReadinessChecklist
          checks={checks}
          serverGaps={closeGaps}
          completeMessage="Ready to close this delivery — use the action bar."
          hint="Closing reopens a new delivery automatically if a balance is left; forwarding to payment does not need everything received."
        />
      ) : (
        <div className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          {liveGrn.status === "forwarded"
            ? "Forwarded to the payment desk."
            : "This delivery is closed."}
          {(forwardGaps ?? []).length === 0 && liveGrn.status === "closed"
            ? " Ready to forward — use the action bar."
            : ""}
        </div>
      )}

      <FormSection
        label="what was ordered"
        title={vendor?.vendor?.name ?? "The order"}
        hint="Copied from the issued order — the delivery cycle below is what actually arrived against it."
      >
        {summary && summary.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-1.5">#</th>
                  <th className="pb-1.5">Item</th>
                  <th className="pb-1.5 text-right">Ordered</th>
                  <th className="pb-1.5 text-right">Accepted so far</th>
                  <th className="pb-1.5 text-right">Rejected so far</th>
                  <th className="pb-1.5 text-right">Accepted value</th>
                  <th className="pb-1.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.line_no} className="border-t border-border">
                    <td className="py-1.5 text-muted-foreground">{row.line_no}</td>
                    <td className="py-1.5 text-foreground">{row.item_name}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{row.ordered_qty} {row.unit}</td>
                    <td className="py-1.5 text-right text-foreground">{row.total_accepted_qty}</td>
                    <td className="py-1.5 text-right text-destructive">{row.total_rejected_qty || "—"}</td>
                    <td className="py-1.5 text-right text-foreground">{formatMoney(row.total_accepted_value)}</td>
                    <td className="py-1.5 text-right">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-[0.12em]",
                          row.fully_received ? "text-ok" : "text-muted-foreground",
                        )}
                      >
                        {row.fully_received ? "complete" : "partial"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      <FormSection
        label={`delivery cycle ${liveGrn.cycle}`}
        title={isOpen ? "Record what arrived" : "This delivery, as recorded"}
        hint="Delivered, accepted and rejected are per this delivery only — not the running total. Rejecting anything needs a stated reason."
      >
        <div id="grn-lines" className="space-y-3">
          {(lines ?? []).map((line) => (
            <GrnLineRow
              key={line.id}
              line={line}
              readOnly={readOnly}
              onSave={(args) => saveLine.mutate({ lineId: line.id, ...args })}
            />
          ))}
        </div>
      </FormSection>

      {priorCycles.length > 0 && (
        <FormSection label="history" title="Earlier deliveries" hint="Each closed cycle is a separate, unedited record.">
          <div className="space-y-2">
            {priorCycles.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[12px]">
                <span>Delivery {c.cycle}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.status}</span>
              </div>
            ))}
          </div>
        </FormSection>
      )}
    </div>
  );
}

function GrnLineRow({
  line,
  readOnly,
  onSave,
}: {
  line: GrnLine;
  readOnly: boolean;
  onSave: (args: { deliveredQty: number; acceptedQty: number; rejectedQty: number; discrepancyReason: string | null }) => void;
}) {
  const [delivered, setDelivered] = useState(String(line.delivered_qty));
  const [accepted, setAccepted] = useState(String(line.accepted_qty));
  const [rejected, setRejected] = useState(String(line.rejected_qty));
  const [reason, setReason] = useState(line.discrepancy_reason ?? "");

  useEffect(() => {
    setDelivered(String(line.delivered_qty));
    setAccepted(String(line.accepted_qty));
    setRejected(String(line.rejected_qty));
    setReason(line.discrepancy_reason ?? "");
  }, [line]);

  const remaining = Number(line.ordered_qty) - Number(line.previously_accepted_qty);
  const rejectedNum = Number(rejected) || 0;

  const submit = () => {
    const d = Number(delivered) || 0;
    const a = Number(accepted) || 0;
    const r = Number(rejected) || 0;
    if (a + r > d) {
      toast.error("Accepted plus rejected cannot exceed what was delivered.");
      return;
    }
    if (r > 0 && !reason.trim()) {
      toast.error("A reason is needed to reject any quantity.");
      return;
    }
    onSave({ deliveredQty: d, acceptedQty: a, rejectedQty: r, discrepancyReason: r > 0 ? reason : null });
  };

  return (
    <div className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-foreground">
          {line.line_no}. {line.item_name}
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Ordered {line.ordered_qty} {line.unit} — {remaining} still owed
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <label className="text-[11px] text-muted-foreground">Delivered</label>
          <Input value={delivered} onChange={(e) => setDelivered(e.target.value)} disabled={readOnly} className="mt-1 h-8 text-[13px]" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Accepted</label>
          <Input value={accepted} onChange={(e) => setAccepted(e.target.value)} disabled={readOnly} className="mt-1 h-8 text-[13px]" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Rejected</label>
          <Input value={rejected} onChange={(e) => setRejected(e.target.value)} disabled={readOnly} className="mt-1 h-8 text-[13px]" />
        </div>
      </div>
      {rejectedNum > 0 && (
        <Textarea
          placeholder="Why this quantity is being rejected — required."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={readOnly}
          rows={2}
          className="mt-2 text-[13px]"
        />
      )}
      {!readOnly && (
        <Button size="sm" variant="outline" className="mt-2 h-7 px-2 text-[11px]" onClick={submit}>
          Save this line
        </Button>
      )}
    </div>
  );
}
