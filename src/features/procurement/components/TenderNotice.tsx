import { formatMoney } from "../lib/format";
import { noticeTerms, type NoticeSnapshot } from "../lib/tenderNotice";

/**
 * The notice as it was issued.
 *
 * Everything here comes off the snapshot passed in — never off the tender row.
 * A notice that re-rendered from live state would change under a bidder who had
 * already read it, which is the one thing a notice may not do.
 */
export function TenderNotice({
  notice,
  heading,
}: {
  notice: NoticeSnapshot;
  heading: string;
}) {
  const terms = noticeTerms(notice);

  return (
    <article className="space-y-6 text-[13px] text-foreground">
      <header className="border-b border-border pb-4">
        <h3 className="font-display text-[1.375rem] leading-tight">{heading}</h3>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {[notice.reference_no, notice.case_no, notice.department].filter(Boolean).join(" · ")}
        </p>
      </header>

      {notice.title && <p className="text-[15px] font-medium">{notice.title}</p>}
      {notice.scope_summary && (
        <p className="whitespace-pre-line text-muted-foreground">{notice.scope_summary}</p>
      )}

      <section>
        <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          terms
        </h4>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {terms.map((term) => (
            <div key={term.label} className="flex gap-2">
              <dt className="w-40 shrink-0 text-muted-foreground">{term.label}</dt>
              <dd className="min-w-0 tabular-nums">{term.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {notice.eligibility && (
        <section>
          <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            who may bid
          </h4>
          <p className="mt-2 whitespace-pre-line">{notice.eligibility}</p>
        </section>
      )}

      {notice.invitees.length > 0 && (
        <section>
          <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            invited to bid
          </h4>
          <p className="mt-2">{notice.invitees.join(", ")}</p>
        </section>
      )}

      {notice.items.length > 0 && (
        <section>
          <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            schedule of requirements
          </h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-normal">#</th>
                  <th className="py-1.5 pr-3 font-normal">Item</th>
                  <th className="py-1.5 pr-3 text-right font-normal">Quantity</th>
                  <th className="py-1.5 text-right font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {notice.items.map((item) => (
                  <tr key={item.line_no} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{item.line_no}</td>
                    <td className="py-2 pr-3">
                      {item.item_name}
                      {item.specification && (
                        <span className="block text-muted-foreground">{item.specification}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {item.quantity} {item.unit ?? ""}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(item.line_amount)}</td>
                  </tr>
                ))}
              </tbody>
              {notice.estimated_value !== null && (
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-2 pr-3 text-right text-muted-foreground">
                      Estimated value
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatMoney(notice.estimated_value)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </article>
  );
}
