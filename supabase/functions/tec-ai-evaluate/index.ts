import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText, embed, getChatModel } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * A suggested reading of one bid, for the technical evaluation committee.
 *
 * Same retrieval the case assistant already does when a member asks "does
 * this firm hold X" one bidder at a time — turned into a proposed score
 * instead of an answer to a question nobody typed. It is a starting point, not
 * a vote: it lands in its own table (`procurement_tec_ai_suggestions`), never
 * in a member's own signed evaluation, and nothing that decides whether the
 * case can move ever reads it. A member reviews it, edits what they disagree
 * with, and signs their own reading same as always.
 *
 * Runs on request, one bidder at a time — not automatically for a whole
 * roster, and not the moment a case reaches this desk. A tender's papers may
 * still be mid-ingest when it arrives, and a model call has a real cost; the
 * button that requests this already tells the reader when a bidder's papers
 * are not fully read yet, so a request here refuses rather than guessing.
 */
const requestSchema = z.object({
  caseId: z.string().uuid(),
  bidderId: z.string().uuid(),
});

const MAX_CONTEXT_CHARS = 12_000;
const MAX_CHUNK_CHARS = 900;
const MATCH_COUNT = 16;

const evidenceSchema = z.object({
  requirement: z.string().trim().min(1).max(240),
  finding: z.enum(["met", "not_met", "unclear"]),
  detail: z.string().trim().max(600).nullish(),
  source: z.string().trim().max(200).nullish(),
});

const suggestionSchema = z.object({
  score: z.union([z.number(), z.null()]).optional(),
  compliance_status: z.enum(["pending", "compliant", "non_compliant"]).optional(),
  qualified: z.union([z.boolean(), z.null()]).optional(),
  summary: z.string().trim().max(1200).optional(),
  evidence: z.array(evidenceSchema).max(10).optional(),
});

const SYSTEM = `You are helping a technical evaluation committee read one bidder's submission against a tender's own requirements.

You are given the tender's eligibility and scope requirements, then excerpts retrieved from ONE bidder's own documents. Judge only that bidder, only from those excerpts.

Rules:
- Return ONLY a JSON object: {"score": 0-100 or null, "compliance_status": "compliant"|"non_compliant"|"pending", "qualified": true|false|null, "summary": "...", "evidence": [...]}. No prose, no code fences.
- score is your overall technical-compliance score for this bid, 0-100. Use null only if the excerpts are too thin to score at all.
- compliance_status is your overall call. Use "pending" if the excerpts do not let you decide either way.
- qualified is your recommended verdict. Use null rather than guessing when the evidence does not support either answer.
- evidence is a list of at most 8 entries, one per requirement you actually checked: {"requirement": what you checked, "finding": "met"|"not_met"|"unclear", "detail": one sentence citing what you found or did not find, "source": the document name it came from, or null if nothing addressed it}.
- Base every finding ONLY on the excerpts given. If a requirement is not addressed anywhere in the excerpts, its finding is "unclear" or "not_met" — never "met" from silence, and never invent a source that was not given to you.
- summary is two or three sentences a committee member can read before touching anything: what stood out, and what to check with their own eyes.
- This is a suggestion for a human to review and sign, not a decision. Say so nowhere in the JSON itself — the product says it, you just answer the question asked.`;

/** Models wrap JSON in fences and prose however often you ask them not to. */
function parseJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The model did not return JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Invalid input", details: parsed.error.errors }, 400);
    }
    const { caseId, bidderId } = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // RLS-scoped reads: a caller who cannot see the case gets nothing back
    // from any of these, same as they would from the tender panel itself.
    const [{ data: bidder }, { data: tender }] = await Promise.all([
      supabase
        .from("procurement_bidders")
        .select("id, case_id, msme_category, vendor:procurement_vendors(name)")
        .eq("id", bidderId)
        .eq("case_id", caseId)
        .maybeSingle(),
      supabase
        .from("procurement_tenders")
        .select("id, eligibility, scope_summary, single_justification, mode")
        .eq("case_id", caseId)
        .maybeSingle(),
    ]);

    if (!bidder) return json({ error: "No such bid, or not one you can see" }, 404);
    if (!tender) return json({ error: "This case has no tender" }, 404);

    const vendorName = (bidder as { vendor?: { name?: string } | null }).vendor?.name ?? "This firm";

    // Read-readiness before spending a model call on it.
    const { data: submissions } = await supabase.rpc("procurement_bid_submissions", {
      _case_id: caseId,
    });
    const own = (submissions ?? []).find(
      (row: { bidder_id: string }) => row.bidder_id === bidderId,
    ) as { document_count?: number; indexed_count?: number } | undefined;

    if (!own || Number(own.document_count ?? 0) === 0) {
      return json({
        pending: true,
        message: `${vendorName} has no papers on file yet, so there is nothing to read.`,
      });
    }
    if (Number(own.indexed_count ?? 0) < Number(own.document_count ?? 0)) {
      return json({
        pending: true,
        message: `${vendorName}'s papers are still being read. Try again once they finish.`,
      });
    }

    const { data: items } = await supabase
      .from("procurement_tender_items")
      .select("item_name, specification")
      .eq("tender_id", tender.id)
      .order("line_no")
      .limit(30);

    const itemsText = (items ?? [])
      .map((it) => [it.item_name, it.specification].filter(Boolean).join(" — "))
      .filter(Boolean)
      .join("\n");

    // The eligibility/scope fields on the tender are a summary a purchase
    // officer typed by hand; the actual qualification criteria very often
    // lives only in a document filed at the requisition stage instead — a
    // "01_Qualification_Criteria..." PDF, not a paragraph in a form field.
    // Judging bidders against the typed summary alone, when that summary is
    // thin or blank, is why a real qualification criterion can go completely
    // unchecked. Case-wide documents not attributed to any bidder are the
    // requirement side of the file — the notice, the criteria, the BOQ — so
    // their own extracted text is pulled in directly rather than relying on
    // a second round of embedding retrieval to rediscover it.
    const { data: requirementDocs } = await supabase
      .from("procurement_case_documents")
      .select("document:documents(original_filename, title, content_text)")
      .eq("case_id", caseId)
      .is("bidder_id", null)
      .order("created_at", { ascending: true })
      .limit(8);

    let requirementDocsText = "";
    for (const row of (requirementDocs ?? []) as {
      document: { original_filename: string | null; title: string | null; content_text: string | null } | null;
    }[]) {
      const doc = row.document;
      if (!doc?.content_text || doc.content_text.trim().length < 20) continue;
      const label = doc.original_filename ?? doc.title ?? "Document";
      const piece = `[${label}]\n${doc.content_text.trim().slice(0, 3000)}\n\n`;
      if (requirementDocsText.length + piece.length > 6000) break;
      requirementDocsText += piece;
    }

    const requirementText = [
      tender.eligibility?.trim(),
      tender.scope_summary?.trim(),
      tender.mode === "single" ? tender.single_justification?.trim() : null,
      itemsText,
      requirementDocsText.trim(),
    ]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join("\n\n")
      .slice(0, 9000);

    if (!requirementText) {
      return json({
        pending: true,
        message: "The tender has no eligibility, scope, bill or requirement document yet for the assistant to check against.",
      });
    }

    // A shorter, retrieval-focused version of the same text for the
    // embedding query — the full requirement text (up to 9000 chars) still
    // goes to the model directly below, this is only what searches the
    // bidder's papers for relevant excerpts.
    const embeddingQuery = requirementText.slice(0, 4000);
    const queryEmbedding = await embed(embeddingQuery);
    const embeddingString = `[${queryEmbedding.join(",")}]`;

    const { data: chunks, error: searchError } = await supabase.rpc("procurement_search_case_chunks", {
      _case_id: caseId,
      _user_id: user.id,
      query_embedding: embeddingString,
      match_threshold: 0.0,
      match_count: MATCH_COUNT,
      _bidder_id: bidderId,
    });
    if (searchError) throw searchError;

    if (!chunks || chunks.length === 0) {
      return json({
        pending: true,
        message: `${vendorName}'s papers have been read but nothing in them matched the tender's requirements closely enough to work from.`,
      });
    }

    let context = "";
    for (const chunk of chunks as { document_title: string; chunk_text: string }[]) {
      const piece = `[Doc: ${chunk.document_title}]\n${chunk.chunk_text.slice(0, MAX_CHUNK_CHARS)}\n\n`;
      if (context.length + piece.length > MAX_CONTEXT_CHARS) break;
      context += piece;
    }

    const answer = await chatCompletionText(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `Tender requirements:\n---\n${requirementText}\n---\n\n` +
            `Excerpts from ${vendorName}'s own submission:\n---\n${context}\n---`,
        },
      ],
      {
        temperature: 0,
        max_tokens: 2000,
        // Qwen3.5 otherwise reasons at length in plain content with no
        // <think> wrapper for stripThinkTags to remove, which both burns the
        // token budget and leaves nothing but prose for parseJsonObject to
        // choke on. Same flag translate-document and translate-markdown use.
        extra: { chat_template_kwargs: { enable_thinking: false } },
      },
    );

    const rawObject = parseJsonObject(answer);
    const result = suggestionSchema.safeParse(rawObject);
    if (!result.success) {
      throw new Error("The assistant's answer did not come back in the expected shape");
    }
    const suggestion = result.data;

    const { data: saved, error: saveError } = await supabase.rpc(
      "procurement_record_tec_ai_suggestion",
      {
        _bidder_id: bidderId,
        _score: suggestion.score ?? null,
        _compliance_status: suggestion.compliance_status ?? "pending",
        _qualified: suggestion.qualified ?? null,
        _summary: suggestion.summary ?? null,
        _evidence: suggestion.evidence ?? [],
        _model: getChatModel(),
      },
    );
    if (saveError) throw saveError;

    return json({ suggestion: saved });
  } catch (error) {
    console.error("tec-ai-evaluate failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "The evaluation could not be produced" },
      500,
    );
  }
});
