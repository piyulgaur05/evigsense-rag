import { useCaseEvents } from "../hooks/useProcurement";
import { formatDateTime } from "../lib/format";

/** The case's own record of itself. Append-only, written by the stage engine. */
export function CaseAudit({ caseId }: { caseId: string }) {
  const { data: events, isLoading } = useCaseEvents(caseId);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        record
      </p>

      {isLoading ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Reading the record…</p>
      ) : !events?.length ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nothing has happened yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {events.map((event) => (
            <li key={event.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-[13px] text-foreground">{event.summary}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {event.stage.replace(/_/g, " ")} · {formatDateTime(event.created_at)}
                {event.actor_role ? ` · ${event.actor_role.replace(/_/g, " ")}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
