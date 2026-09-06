-- The technical evaluation committee had a chair with four buttons and nobody
-- to press them for. `tec.chair` could recommend, query, reject or send a case
-- back, and `tec.member` held `tec.evaluate` -- a permission granted at the
-- foundation and never once checked, because nothing existed for it to gate.
-- A case landing at this desk showed both roles the bare "nothing is yours to
-- decide" fallback: correct for a member who genuinely cannot move the case,
-- misleading for a chair who has nothing to base a decision on and a member
-- who has no way to record one.
--
-- What this slice adds, kept to what actually unblocks the desk:
--   procurement_tec_checklist     four fixed governance questions, once per
--                                 case: does it match the requisition, are the
--                                 mandatory papers in, is delivery feasible,
--                                 is the bidder's eligibility verified. Shared
--                                 by the whole committee, not per-bidder.
--   procurement_tec_evaluations   one row per bidder per member: a score, a
--                                 compliance call, a qualified/not verdict,
--                                 remarks, signed. Members do not touch the
--                                 case; they each leave their own reading of
--                                 every bidder on file.
--   procurement_bidders           four new columns carrying the chair's own,
--                                 final qualification call -- separate from
--                                 any member's, and the only one that gates
--                                 the recommend action.
--
-- Left out on purpose: a spec-compliance matrix scored line-by-line against
-- the published bill, and an AI-suggested score a human then overrides. Both
-- are real things a technical evaluation can do; neither is what stands
-- between this desk and having something to do at all. Document that limit
-- rather than quietly pretend the slice is the whole stage.
--
-- The consensus a chair sees when weighing members against each other is
-- computed, not stored -- procurement_tec_case_consensus reads the evaluation
-- rows fresh every time, the same reason procurement_tender_summary is a
-- function and not a column.

-- ===== The checklist =====

CREATE TABLE IF NOT EXISTS public.procurement_tec_checklist (
  case_id    UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  item_key   TEXT NOT NULL CHECK (item_key IN (
               'specs_match_requisition', 'mandatory_documents',
               'delivery_feasible', 'eligibility_verified'
             )),
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'pass', 'fail', 'clarify')),
  remarks    TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, item_key)
);

ALTER TABLE public.procurement_tec_checklist ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_tec_checklist IS
  'Four fixed governance questions per case, shared by the whole committee -- '
  'not a per-bidder record. The four keys are seeded the moment a case reaches '
  'the tec stage; see the trigger below.';

-- ===== Per-member, per-bidder evaluations =====

CREATE TABLE IF NOT EXISTS public.procurement_tec_evaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL,
  bidder_id         UUID NOT NULL REFERENCES public.procurement_bidders(id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  score             NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  compliance_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (compliance_status IN ('pending', 'compliant', 'non_compliant')),
  qualified         BOOLEAN,
  remarks           TEXT,
  signature_id      UUID REFERENCES public.procurement_case_signatures(id) ON DELETE SET NULL,
  submitted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bidder_id, member_id)
);

ALTER TABLE public.procurement_tec_evaluations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_procurement_tec_evaluations_case
  ON public.procurement_tec_evaluations (case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_tec_evaluations_bidder
  ON public.procurement_tec_evaluations (bidder_id);

COMMENT ON TABLE public.procurement_tec_evaluations IS
  'One row per bidder per member. case_id is denormalised from the bidder, the '
  'same reasoning as procurement_bidders.case_id: every policy here is written '
  'against it. There is deliberately no client-writable RLS policy on this '
  'table -- every write goes through procurement_submit_tec_evaluation, which '
  'signs it. A signed technical verdict is a decision, not a field.';

-- Only re-derives case_id when bidder_id is actually being set: the FK from
-- signature_id back to procurement_case_signatures is ON DELETE SET NULL, so
-- deleting a case's signatures fires a plain UPDATE ... SET signature_id = NULL
-- against this table as part of the same cascade that is also deleting the
-- bidder. Re-checking the bidder on every such update raced that cascade --
-- the bidder could legitimately already be gone by the time this fired, which
-- read as a foreign-key violation on a delete that was otherwise perfectly
-- consistent. bidder_id itself never changes after insert, so gating on it
-- costs nothing on the paths that matter.
CREATE OR REPLACE FUNCTION public.procurement_tec_evaluation_set_case()
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

DROP TRIGGER IF EXISTS trg_procurement_tec_evaluations_case ON public.procurement_tec_evaluations;
CREATE TRIGGER trg_procurement_tec_evaluations_case
  BEFORE INSERT OR UPDATE ON public.procurement_tec_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.procurement_tec_evaluation_set_case();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_tec_checklist', 'procurement_tec_evaluations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ===== The chair's final call, on the bidder itself =====

-- Not a fifth table. One qualification call per bidder is what the recommend
-- guard reads, and it lives where the rest of a bidder's status already does.
ALTER TABLE public.procurement_bidders
  ADD COLUMN IF NOT EXISTS tec_qualified   BOOLEAN,
  ADD COLUMN IF NOT EXISTS tec_note        TEXT,
  ADD COLUMN IF NOT EXISTS tec_decided_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS tec_decided_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.procurement_bidders.tec_qualified IS
  'The chair''s own, final qualification call -- distinct from any member''s '
  'individual verdict in procurement_tec_evaluations. Only '
  'procurement_set_bidder_qualification writes this; the existing bidder RLS '
  'write policy does not match once the case has left the tender stage, so a '
  'direct client UPDATE here is already refused by the time the case reaches '
  'tec, and the function does not attempt to route around that.';

-- ===== Seeding the checklist =====

CREATE OR REPLACE FUNCTION public.procurement_tec_seed_checklist(_case_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.procurement_tec_checklist (case_id, item_key)
  SELECT _case_id, key FROM unnest(ARRAY[
    'specs_match_requisition', 'mandatory_documents',
    'delivery_feasible', 'eligibility_verified'
  ]) AS key
  ON CONFLICT (case_id, item_key) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.procurement_tec_seed_on_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'tec' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    PERFORM public.procurement_tec_seed_checklist(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_tec_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_tec_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW EXECUTE FUNCTION public.procurement_tec_seed_on_entry();

-- Backfill: a case already sitting at tec did not fire the trigger above, and
-- should not have to bounce out and back in to get a checklist.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'tec' LOOP
    PERFORM public.procurement_tec_seed_checklist(c.id);
  END LOOP;
END $$;

-- ===== Functions =====

CREATE OR REPLACE FUNCTION public.procurement_tec_assert_open(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _case public.procurement_cases;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage <> 'tec' OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the technical evaluation desk'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- A member's own reading of one bidder. Upserted rather than inserted-once: a
-- member who reconsiders resubmits, and each resubmission signs again -- the
-- record is what was signed last, not a running history of drafts.
CREATE OR REPLACE FUNCTION public.procurement_submit_tec_evaluation(
  _bidder_id UUID, _score NUMERIC, _compliance_status TEXT,
  _qualified BOOLEAN, _remarks TEXT, _signature JSONB
)
RETURNS public.procurement_tec_evaluations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id UUID;
  _sig_id  UUID;
  _row     public.procurement_tec_evaluations;
  _vendor  TEXT;
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

  IF _signature IS NULL OR COALESCE(btrim(_signature ->> 'image'), '') = '' THEN
    RAISE EXCEPTION 'A technical evaluation has to be signed' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.procurement_case_signatures
    (case_id, action_code, stage, signer_id, image, kind)
  VALUES (
    _case_id, 'tec.evaluate', 'tec', auth.uid(),
    _signature ->> 'image',
    COALESCE(NULLIF(btrim(_signature ->> 'kind'), ''), 'drawn')
  )
  RETURNING id INTO _sig_id;

  INSERT INTO public.procurement_tec_evaluations
    (case_id, bidder_id, member_id, score, compliance_status, qualified, remarks,
     signature_id, submitted_at)
  VALUES
    (_case_id, _bidder_id, auth.uid(), _score, _compliance_status, _qualified, _remarks,
     _sig_id, now())
  ON CONFLICT (bidder_id, member_id) DO UPDATE SET
    score = EXCLUDED.score, compliance_status = EXCLUDED.compliance_status,
    qualified = EXCLUDED.qualified, remarks = EXCLUDED.remarks,
    signature_id = EXCLUDED.signature_id, submitted_at = EXCLUDED.submitted_at
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'tec', 'tec.evaluation_submitted',
    'Technical evaluation recorded for ' || COALESCE(_vendor, 'a bidder'),
    jsonb_build_object('bidder_id', _bidder_id, 'score', _score,
                       'compliance_status', _compliance_status, 'qualified', _qualified));

  RETURN _row;
END;
$$;

-- The chair's final call. Independent of how many members have submitted --
-- the reference this stage is modelled on lets the chair act at any time, and
-- a rule requiring every member first would strand a case on a member who
-- never logs in.
CREATE OR REPLACE FUNCTION public.procurement_set_bidder_qualification(
  _bidder_id UUID, _qualified BOOLEAN, _note TEXT DEFAULT NULL
)
RETURNS public.procurement_bidders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case_id UUID;
  _vendor  TEXT;
  _row     public.procurement_bidders;
BEGIN
  SELECT b.case_id, v.name INTO _case_id, _vendor
    FROM public.procurement_bidders b JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.id = _bidder_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No such bidder' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_tec_assert_open(_case_id);

  IF NOT (public.has_procurement_permission(auth.uid(), 'tec.chair')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold tec.chair' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.procurement_bidders
     SET tec_qualified  = _qualified,
         tec_note       = _note,
         tec_decided_by = auth.uid(),
         tec_decided_at = now()
   WHERE id = _bidder_id
   RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'tec', CASE WHEN _qualified THEN 'tec.qualified' ELSE 'tec.disqualified' END,
    (CASE WHEN _qualified THEN 'Qualified: ' ELSE 'Not qualified: ' END) || COALESCE(_vendor, 'a bidder'),
    jsonb_build_object('bidder_id', _bidder_id, 'note', _note));

  RETURN _row;
END;
$$;

-- What a chair sees when weighing members against each other. Computed on
-- read, the same reasoning as procurement_tender_summary: a stored rollup
-- would drift the moment a member resubmitted.
CREATE OR REPLACE FUNCTION public.procurement_tec_case_consensus(_case_id UUID)
RETURNS TABLE (
  bidder_id      UUID,
  member_count   BIGINT,
  avg_score      NUMERIC,
  qualified_count BIGINT,
  qualified_pct  NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT e.bidder_id,
         COUNT(*),
         ROUND(AVG(e.score), 2),
         COUNT(*) FILTER (WHERE e.qualified),
         ROUND(100.0 * COUNT(*) FILTER (WHERE e.qualified) / COUNT(*), 1)
    FROM public.procurement_tec_evaluations e
   WHERE e.case_id = _case_id
   GROUP BY e.bidder_id;
END;
$$;

-- ===== The gate in front of commercial evaluation =====

-- Mirrors the reference this stage is modelled on: the only hard precondition
-- on recommending is that somebody has actually been found qualified. It does
-- not require every member to have submitted, and it does not require the
-- checklist to be clean -- those are judgement calls for the chair, not gates
-- for the engine.
--
-- Mirrored client-side in src/features/procurement/lib/tecChecks.ts. Change
-- one and change the other.
CREATE OR REPLACE FUNCTION public.procurement_guard_tec_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.procurement_bidders b
     WHERE b.case_id = _case_id AND b.status = 'received' AND b.tec_qualified = true
  )
$$;

CREATE OR REPLACE FUNCTION public.procurement_tec_gaps(_case_id UUID)
RETURNS TEXT[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT EXISTS (
           SELECT 1 FROM public.procurement_bidders b
            WHERE b.case_id = _case_id AND b.status = 'received' AND b.tec_qualified = true
         ) THEN 'At least one bidder marked qualified by the chair' END
  ], NULL)
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_tec_ready',
       gaps_function   = 'public.procurement_tec_gaps'
 WHERE code = 'tec.recommend';

GRANT EXECUTE ON FUNCTION public.procurement_submit_tec_evaluation(UUID, NUMERIC, TEXT, BOOLEAN, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_set_bidder_qualification(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_tec_case_consensus(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_tec_ready(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_tec_gaps(UUID) TO authenticated;

-- ===== Row level security =====

-- Checklist: a plain field under RLS, the same shape as the tender's own
-- editable columns -- there is no transition here, so there is no function.
CREATE POLICY "Users can read the tec checklist on cases in their remit"
  ON public.procurement_tec_checklist FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

CREATE POLICY "The committee can keep the tec checklist while the case is there"
  ON public.procurement_tec_checklist FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     WHERE c.id = case_id AND c.case_status = 'open' AND c.stage = 'tec'::procurement_stage
       AND (public.has_procurement_permission(auth.uid(), 'tec.evaluate')
            OR public.has_procurement_permission(auth.uid(), 'tec.chair')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     WHERE c.id = case_id AND c.case_status = 'open' AND c.stage = 'tec'::procurement_stage
       AND (public.has_procurement_permission(auth.uid(), 'tec.evaluate')
            OR public.has_procurement_permission(auth.uid(), 'tec.chair')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))
  ));

-- Evaluations: read-only from the client. Every write is signed, so every
-- write goes through procurement_submit_tec_evaluation, which is
-- SECURITY DEFINER and bypasses RLS entirely -- there is deliberately no
-- FOR ALL policy here to accidentally shadow it or fall out of sync with it.
CREATE POLICY "Users can read tec evaluations on cases in their remit"
  ON public.procurement_tec_evaluations FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));
