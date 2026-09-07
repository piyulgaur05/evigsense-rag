-- A holding action's entry status never reached the case.
--
-- PROCUREMENT.md 4.1 has said since the foundation that "an action with no
-- target stage holds the case where it is and changes its status label", and
-- listed the labels: `Awaiting a reply from the requester`, `Awaiting a bidder
-- clarification`, `Payment on hold`. None of them ever appeared.
--
-- In all three revisions of procurement_record_decision -- the foundation's,
-- the one the signature slice replaced it with, and the one the tender handoff
-- replaced that with -- `_act.entry_status` is passed to exactly one place:
--
--     ELSIF _act.target_stage IS NOT NULL THEN
--       _case := public.procurement_advance_stage(..., _act.entry_status, ...);
--
-- and procurement_advance_stage is the only reader of it. An action with no
-- target stage falls off the end of that IF with nothing done, so the four
-- holding actions in the workflow -- finance.query, tec.query,
-- commercial.query, payment.hold -- log an event, open a clarification thread,
-- and leave procurement_cases.status_label reading whatever it read before.
-- Asking finance a question left the case saying `Awaiting finance clearance`,
-- which is the one thing it was no longer doing.
--
-- The fix is one branch. It is a real behaviour change for those four actions
-- and not a tidy-up, which is why it is its own migration rather than a line
-- buried in the commercial slice: after this, a held case says why it is held.
--
-- The commercial slice needs it because the head of division's sign-offs are
-- holding actions whose entire purpose is to record a status -- `Commercial
-- bids may be opened`, `Comparative statement signed off`. Without this branch
-- they would record an audit event and change nothing a reader can see.

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

  -- A holding action: the case stays where it is and says why. No stage history
  -- row, because nothing moved -- the audit event below is the whole record of
  -- it. RETURNING refreshes _case, which was read before the update and would
  -- otherwise hand the caller back the old label.
  ELSIF _act.entry_status IS NOT NULL THEN
    UPDATE public.procurement_cases
       SET status_label = _act.entry_status, updated_at = now()
     WHERE id = _case_id
    RETURNING * INTO _case;
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
