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
 * Drafts the recommendation note that goes with a payment recommendation —
 * the one piece of this stage that is prose rather than a figure.
 *
 * A suggestion, not a decision: the result lands in
 * procurement_payment_ai_drafts, never in procurement_payment_recommendations
 * itself, and nothing that gates payment.clear reads it — the same
 * discipline this schema already holds procurement_po_ai_drafts and
 * procurement_tec_ai_suggestions to. Grounded only in figures already on
 * file; never asked to invent an amount.
 */
const requestSchema = z.object({
  caseId: z.string().uuid(),
});

const draftSchema = z.object({
  recommendation_note: z.string().trim().max(1200).optional(),
});

const SYSTEM = `You are drafting the recommendation note for a payment recommendation, for a finance officer to review before it goes on the record.

You are given the vendor's name, the accepted delivery value from goods receipt, the invoice number/date/amount, any penalty deduction, and the computed recommended payment amount. Draft a short, formal note recommending the payment — state the facts you were given, do not invent a figure, a reason for any deduction, or a policy that was not given to you.

Rules:
- Return ONLY a JSON object: {"recommendation_note": "..."}. No prose, no code fences.
- One or two sentences, plain and formal: which invoice, against what accepted value, at what recommended amount, and that it is recommended for clearance.
- If a penalty deduction is present, mention that a deduction was applied without guessing why, unless a reason was given to you.
- Under 120 words.`;

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

    const { data: pay } = await supabase
      .from("procurement_payment_recommendations")
      .select("case_id, accepted_value, invoice_number, invoice_date, invoice_amount, penalty_deductions, recommended_amount, status")
      .eq("case_id", caseId)
      .maybeSingle();

    if (!pay) return json({ error: "No payment recommendation on this case, or not one you can see" }, 404);
    if (pay.status !== "pending") {
      return json({ error: "This payment has already been cleared" }, 409);
    }

    const { data: po } = await supabase
      .from("procurement_purchase_orders")
      .select("recommended_bidder_id")
      .eq("case_id", caseId)
      .maybeSingle();

    let vendorName = "the vendor";
    if (po?.recommended_bidder_id) {
      const { data: bidder } = await supabase
        .from("procurement_bidders")
        .select("vendor:procurement_vendors(name)")
        .eq("id", po.recommended_bidder_id)
        .maybeSingle();
      vendorName = (bidder as { vendor?: { name?: string } | null } | null)?.vendor?.name ?? vendorName;
    }

    const facts = [
      `Vendor: ${vendorName}`,
      `Accepted value from goods receipt: ${pay.accepted_value}`,
      pay.invoice_number ? `Invoice number: ${pay.invoice_number}` : "No invoice number recorded yet.",
      pay.invoice_date ? `Invoice date: ${pay.invoice_date}` : "No invoice date recorded yet.",
      `Invoice amount: ${pay.invoice_amount}`,
      pay.penalty_deductions > 0 ? `Penalty deduction applied: ${pay.penalty_deductions}` : "No penalty deduction.",
      `Recommended amount (invoice less deduction): ${pay.recommended_amount}`,
    ].join("\n");

    const answer = await chatCompletionText(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: facts },
      ],
      {
        temperature: 0.2,
        max_tokens: 400,
        extra: { chat_template_kwargs: { enable_thinking: false } },
      },
    );

    const rawObject = parseJsonObject(answer);
    const result = draftSchema.safeParse(rawObject);
    if (!result.success) {
      throw new Error("The assistant's answer did not come back in the expected shape");
    }

    const { data: saved, error: saveError } = await supabase.rpc("procurement_record_payment_ai_draft", {
      _case_id: caseId,
      _recommendation_note: result.data.recommendation_note ?? null,
      _model: getChatModel(),
    });
    if (saveError) throw saveError;

    return json({ draft: saved });
  } catch (error) {
    console.error("payment-ai-draft failed:", error);
    return json(
      { error: error instanceof Error ? error.message : "The draft could not be produced" },
      500,
    );
  }
});
