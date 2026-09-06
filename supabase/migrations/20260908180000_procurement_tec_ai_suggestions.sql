-- An AI-suggested reading of each bid, for the committee to accept or
-- override, never to stand in for a signed decision.
--
-- The tender already indexes a bidder's papers for the case assistant to
-- answer questions about; this is the same retrieval turned into a starting
-- point instead of an answer. Given the tender's own eligibility and scope
-- text plus the excerpts the assistant would cite for that one bidder, a chat
-- model reads them and proposes a score, a compliance call, a qualified
-- verdict and the evidence behind each -- one row per bidder, not per member,
-- because the suggestion is the same regardless of who asks for it.
--
-- It is deliberately not a vote and never becomes one on its own:
--   - it lives in its own table, never in procurement_tec_evaluations --
--     mixing a machine's guess into a member's signed row would make an
--     override indistinguishable from an original reading;
--   - nothing on the bidder or the case reads this table when deciding
--     whether the case can move -- procurement_guard_tec_ready looks at
--     tec_qualified alone, which only a human, signed action ever sets;
--   - it carries no signature and is not logged as a decision, only as an
--     assistant event on the timeline;
--   - regenerating it overwrites the previous suggestion (one per bidder),
--     the same way re-reading a document overwrites its own extraction --
--     there is one current suggestion, not a growing pile of stale ones.
CREATE TABLE IF NOT EXISTS public.procurement_tec_ai_suggestions (
  bidder_id         UUID PRIMARY KEY REFERENCES public.procurement_bidders(id) ON DELETE CASCADE,
  case_id           UUID NOT NULL,
  score             NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  compliance_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (compliance_status IN ('pending', 'compliant', 'non_compliant')),
  qualified         BOOLEAN,
  summary           TEXT,
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  model             TEXT,
  requested_by      UUID REFERENCES auth.users(id),
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.procurement_tec_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_procurement_tec_ai_suggestions_case
  ON public.procurement_tec_ai_suggestions (case_id);

COMMENT ON TABLE public.procurement_tec_ai_suggestions IS
  'One suggested reading per bidder, from procurement_record_tec_ai_suggestion. '
  'No client write policy, the same reasoning as procurement_tec_evaluations: '
  'this is written by the edge function on the committee''s behalf and nothing '
  'else should be able to plant a fake one.';

-- Same fix as procurement_tec_evaluation_set_case from the start: only
-- re-derive case_id when bidder_id is actually being set, so an unrelated
-- UPDATE (there is none today, but the shape is the same table) never races a
-- cascade that is also deleting the bidder.
CREATE OR REPLACE FUNCTION public.procurement_tec_ai_suggestion_set_case()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.bidder_id IS DISTINCT FROM OLD.bidder_id THEN
    SELECT case_id INTO NEW.case_id FROM public.procurement_bidders WHERE id = NEW.bidder_id;
    IF NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Bidder % does not exist', NEW.bidder_id USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_tec_ai_suggestions_case ON public.procurement_tec_ai_suggestions;
CREATE TRIGGER trg_procurement_tec_ai_suggestions_case
  BEFORE INSERT OR UPDATE ON public.procurement_tec_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.procurement_tec_ai_suggestion_set_case();

DROP TRIGGER IF EXISTS trg_procurement_tec_ai_suggestions_updated_at ON public.procurement_tec_ai_suggestions;
CREATE TRIGGER trg_procurement_tec_ai_suggestions_updated_at
  BEFORE UPDATE ON public.procurement_tec_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Written only by the edge function, on the committee's behalf -- same
-- permission and stage check as a human's own reading, but unsigned: this is
-- a suggestion, not a decision, and the table it lands in is not one anything
-- else reads when deciding whether the case can move.
CREATE OR REPLACE FUNCTION public.procurement_record_tec_ai_suggestion(
  _bidder_id UUID, _score NUMERIC, _compliance_status TEXT, _qualified BOOLEAN,
  _summary TEXT, _evidence JSONB, _model TEXT
)
RETURNS public.procurement_tec_ai_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id UUID;
  _vendor  TEXT;
  _row     public.procurement_tec_ai_suggestions;
BEGIN
  SELECT b.case_id, v.name INTO _case_id, _vendor
    FROM public.procurement_bidders b JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.id = _bidder_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No such bidder' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_tec_assert_open(_case_id);

  IF NOT (public.has_procurement_permission(auth.uid(), 'tec.evaluate')
          OR public.has_procurement_permission(auth.uid(), 'tec.chair')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold tec.evaluate' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.procurement_tec_ai_suggestions
    (bidder_id, score, compliance_status, qualified, summary, evidence, model, requested_by, generated_at)
  VALUES
    (_bidder_id, _score, _compliance_status, _qualified, _summary,
     COALESCE(_evidence, '[]'::jsonb), _model, auth.uid(), now())
  ON CONFLICT (bidder_id) DO UPDATE SET
    score = EXCLUDED.score, compliance_status = EXCLUDED.compliance_status,
    qualified = EXCLUDED.qualified, summary = EXCLUDED.summary, evidence = EXCLUDED.evidence,
    model = EXCLUDED.model, requested_by = EXCLUDED.requested_by, generated_at = EXCLUDED.generated_at
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'tec', 'tec.ai_suggestion',
    'The assistant suggested a reading for ' || COALESCE(_vendor, 'a bidder'),
    jsonb_build_object('bidder_id', _bidder_id, 'score', _score, 'qualified', _qualified));

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.procurement_record_tec_ai_suggestion(UUID, NUMERIC, TEXT, BOOLEAN, TEXT, JSONB, TEXT) TO authenticated;

CREATE POLICY "Users can read tec ai suggestions on cases in their remit"
  ON public.procurement_tec_ai_suggestions FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));
