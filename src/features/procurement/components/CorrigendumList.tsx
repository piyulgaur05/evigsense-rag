import { useState } from "react";
import { AlertTriangle, FileWarning, Plus, Undo2 } from "lucide-react";
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
import { useIssueCorrigendum, useRevokeCorrigendum } from "../hooks/useProcurement";
import { formatDate, formatMoney } from "../lib/format";
import { CORRIGENDUM_CATEGORIES, corrigendumCategoryLabel } from "../lib/tender";
import type { CorrigendumCategory, CorrigendumWithNotices } from "../types";

/**
 * Every amendment made after the tender went out.
 *
 * A corrigendum is how a floated tender changes at all — the published bill and
 * the roster are otherwise closed. Each one is numbered because that is how it
 * gets cited in correspondence, and each carries what the tender looked like
 * before it, which is what makes revoking possible.
 */
export function CorrigendumList({
  caseId,
  corrigenda,
  canAmend,
}: {
  caseId: string;
  corrigenda: CorrigendumWithNotices[];
  canAmend: boolean;
}) {
  const issue = useIssueCorrigendum();
  const revoke = useRevokeCorrigendum();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CorrigendumCategory>("schedule");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [newBidEnd, setNewBidEnd] = useState("");

  const latestIssued = corrigenda.filter((entry) => entry.status === "issued").at(-1);

  const submit = () => {
    issue.mutate(
      {
        caseId,
        category,
        title: title.trim() || `Corrigendum ${corrigenda.length + 1}`,
        reason: reason.trim(),
        detail: detail.trim() || null,
        newBidEndAt: newBidEnd ? new Date(newBidEnd).toISOString() : null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setReason("");
          setDetail("");
          setNewBidEnd("");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {corrigenda.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          Nothing has been amended since the tender went out.
        </p>
      ) : (
        <ol className="space-y-3">
          {corrigenda.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-border px-4 py-3 text-[13px]"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  no. {entry.serial_no} · {corrigendumCategoryLabel(entry.category)}
                </span>
                <span className="font-medium text-foreground">{entry.title}</span>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {formatDate(entry.issued_on)}
                </span>
              </div>

              <p className="mt-1.5 text-muted-foreground">{entry.reason}</p>
              {entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                {entry.new_bid_end_at && (
                  <span className="text-foreground">
                    Bids now close {formatDate(entry.new_bid_end_at)}
                  </span>
                )}
                {Number(entry.value_delta) !== 0 && (
                  <span className="tabular-nums text-foreground">
                    Value {Number(entry.value_delta) > 0 ? "up" : "down"} by{" "}
                    {formatMoney(Math.abs(Number(entry.value_delta)))}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {entry.notices.length === 0
                    ? "No bidder recorded as notified"
                    : `${entry.notices.length} notified`}
                </span>
              </div>

              {entry.needs_finance_review && entry.status === "issued" && (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This amendment moves the money, so the budget has to be looked at again before
                  the case goes on.
                </p>
              )}

              {entry.status === "revoked" ? (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  revoked — {entry.revoke_reason}
                </p>
              ) : (
                canAmend &&
                entry.id === latestIssued?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[12px]"
                    onClick={() => {
                      const why = window.prompt("Why is this corrigendum being withdrawn?");
                      if (why?.trim()) revoke.mutate({ id: entry.id, reason: why.trim() });
                    }}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                    Withdraw it
                  </Button>
                )
              )}
            </li>
          ))}
        </ol>
      )}

      {canAmend && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Issue a corrigendum
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue a corrigendum</DialogTitle>
            <DialogDescription>
              Everyone who has the notice needs to be told what changed and why. This records the
              amendment; telling the bidders is still something you do.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="corr-category" className="text-[13px]">
                What kind of change
              </Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as CorrigendumCategory)}
              >
                <SelectTrigger id="corr-category" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIGENDUM_CATEGORIES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {CORRIGENDUM_CATEGORIES.find((entry) => entry.value === category)?.hint}
              </p>
            </div>

            <div>
              <Label htmlFor="corr-title" className="text-[13px]">
                Title
              </Label>
              <Input
                id="corr-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Deadline for bids extended"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="corr-reason" className="text-[13px]">
                Why
              </Label>
              <Textarea
                id="corr-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                placeholder="Two firms asked for longer to price the works."
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                This goes on the notice, so write it for a bidder rather than for the file.
              </p>
            </div>

            {category === "schedule" && (
              <div>
                <Label htmlFor="corr-new-end" className="text-[13px]">
                  New deadline for bids
                </Label>
                <Input
                  id="corr-new-end"
                  type="datetime-local"
                  value={newBidEnd}
                  onChange={(event) => setNewBidEnd(event.target.value)}
                  className="mt-1.5"
                />
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  It has to be later than the deadline standing now. If bidding had already
                  closed, this reopens it.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="corr-detail" className="text-[13px]">
                Anything else
              </Label>
              <Textarea
                id="corr-detail"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!reason.trim() || issue.isPending}>
              <FileWarning className="mr-2 h-4 w-4" />
              Issue it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
