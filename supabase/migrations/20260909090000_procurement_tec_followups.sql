-- Two corrections surfaced by actually using the technical evaluation desk.
--
-- 1. Chair-only actions (tec.recommend, tec.query, tec.return, tec.refuse)
--    check tec.chair AND is_procurement_committee_chair() -- and nothing in
--    this product yet constitutes a committee outside a manual SQL step
--    (§10.4 of PROCUREMENT.md always said so). The result was a chair who
--    had qualified a bidder still seeing an empty action bar: the permission
--    was held, the committee simply did not exist, and procurement_may_
--    take_action refused silently rather than explaining why. TEC is the
--    one committee stage this product now drives entirely through its own
--    UI, so it is the one that can no longer depend on an admin-only setup
--    step nobody is offered a way to perform. The fix seeds a one-cycle TEC
--    committee the moment a case arrives at tec, the same way the checklist
--    already seeds itself -- membership comes from whoever holds
--    tec_chairman / tec_member org-wide, since case-specific committee
--    rostering is not built yet either. DPC and PNC are unchanged: still
--    manual, still documented as such.
--
-- 2. A member's own technical reading was signed, on the theory that any
--    recorded evaluation should carry a mark the way a stage decision does.
--    In practice that mark was ceremony repeated once per bidder per member
--    with nothing riding on it -- the reading does not move the case, only
--    the chair's later, separate qualification call does that, and *that*
--    stage-transition action already carries its own required signature
--    (tec.recommend, requires_signature = true since the foundation). Only
--    one signature was ever doing real work; the fix removes the other one.

-- ===== 1. Auto-constitute the TEC committee on arrival =====

CREATE OR REPLACE FUNCTION public.procurement_tec_constitute_committee(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _committee_id UUID;
BEGIN
  INSERT INTO public.procurement_committees (case_id, kind, cycle, name)
  VALUES (_case_id, 'tec', 1, 'Technical Evaluation Committee')
  ON CONFLICT (case_id, kind, cycle) DO NOTHING;

  SELECT id INTO _committee_id
    FROM public.procurement_committees
   WHERE case_id = _case_id AND kind = 'tec' AND cycle = 1;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, true
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'tec_chairman'
  ON CONFLICT (committee_id, user_id) DO NOTHING;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, false
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'tec_member'
  ON CONFLICT (committee_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_tec_seed_on_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'tec' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    PERFORM public.procurement_tec_seed_checklist(NEW.id);
    PERFORM public.procurement_tec_constitute_committee(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: a case already sitting at tec (this desk existed before this
-- migration) did not fire the trigger above and should not have to bounce
-- out and back in just to get a committee.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'tec' LOOP
    PERFORM public.procurement_tec_constitute_committee(c.id);
  END LOOP;
END $$;

-- ===== 2. A member's reading no longer needs a signature =====

CREATE OR REPLACE FUNCTION public.procurement_submit_tec_evaluation(
  _bidder_id UUID, _score NUMERIC, _compliance_status TEXT,
  _qualified BOOLEAN, _remarks TEXT, _signature JSONB DEFAULT NULL
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

  -- Optional, unlike a stage decision: this reading does not move the case
  -- on its own, so nothing here requires a mark. A caller that sends one
  -- anyway still gets it recorded, in case a future policy wants it back.
  IF _signature IS NOT NULL AND COALESCE(btrim(_signature ->> 'image'), '') <> '' THEN
    INSERT INTO public.procurement_case_signatures
      (case_id, action_code, stage, signer_id, image, kind)
    VALUES (
      _case_id, 'tec.evaluate', 'tec', auth.uid(),
      _signature ->> 'image',
      COALESCE(NULLIF(btrim(_signature ->> 'kind'), ''), 'drawn')
    )
    RETURNING id INTO _sig_id;
  END IF;

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
