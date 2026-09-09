import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Read a bill of quantities out of a file the requester already has.
 *
 * A buyer is handed a spreadsheet from a supplier or a scope-of-work PDF from
 * an engineer, and retyping thirty lines into a form is where the errors come
 * from. Either the caller sends the text (a spreadsheet the browser already
 * parsed) or the id of a document attached to the case, whose extracted text
 * the ingest pipeline has already produced.
 *
 * Nothing is written: the answer goes back to the requester to review, correct
 * and accept. An extraction that quietly saved itself would be worse than
 * retyping, because nobody would check it.
 */
const requestSchema = z.object({
  documentId: z.string().uuid().optional(),
  text: z.string().max(400_000).optional(),
  /** Only used to label the result; the case is not written to. */
  caseId: z.string().uuid().optional(),
}).refine((v) => Boolean(v.documentId || v.text), {
  message: "Send either a documentId or the text to read",
});

/** The model sees this much; a long tender document is mostly boilerplate. */
const MAX_CHARS = 24_000;
const MAX_LINES = 200;

const lineSchema = z.object({
  item_name: z.string().trim().min(1),
  specification: z.string().trim().nullish(),
  quantity: z.union([z.number(), z.string()]).nullish(),
  unit: z.string().trim().nullish(),
  hsn_code: z.union([z.string(), z.number()]).nullish(),
  estimated_rate: z.union([z.number(), z.string()]).nullish(),
});

const SYSTEM = `You read bills of quantities out of Indian public-procurement paperwork.

You are given the text of a spreadsheet, a purchase requisition, a scope of work or a tender schedule. Return the line items it lists — the things being bought — and nothing else.

Rules:
- Return ONLY a JSON object of the form {"lines": [...], "notes": "..."}. No prose, no code fences.
- Each line: {"item_name", "specification", "quantity", "unit", "hsn_code", "estimated_rate"}.
- item_name is the thing itself, short. specification is the detail that qualifies it (make, model, grade, tolerance, standard) or null.
- quantity is a number. If the text gives no quantity for a line, use 1.
- unit is what the quantity counts: Nos., Set, Metre, Kilogram, Litre, Lot. Null if not stated.
- estimated_rate is the rate PER UNIT in rupees as a plain number — never the line total, never a string with commas or a currency symbol. Null if the text has no rate.
- hsn_code only if the text actually gives one.
- Ignore totals, subtotals, taxes, freight, terms, headers and page furniture. They are not line items.
- If the text is not a bill of quantities at all, return {"lines": [], "notes": "why"}.
- notes is one short sentence for the reader: what you read, and anything you had to assume.`;

/**
 * Models wrap JSON in fences and prose however often you ask them not to.
 *
 * The first `{` in the answer is not reliably the answer. A thinking model
 * restates the format it was asked for -- `{"lines": [...], "notes": "..."}`,
 * ellipses and all -- before it writes anything real, so taking the first
 * brace and the last one produces a span that cannot parse. Every balanced
 * object in the text is tried instead, longest first, and the first one that
 * parses wins.
 */
function parseJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Ignored: the answer has prose around it, so go looking for the object.
  }

  const candidates: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < cleaned.length; j++) {
      const ch = cleaned[j];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { candidates.push(cleaned.slice(i, j + 1)); break; }
      }
    }
  }

  // Longest first: the real answer contains the whole bill, a restated
  // template is a few dozen characters.
  candidates.sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object") return value;
    } catch {
      // Not this one.
    }
  }

  throw new Error("The model did not return JSON");
}

/** "1,25,000.00" and "₹ 4.5 lakh" both reach us; only the first is a number. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { documentId, text } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The caller must be signed in; the case policies decide the rest.
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let source = text ?? "";
    let sourceLabel = "the text you pasted";

    if (!source && documentId) {
      const { data: document, error } = await supabase
        .from("documents")
        .select("id, title, original_filename, status, content_text")
        .eq("id", documentId)
        .single();

      if (error || !document) {
        return new Response(JSON.stringify({ error: "That document is not there" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sourceLabel = document.original_filename ?? document.title ?? "the document";

      if (!document.content_text || document.content_text.trim().length < 20) {
        // The queue has it but has not finished reading it. Say so plainly
        // rather than returning an empty bill that looks like a failure.
        return new Response(
          JSON.stringify({
            pending: true,
            status: document.status,
            message: document.status === "failed"
              ? `${sourceLabel} could not be read.`
              : `${sourceLabel} is still being read. Try again in a moment.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      source = document.content_text;
    }

    const trimmed = source.slice(0, MAX_CHARS);
    const truncated = source.length > MAX_CHARS;

    const answer = await chatCompletionText(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Read the bill of quantities out of this.\n\n---\n${trimmed}\n---`,
        },
      ],
      {
        temperature: 0,
        // A thirty-line bill runs to about 3k tokens; the old 4k ceiling was
        // spent on chain-of-thought before the answer began and the response
        // came back cut off mid-sentence.
        max_tokens: 8000,
        // Constrained decoding: the backend can only emit a syntactically
        // valid object, which is a stronger guarantee than asking for one.
        response_format: { type: "json_object" },
        // Qwen3.5 reasons in plain `content` with no <think> tags to strip,
        // so a reasoning answer is indistinguishable from a real one. Turning
        // thinking off is what actually stops the deliberation; the parser
        // below is the belt to this pair of braces.
        extra: { chat_template_kwargs: { enable_thinking: false } },
      },
    );

    const object = parseJsonObject(answer) as { lines?: unknown[]; notes?: unknown };
    const rawLines = Array.isArray(object.lines) ? object.lines.slice(0, MAX_LINES) : [];

    const lines = rawLines
      .map((row) => lineSchema.safeParse(row))
      .filter((r): r is { success: true; data: z.infer<typeof lineSchema> } => r.success)
      .map((r) => {
        const quantity = toNumber(r.data.quantity);
        const rate = toNumber(r.data.estimated_rate);
        return {
          item_name: r.data.item_name.slice(0, 300),
          specification: r.data.specification?.slice(0, 1000) ?? null,
          quantity: quantity && quantity > 0 ? quantity : 1,
          unit: r.data.unit?.slice(0, 40) ?? null,
          hsn_code: r.data.hsn_code === null || r.data.hsn_code === undefined
            ? null
            : String(r.data.hsn_code).slice(0, 20),
          estimated_rate: rate && rate > 0 ? rate : null,
        };
      });

    const notes = typeof object.notes === "string" ? object.notes.slice(0, 500) : "";

    return new Response(
      JSON.stringify({
        lines,
        notes,
        source: sourceLabel,
        truncated,
        total: lines.reduce((sum, l) => sum + l.quantity * (l.estimated_rate ?? 0), 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("extract-boq failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
