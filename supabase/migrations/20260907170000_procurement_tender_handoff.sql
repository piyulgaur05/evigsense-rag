-- Procurement, slice 4c: handing off closes bidding, and a refusal says why.
--
-- Two faults, both found by pressing the button.
--
-- **The hand-off demanded a step it should have taken.** `tender.to_tec` has
-- described itself as "Closes bidding and constitutes the technical evaluation
-- committee" since the foundation migration, and the tender slice then gave it
-- a guard requiring bidding to be *already* closed. So the officer pressed the
-- button the description told them to press, signed, and was refused for not
-- having pressed a different button first. The description was right and the
-- guard was wrong: leaving the tender desk is what closes bidding, and doing it
-- in one act is also the honest record — the roster shut at the moment the case
-- went to the committee, not at some earlier moment nobody chose.
--
-- The explicit "Close bidding" control stays, because shutting the roster
-- early is a real thing to want: it stops further bids while the officer
-- verifies earnest money and chases a missing amount. It is now a convenience
-- rather than a toll gate.
--
-- **A refused decision did not say what was missing.** The engine raised "This
-- case is not ready for X" and stopped there, while the function that lists the
-- gaps sat right beside the guard, unused by anything but the portal. On a
-- screen where the checklist is visible that is merely unhelpful; from the
-- action bar, after signing, it reads as the button doing nothing at all.
--
-- Naming the gaps function on the action row rather than deriving it from the
-- guard's name: the workflow is data in this schema, and a convention like
-- "strip _guard_, append _gaps" is the kind of cleverness that silently stops
-- working the first time somebody names a function differently.

ALTER TABLE public.procurement_stage_actions
  ADD COLUMN IF NOT EXISTS gaps_function TEXT;

COMMENT ON COLUMN public.procurement_stage_actions.gaps_function IS
  'Optional companion to guard_function: TEXT[] of what is still missing, so a '
  'refusal can say why instead of only that.';

UPDATE public.procurement_stage_actions
   SET gaps_function = 'public.procurement_requisition_gaps'
 WHERE code = 'mpr.submit';

UPDATE public.procurement_stage_actions
   SET gaps_function = 'public.procurement_tender_gaps'
 WHERE code IN ('tender.to_tec', 'tender.to_commercial');

-- ===== Leaving the tender desk closes bidding =====

-- An AFTER trigger on the case rather than a step inside the two actions:
-- procurement_advance_stage is the only thing that writes cases.stage, so this
-- catches every way out of the desk -- including a later slice's action nobody
-- has written yet, and the administrator moving a case by hand.
CREATE OR REPLACE FUNCTION public.procurement_tender_close_on_exit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tender public.procurement_tenders;
  _bids   BIGINT;
BEGIN
  SELECT * INTO _tender FROM public.procurement_tenders WHERE case_id = NEW.id;
  IF NOT FOUND OR _tender.status NOT IN ('floated', 'bidding_open') THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO _bids FROM public.procurement_bidders
   WHERE tender_id = _tender.id AND status = 'received';

  UPDATE public.procurement_tenders
     SET status            = 'bidding_closed',
         bidding_closed_at = now(),
         bidding_closed_by = auth.uid()
   WHERE id = _tender.id;

  -- Logged like any other close, so the trail shows when the roster shut even
  -- though nobody pressed a button that said so.
  PERFORM public.procurement_log_event(
    NEW.id, 'tender', 'tender.bidding_closed',
    CASE WHEN _bids = 1 THEN 'Bidding closed with 1 bid on hand-off'
         ELSE 'Bidding closed with ' || _bids || ' bids on hand-off' END,
    jsonb_build_object('bidders', _bids, 'automatic', true, 'to_stage', NEW.stage));

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_tender_exit ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_tender_exit
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (OLD.stage = 'tender'::procurement_stage AND NEW.stage <> 'tender'::procurement_stage)
  EXECUTE FUNCTION public.procurement_tender_close_on_exit();

-- ===== The gate, without the step it now performs =====

-- Floating is still required: a tender nobody was ever shown has no bids worth
-- the committee's time, and "closed" would be meaningless on it. What has gone
-- is the demand that bidding be closed *before* this is pressed.
CREATE OR REPLACE FUNCTION public.procurement_guard_tender_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_tenders t
    WHERE t.case_id = _case_id
      AND t.status NOT IN ('draft', 'ready')
      AND btrim(COALESCE(t.reference_no, '')) <> ''
      AND t.bid_end_at IS NOT NULL
      AND (t.mode NOT IN ('gem', 'eprocurement')
           OR btrim(COALESCE(t.portal_reference, '')) <> '')
      AND (t.mode NOT IN ('limited', 'single')
           OR EXISTS (SELECT 1 FROM public.procurement_tender_invitees i
                       WHERE i.tender_id = t.id))
      AND (t.mode <> 'single'
           OR btrim(COALESCE(t.single_justification, '')) <> '')
      AND EXISTS (SELECT 1 FROM public.procurement_bidders b
                   WHERE b.tender_id = t.id AND b.status = 'received')
      AND NOT EXISTS (SELECT 1 FROM public.procurement_bidders b
                       WHERE b.tender_id = t.id AND b.status = 'received'
                         AND b.bid_amount IS NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.procurement_tender_gaps(_case_id UUID)
RETURNS TEXT[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN t.id IS NULL THEN 'A tender record' END,
    CASE WHEN t.id IS NOT NULL AND btrim(COALESCE(t.reference_no, '')) = ''
         THEN 'A tender reference number' END,
    CASE WHEN t.mode IN ('gem', 'eprocurement')
          AND btrim(COALESCE(t.portal_reference, '')) = ''
         THEN 'The number the portal gave this tender' END,
    CASE WHEN t.mode IN ('limited', 'single')
          AND NOT EXISTS (SELECT 1 FROM public.procurement_tender_invitees i
                           WHERE i.tender_id = t.id)
         THEN 'At least one invited vendor' END,
    CASE WHEN t.mode = 'single' AND btrim(COALESCE(t.single_justification, '')) = ''
         THEN 'A written justification for going to a single source' END,
    CASE WHEN t.id IS NOT NULL AND t.bid_end_at IS NULL
         THEN 'A bid submission deadline' END,
    CASE WHEN t.id IS NOT NULL AND t.status IN ('draft', 'ready')
         THEN 'The tender to be floated' END,
    CASE WHEN t.id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.procurement_bidders b
                           WHERE b.tender_id = t.id AND b.status = 'received')
         THEN 'At least one recorded bid' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.procurement_bidders b
                       WHERE b.tender_id = t.id AND b.status = 'received'
                         AND b.bid_amount IS NULL)
         THEN 'An amount against every recorded bid' END
  ], NULL)
  FROM public.procurement_cases c
  LEFT JOIN public.procurement_tenders t ON t.case_id = c.id
  WHERE c.id = _case_id
$$;

-- ===== A refusal that says what is missing =====

CREATE OR REPLACE FUNCTION public.procurement_record_decision(
  _case_id uuid,
  _action_code text,
  _remarks text DEFAULT NULL::text,
  _payload jsonb DEFAULT '{}'::jsonb
)
 RETURNS procurement_cases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _case   public.procurement_cases;
  _act    public.procurement_stage_actions;
  _from   procurement_stage;
  _guard  TEXT;
  _ok     BOOLEAN;
  _gaps   TEXT[];
  _sig    JSONB;
  _sig_id UUID;
BEGIN
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement case % not found', _case_id USING ERRCODE = 'no_data_found';
  END IF;

  _from := _case.stage;

  SELECT * INTO _act FROM public.procurement_stage_actions
   WHERE code = _action_code AND stage = _from;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% is not available while the case is at %', _action_code, _from
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.has_procurement_permission(auth.uid(), _act.permission) THEN
    RAISE EXCEPTION 'You do not hold %', _act.permission USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _act.requires_remarks AND COALESCE(btrim(_remarks), '') = '' THEN
    RAISE EXCEPTION 'Remarks are required for "%"', _act.label USING ERRCODE = 'check_violation';
  END IF;

  -- Committee stages let only the chairperson move the case on.
  IF _act.chair_only THEN
    IF NOT (
      public.has_procurement_role(auth.uid(), 'proc_admin')
      OR public.is_procurement_committee_chair(
           auth.uid(), _case_id,
           CASE _from WHEN 'tec' THEN 'tec'::procurement_committee_kind
                      WHEN 'dpc' THEN 'dpc'::procurement_committee_kind
                      ELSE 'pnc'::procurement_committee_kind END)
    ) THEN
      RAISE EXCEPTION 'Only the chairperson can take this decision'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Stage-specific preconditions: a boolean function taking (case_id, payload).
  --
  -- When the action also names a gaps function, the refusal quotes it. Being
  -- told only "this case is not ready" from an action bar -- after signing,
  -- with the checklist scrolled off screen -- is indistinguishable from the
  -- button doing nothing, which is exactly how it was reported.
  _guard := _act.guard_function;
  IF _guard IS NOT NULL AND to_regprocedure(_guard || '(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1, $2)', _guard) INTO _ok USING _case_id, _payload;
    IF NOT COALESCE(_ok, false) THEN
      IF _act.gaps_function IS NOT NULL
         AND to_regprocedure(_act.gaps_function || '(uuid)') IS NOT NULL THEN
        EXECUTE format('SELECT %s($1)', _act.gaps_function) INTO _gaps USING _case_id;
      END IF;

      IF _gaps IS NOT NULL AND array_length(_gaps, 1) > 0 THEN
        RAISE EXCEPTION '"%" still needs: %', _act.label, array_to_string(_gaps, '; ')
          USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'This case is not ready for "%"', _act.label USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The signature, before the case moves. An action that demands one and does
  -- not get one is refused outright, the same way missing remarks are.
  IF _act.requires_signature THEN
    _sig := _payload -> 'signature';
    IF _sig IS NULL OR COALESCE(btrim(_sig ->> 'image'), '') = '' THEN
      RAISE EXCEPTION '"%" has to be signed', _act.label USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.procurement_case_signatures
      (case_id, action_code, stage, signer_id, image, kind)
    VALUES (
      _case_id, _act.code, _from, auth.uid(),
      _sig ->> 'image',
      COALESCE(NULLIF(btrim(_sig ->> 'kind'), ''), 'drawn')
    )
    RETURNING id INTO _sig_id;
  END IF;

  IF _act.action = 'reject' THEN
    _case := public.procurement_reject_case(_case_id, _remarks);
  ELSIF _act.target_stage IS NOT NULL THEN
    _case := public.procurement_advance_stage(_case_id, _act.target_stage, _act.entry_status, _remarks);
  END IF;

  IF _act.action IN ('send_back', 'request_clarification') THEN
    INSERT INTO public.procurement_clarifications (case_id, kind, from_stage, to_stage, body, author_id)
    VALUES (
      _case_id,
      CASE WHEN _act.action = 'send_back' THEN 'send_back'::procurement_clarification_kind
           ELSE 'question'::procurement_clarification_kind END,
      _from,
      _act.target_stage,
      COALESCE(_remarks, _act.label),
      auth.uid()
    );
  END IF;

  PERFORM public.procurement_log_event(
    _case_id, _from, _act.code, _act.label,
    jsonb_build_object('remarks', _remarks, 'payload', _payload - 'signature',
                       'signature_id', _sig_id));

  RETURN _case;
END;
$function$;

-- The description was right all along; it now also says what the officer does
-- not have to do first.
UPDATE public.procurement_stage_actions
   SET description = 'Closes bidding if it is still open, and puts the bids in front of the technical evaluation committee.'
 WHERE code = 'tender.to_tec';

UPDATE public.procurement_stage_actions
   SET description = 'Closes bidding if it is still open and skips technical evaluation, where the purchase does not warrant it.'
 WHERE code = 'tender.to_commercial';
