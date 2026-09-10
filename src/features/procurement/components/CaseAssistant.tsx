import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Maximize2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAskAboutCase, useCaseDocumentReadiness } from "../hooks/useProcurement";
import type { CaseAnswerSource } from "../api/assistant";

type Turn = { question: string; answer: string; sources: CaseAnswerSource[] };

/** Openers that suit any case, so nobody faces an empty box. */
const STARTERS = [
  "What is being bought, and how much of it?",
  "What are the delivery and payment terms?",
  "What has been decided so far, and by whom?",
];

/**
 * Ask questions about one case's paperwork.
 *
 * Everything attached to a case goes through the product's ordinary ingest —
 * read, chunked, embedded — so this is the same assistant the archive uses,
 * pointed at this case. Retrieval is scoped in the database to the documents
 * on the case, and only for people the case policies let read it.
 */
export function CaseAssistant({
  caseId,
  caseNo,
  scope,
  onClearScope,
}: {
  caseId: string;
  caseNo: string;
  /**
   * Narrows retrieval to one bidder's own submission.
   *
   * Across the whole case, "does this firm hold a valid licence?" happily
   * retrieves the licence a *different* bidder sent and answers yes. Scoped,
   * an absent certificate looks absent — which on a qualification question is
   * the difference between a gap and a wrong answer.
   */
  scope?: { bidderId: string; vendorName: string } | null;
  onClearScope?: () => void;
}) {
  const { data: readiness } = useCaseDocumentReadiness(caseId);
  const ask = useAskAboutCase();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // A long-running conversation, or one answer with a wide table, outgrows
  // this rail fast; expanding hands the same live conversation a full-size
  // surface instead of a copy of it.
  const [expanded, setExpanded] = useState(false);

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || ask.isPending) return;
    setQuestion("");
    try {
      const result = await ask.mutateAsync({
        caseId,
        query,
        conversationId,
        bidderId: scope?.bidderId ?? null,
      });
      setConversationId(result.conversationId);
      setTurns((current) => [
        ...current,
        { question: query, answer: result.answer, sources: result.sources },
      ]);
    } catch {
      // useAskAboutCase already said what went wrong.
    }
  };

  const nothingToRead = (readiness?.total ?? 0) === 0;
  const stillReading = readiness?.still_reading ?? 0;
  const title = scope ? `Ask about ${scope.vendorName}` : "Ask about this case";

  const body = (
    <div className="space-y-4 px-5 py-5">
      {turns.map((turn, index) => (
        <div key={index} className="space-y-2">
          <p className="text-[13px] font-medium text-foreground">{turn.question}</p>
          <div className="overflow-x-auto border-l-2 border-border pl-3">
            <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
            </div>
          </div>
          {turn.sources.length > 0 && (
            <p className="pl-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              from{" "}
              {[
                ...new Set(
                  turn.sources.map((source) => source.document_title ?? "an attachment"),
                ),
              ].join(" · ")}
            </p>
          )}
        </div>
      ))}

      {turns.length === 0 && !nothingToRead && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => send(starter)}
              className="rounded-full border border-border px-3 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {starter}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          rows={2}
          value={question}
          placeholder={
            scope
              ? `Ask about what ${scope.vendorName} sent…`
              : `Ask something about ${caseNo}…`
          }
          disabled={nothingToRead}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(question);
            }
          }}
        />
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-muted-foreground">
            Answers cite the paperwork they came from.
          </p>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={nothingToRead || ask.isPending || !question.trim()}
            onClick={() => void send(question)}
          >
            {ask.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Ask
          </Button>
        </div>
      </div>
    </div>
  );

  const header = (
    <header className="border-b border-border px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={expanded ? "Collapse" : "Expand"}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="sr-only">{expanded ? "Collapse" : "Expand"} the assistant</span>
        </button>
      </div>
      {scope && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-[12px] text-foreground">
            Reading only what <span className="font-medium">{scope.vendorName}</span> sent
            with their bid.
          </span>
          {onClearScope && (
            <button
              type="button"
              onClick={onClearScope}
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              whole case
            </button>
          )}
        </div>
      )}
      <p className="mt-1 text-[13px] text-muted-foreground">
        {nothingToRead
          ? "Nothing is attached yet. Anything you attach is read and indexed, and can then be asked about here."
          : `Answers come from the ${readiness?.indexed ?? 0} document(s) on ${caseNo} that have been read.`}
        {stillReading > 0 && ` ${stillReading} more still being read.`}
      </p>
    </header>
  );

  return (
    <section id="case-assistant" className="rounded-lg border border-border bg-card">
      {header}
      {!expanded && body}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">{body}</div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
