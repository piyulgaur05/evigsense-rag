import { useState } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useClarifications, usePostClarification, useResolveClarification } from "../hooks/useProcurement";
import { formatDateTime } from "../lib/format";
import type { ProcurementStage } from "../types";

/**
 * Questions and send-backs on the case. A send-back is written by the stage
 * engine when the case moves backwards; a question is written here and leaves
 * the case where it is.
 */
export function ClarificationThread({
  caseId,
  stage,
}: {
  caseId: string;
  stage: ProcurementStage;
}) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useClarifications(caseId);
  const post = usePostClarification();
  const resolve = useResolveClarification(caseId);
  const [body, setBody] = useState("");

  const send = async () => {
    if (!user || !body.trim()) return;
    await post.mutateAsync({ caseId, fromStage: stage, body: body.trim(), authorId: user.id });
    setBody("");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        questions
      </p>

      {isLoading ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Loading the thread…</p>
      ) : !messages?.length ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Nothing has been asked about this case.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "rounded-md border px-3 py-2.5",
                message.kind === "send_back"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-background",
                message.resolved_at && "opacity-60",
              )}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {message.kind === "send_back" ? "sent back" : "asked"} at{" "}
                {message.from_stage.replace(/_/g, " ")}
                {message.to_stage ? ` → ${message.to_stage.replace(/_/g, " ")}` : ""} ·{" "}
                {formatDateTime(message.created_at)}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-foreground">
                {message.body}
              </p>
              {!message.resolved_at && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1.5 h-7 px-2 text-[12px]"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(message.id)}
                >
                  <CornerDownLeft className="mr-1.5 h-3.5 w-3.5" />
                  Mark answered
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Ask something about this case."
          className="text-[13px]"
        />
        <Button
          size="sm"
          className="mt-2"
          disabled={!body.trim() || post.isPending}
          onClick={() => void send()}
        >
          {post.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Post question
        </Button>
      </div>
    </section>
  );
}
