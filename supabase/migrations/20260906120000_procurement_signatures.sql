-- ===== Signatures: captured and enforced, not just flagged =====
--
-- Fourteen actions have carried `requires_signature = true` since the
-- foundation slice, and until now the flag was decoration: the engine read it,
-- recorded nothing, and let the decision through. A purchase file whose
-- clearances and approvals are unsigned is the one thing a procurement trail
-- cannot afford to be casual about, so this slice makes the flag mean what it
-- says.
--
-- Two tables, deliberately separate:
--
--   procurement_signatures       one per person — the signature they reuse.
--   procurement_case_signatures  one per signed decision — the record.
--
-- Keeping them apart is the point. A saved signature is a convenience the
-- signer controls and may replace at any time; a case signature is evidence,
-- written once, never updated, and holding its own copy of the image so that
-- changing the saved one cannot retrospectively alter what was signed.

-- ===== The signature a person reuses =====
CREATE TABLE IF NOT EXISTS public.procurement_signatures (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A data URI. Small: the pad renders roughly 10-30 KB of PNG.
  image       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'drawn' CHECK (kind IN ('drawn', 'typed', 'uploaded')),
  -- Whether the signing dialog should offer it without being asked. Off means
  -- "keep it, but make me choose each time".
  use_by_default BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.procurement_signatures ENABLE ROW LEVEL SECURITY;

-- Nobody reads anybody else's saved signature, administrator included. It is a
-- reusable credential, not case evidence — the evidence is the table below.
DROP POLICY IF EXISTS "A signature is only ever the signer's own" ON public.procurement_signatures;
CREATE POLICY "A signature is only ever the signer's own" ON public.procurement_signatures
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_procurement_signatures_updated_at ON public.procurement_signatures;
CREATE TRIGGER trg_procurement_signatures_updated_at
  BEFORE UPDATE ON public.procurement_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== What was signed, by whom, on which decision =====
CREATE TABLE IF NOT EXISTS public.procurement_case_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  -- The action and the stage it was taken at, so the signature can be tied back
  -- to its entry in the trail without depending on event ids.
  action_code TEXT NOT NULL,
  stage       procurement_stage NOT NULL,
  signer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Its own copy. Replacing the saved signature must not rewrite history.
  image       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'drawn',
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_case_signatures_case
  ON public.procurement_case_signatures (case_id, signed_at DESC);

ALTER TABLE public.procurement_case_signatures ENABLE ROW LEVEL SECURITY;

-- Readable by everyone who can read the case: a signature nobody downstream can
-- see proves nothing to the people who need it.
DROP POLICY IF EXISTS "Signatures are readable with the case" ON public.procurement_case_signatures;
CREATE POLICY "Signatures are readable with the case" ON public.procurement_case_signatures
  FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No INSERT, UPDATE or DELETE policy on purpose. The only writer is
-- procurement_record_decision, which is SECURITY DEFINER and therefore bypasses
-- RLS: a client cannot forge a signature row, and cannot erase one either.

-- ===== The engine now demands one =====
--
-- Replaces procurement_record_decision with the same body plus a signature
-- step, placed after the guard and before anything moves — the case must not
-- advance and then fail to be signed.
--
-- The signature travels in _payload as {"signature": {"image": "...",
-- "kind": "drawn"}}, which is why the parameter existed. It is stripped out of
-- the audit event's details afterwards: the trail records that a decision was
-- signed and points at the signature row, rather than embedding 30 KB of base64
-- in every event.
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

  -- Stage-specific preconditions arrive with the later slices; each one is a
  -- boolean function taking (case_id, payload).
  _guard := _act.guard_function;
  IF _guard IS NOT NULL AND to_regprocedure(_guard || '(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1, $2)', _guard) INTO _ok USING _case_id, _payload;
    IF NOT COALESCE(_ok, false) THEN
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
    jsonb_build_object(
      'remarks', _remarks,
      -- The image is deliberately not carried into the trail; the signature id
      -- is the pointer to it.
      'payload', _payload - 'signature',
      'signature_id', _sig_id
    )
  );

  RETURN _case;
END;
$function$;

-- Existing cases were decided before signing was enforced. Nothing is
-- backfilled and nothing is invalidated: those decisions stand as they were
-- taken, and the absence of a signature row is itself the honest record.
