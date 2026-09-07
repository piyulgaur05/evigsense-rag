-- The same LLM-drafting feature the purchase order stage has, for the one
-- piece of payment recommendation that is actually prose rather than a
-- figure: the recommendation note that goes with the invoice. Grounded only
-- in what is already recorded (vendor, accepted value, invoice detail,
-- computed recommended amount) -- never asked to invent a number -- and
-- lands in its own table nothing that gates `payment.clear` ever reads,
-- the same discipline procurement_po_ai_drafts and
-- procurement_tec_ai_suggestions already hold.

CREATE TABLE IF NOT EXISTS public.procurement_payment_ai_drafts (
  case_id               UUID PRIMARY KEY REFERENCES public.procurement_payment_recommendations(case_id) ON DELETE CASCADE,
  recommendation_note   TEXT,
  model                 TEXT,
  requested_by          UUID REFERENCES auth.users(id),
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_payment_ai_drafts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_payment_ai_drafts IS
  'A model''s drafted recommendation note for one payment, for the officer to review and use as a starting point. Regenerated in place; never blended into procurement_payment_recommendations on its own.';

DROP POLICY IF EXISTS "Users can read payment AI drafts on cases in their remit"
  ON public.procurement_payment_ai_drafts;
CREATE POLICY "Users can read payment AI drafts on cases in their remit"
  ON public.procurement_payment_ai_drafts FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy -- every write comes from the edge function below,
-- through the RPC, with the caller's own JWT forwarded.

CREATE OR REPLACE FUNCTION public.procurement_record_payment_ai_draft(
  _case_id             UUID,
  _recommendation_note TEXT,
  _model               TEXT
)
RETURNS public.procurement_payment_ai_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_payment_ai_drafts;
BEGIN
  PERFORM public.procurement_payment_assert_may_record(_case_id);

  INSERT INTO public.procurement_payment_ai_drafts (case_id, recommendation_note, model, requested_by, generated_at)
  VALUES (_case_id, _recommendation_note, _model, auth.uid(), now())
  ON CONFLICT (case_id) DO UPDATE SET
    recommendation_note = EXCLUDED.recommendation_note,
    model = EXCLUDED.model,
    requested_by = EXCLUDED.requested_by,
    generated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.procurement_record_payment_ai_draft(UUID, TEXT, TEXT) TO authenticated;
