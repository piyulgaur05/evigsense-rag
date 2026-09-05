import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
export function CaseAssistant({ caseId, caseNo }: { caseId: string; caseNo: string }) {
  const { data: readiness } = useCaseDocumentReadiness(caseId);
  const ask = useAskAboutCase();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || ask.isPending) return;
    setQuestion("");
    try {
      const result = await ask.mutateAsync({ caseId, query, conversationId });
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

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Ask about this case
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {nothingToRead
            ? "Nothing is attached yet. Anything you attach is read and indexed, and can then be asked about here."
            : `Answers come from the ${readiness?.indexed ?? 0} document(s) on ${caseNo} that have been read.`}
          {stillReading > 0 && ` ${stillReading} more still being read.`}
        </p>
      </header>

      <div className="space-y-4 px-5 py-5">
        {turns.map((turn, index) => (
          <div key={index} className="space-y-2">
            <p className="text-[13px] font-medium text-foreground">{turn.question}</p>
            <div className="prose prose-sm max-w-none border-l-2 border-border pl-3 text-[13px] leading-relaxed text-foreground dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.answer}</ReactMarkdown>
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
            placeholder={`Ask something about ${caseNo}…`}
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
    </section>
  );
}
