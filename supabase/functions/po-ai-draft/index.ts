import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { chatCompletionText, getChatModel } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Drafts the narrative clause text for a purchase order — payment terms,
 * delivery/execution schedule, warranty and inspection, special conditions —
 * for the purchase officer to review and use as a starting point.
 *
 * A suggestion, not a decision: the result lands in
 * procurement_po_ai_drafts, never in procurement_purchase_orders itself, and
 * nothing that gates po.issue reads it — the same discipline this schema
 * already holds procurement_tec_ai_suggestions to. Grounded only in what is
 * already on file (vendor, amount, negotiated terms) rather than inventing
 * commercial terms nobody agreed to.
 */
const requestSchema = z.object({
  caseId: z.string().uuid(),
});

const draftSchema = z.object({
  payment_terms: z.string().trim().max(1200).optional(),
  delivery_terms: z.string().trim().max(1200).optional(),
  warranty_clause: z.string().trim().max(1200).optional(),
  special_conditions: z.string().trim().max(1200).optional(),
});

const SYSTEM = `You are drafting clause text for a purchase order, for a purchase officer to review before it goes on the order.

You are given the vendor's name, the order value, and whatever payment/delivery/warranty terms were already negotiated or recorded upstream. Draft plain-language clauses that state those facts formally — do not invent a commercial term (a discount, a penalty rate, a payment schedule) that was not given to you.

Rules:
- Return ONLY a JSON object: {"payment_terms": "...", "delivery_terms": "...", "warranty_clause": "...", "special_conditions": "..."}. No prose, no code fences.
- payment_terms: one paragraph stating when and how payment is released, built from whatever payment terms were given; if none were given, state a standard "on satisfactory delivery and acceptance" clause without inventing a percentage split.
- delivery_terms: one paragraph covering the delivery date/window and delivery location already on file.
- warranty_clause: one paragraph covering the warranty period already on file, and standard inspection-on-receipt language.
- special_conditions: one short paragraph of standard boilerplate (packing, marking, compliance with the order's specifications) — leave it a generic, uncontroversial clause if nothing case-specific was given.
- Every field is a plain string, not further JSON. Keep each under 120 words.`;

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
    const { caseId } = parsed.data;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    // RLS-scoped: a caller who cannot see the case gets nothing back here,
    // same as the panel itself.
    const { data: po } = await supabase
      .from("procurement_purchase_orders")
      .select("case_id, po_no, total_value, delivery_date, delivery_address, payment_terms, delivery_terms, warranty_months, status, recommended_bidder_id")
      .eq("case_id", caseId)
      .maybeSingle();

    if (!po) return json({ error: "No purchase order on this case, or not one you can see" }, 404);
    if (po.status !== "draft") {
      return json({ error: "This order has already been issued" }, 409);
    }

    const { data: bidder } = await supabase
      .from("procurement_bidders")
      .select("vendor:procurement_vendors(name)")
      .eq("id", po.recommended_bidder_id)
      .maybeSingle();
    const vendorName = (bidder as { vendor?: { name?: string } | null } | null)?.vendor?.name ?? "the vendor";

    const facts = [
      `Vendor: ${vendorName}`,
      po.total_value != null ? `Order value: ${po.total_value}` : null,
      po.delivery_date ? `Delivery date already fixed: ${po.delivery_date}` : "No delivery date fixed yet.",
      po.delivery_address ? `Delivery location: ${po.delivery_address}` : null,
      po.payment_terms ? `Payment terms already on file: ${po.payment_terms}` : "No payment terms recorded upstream.",
      po.delivery_terms ? `Delivery terms already on file: ${po.delivery_terms}` : null,
      po.warranty_months ? `Warranty period already on file: ${po.warranty_months} months` : "No warranty period recorded upstream.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    const answer = await chatCompletionText(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Order ${po.po_no}:\n${facts}` },
      ],
      {
        temperature: 0.2,
        max_tokens: 1200,
        extra: { chat_template_kwargs: { enable_thinking: false } },
      },
    );

    const rawObject = parseJsonObject(answer);
    const result = draftSchema.safeParse(rawObject);
    if (!result.success) {
      throw new Error("The assistant's answer did not come back in the expected shape");
    }
    const draft = result.data;

    const { data: saved, error: saveError } = await supabase.rpc("procurement_record_po_ai_draft", {
      _case_id: caseId,
      _payment_terms_draft: draft.payment_terms ?? null,
      _delivery_terms_draft: draft.delivery_terms ?? null,
      _warranty_clause_draft: draft.warranty_clause ?? null,
      _special_conditions_draft: draft.special_conditions ?? null,
      _model: getChatModel(),
    });
    if (saveError) throw saveError;

    return json({ draft: saved });
  } catch (error) {
    console.error("po-ai-draft failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "The draft could not be produced" },
      500,
    );
  }
});
