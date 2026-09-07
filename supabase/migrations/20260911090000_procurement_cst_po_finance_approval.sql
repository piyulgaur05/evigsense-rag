-- The comparative statement was missing a step the reference process this
-- workflow is modelled on actually requires: before the commercial team's own
-- recommendation can be recorded, the purchase officer and the finance
-- officer each have to approve the generated statement. Only after both have
-- signed off does "commercial acceptance" -- the recommendation itself --
-- become possible, and only after that does the head of division's sign-off
-- and the hand-off to the purchase committee follow.
--
-- What was here before let the commercial team record a recommendation the
-- moment the statement compiled, with nobody from tendering or finance ever
-- having looked at it. This migration inserts the missing gate without
-- moving anything that already worked:
--
--   cst.generate        the commercial team's own action: freezes the priced
--                        bids (procurement_commercial.quote_status -> 'locked')
--                        the moment the desk is satisfied the statement is
--                        ready to be reviewed. Guarded on the same rule
--                        commercial.to_cst already required -- at least one
--                        ranking-eligible bid -- since a compliance call can
--                        still have been reversed after the case arrived here.
--   cst.po_approve       the purchase officer's approval, on `tender.create`,
--                        the permission that role has held since the
--                        foundation with no button at this desk to spend it on.
--   cst.finance_approve  the finance officer's approval, on `finance.approve`.
--
-- Both are holding actions surfaced through the ordinary action bar and
-- worklist -- `procurement_may_take_action` only checks the permission named
-- on the row, not which desk the role's own home stage is, and both roles
-- already have forward visibility into a case this far along (finance's home
-- stage is sequence 2, the purchase officer's is 3; cst is sequence 6).
--
-- `procurement_commercial_record_recommendation` now refuses to record an
-- award, a rejection or a re-tender recommendation until the statement has
-- been generated and both approvals are on file for the live revision --
-- mirroring the reference's own rule that Approve L*, Reject All Bids and
-- Recommend Re-Tender all wait on both sign-offs, while a send-back or a
-- request for clarification does not, because neither of those finalises
-- anything.

-- ===== A third and fourth kind of approval =====

ALTER TABLE public.procurement_commercial_approvals
  DROP CONSTRAINT IF EXISTS procurement_commercial_approvals_kind_check;
ALTER TABLE public.procurement_commercial_approvals
  ADD CONSTRAINT procurement_commercial_approvals_kind_check
  CHECK (kind IN ('opening', 'statement', 'authority', 'purchase_officer', 'finance'));

-- ===== Generating the statement =====
--
-- Freezes the priced bids. After this, procurement_commercial_quotes and
-- procurement_quote_lines stop being writable -- their RLS policies already
-- match only while quote_status = 'draft' -- so re-pricing a bid means
-- reopening the statement, the same as after a full lock.
CREATE OR REPLACE FUNCTION public.procurement_cst_generate_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_ranking(_case_id) r WHERE r.eligible)
  THEN
    RETURN ARRAY['At least one priced, compliant bid to compare'];
  END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_guard_cst_generate_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_cst_generate_gaps(_case_id), 1), 0) = 0;
$$;

CREATE OR REPLACE FUNCTION public.procurement_cst_generate_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.procurement_commercial
     SET quote_status = 'locked', updated_at = now()
   WHERE case_id = NEW.case_id AND quote_status <> 'locked';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_cst_generate ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_cst_generate
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'cst.generate')
  EXECUTE FUNCTION public.procurement_cst_generate_from_event();

-- ===== The two new approvals, folded into the existing event trigger =====
--
-- Replaces the two-way opening/statement branch with one that covers all
-- five action codes this trigger now answers to. Extend this CASE, not a
-- second trigger, when a sixth is added -- one function owning the whole
-- mapping is what keeps kind and status from drifting apart.
CREATE OR REPLACE FUNCTION public.procurement_commercial_approval_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rev    INTEGER;
  _kind   TEXT;
  _status TEXT;
BEGIN
  SELECT m.revision INTO _rev
    FROM public.procurement_commercial m WHERE m.case_id = NEW.case_id;
  IF _rev IS NULL THEN
    RETURN NULL;
  END IF;

  _kind := CASE
             WHEN NEW.action LIKE 'commercial.opening%' THEN 'opening'
             WHEN NEW.action LIKE 'cst.signoff%' THEN 'statement'
             WHEN NEW.action = 'cst.po_approve' THEN 'purchase_officer'
             WHEN NEW.action = 'cst.finance_approve' THEN 'finance'
             ELSE NULL
           END;
  IF _kind IS NULL THEN
    RETURN NULL;
  END IF;

  _status := CASE
               WHEN NEW.action IN ('commercial.opening_approve', 'cst.signoff',
                                   'cst.po_approve', 'cst.finance_approve')
               THEN 'approved' ELSE 'returned'
             END;

  -- procurement_record_decision writes the signature row before it logs, so
  -- details -> signature_id is already populated for a signed action.
  INSERT INTO public.procurement_commercial_approvals
    (case_id, kind, revision, status, actor_id, remarks, signature_id)
  VALUES (
    NEW.case_id, _kind, _rev, _status, NEW.actor_id,
    NULLIF(btrim(COALESCE(NEW.details ->> 'remarks', '')), ''),
    NULLIF(NEW.details ->> 'signature_id', '')::uuid)
  ON CONFLICT (case_id, kind, revision) DO UPDATE SET
    status       = EXCLUDED.status,
    actor_id     = EXCLUDED.actor_id,
    remarks      = EXCLUDED.remarks,
    signature_id = EXCLUDED.signature_id,
    decided_at   = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_commercial_approval
  ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_commercial_approval
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action IN ('commercial.opening_approve', 'commercial.opening_return',
                       'cst.signoff', 'cst.signoff_return',
                       'cst.po_approve', 'cst.finance_approve'))
  EXECUTE FUNCTION public.procurement_commercial_approval_from_event();

-- ===== The stage actions =====

INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status,
   requires_remarks, requires_signature, chair_only, guard_function, gaps_function, sort_order) VALUES
  ('cst.generate', 'cst', 'approve', 'Generate the comparative statement',
   'Freezes the priced bids so the statement can be reviewed and approved.',
   'commercial.evaluate', NULL, 'Comparative statement generated',
   false, false, false,
   'public.procurement_guard_cst_generate_ready', 'public.procurement_cst_generate_gaps', 3),
  ('cst.po_approve', 'cst', 'approve', 'Approve the comparative statement',
   'Records the purchase officer''s approval of the generated statement.',
   'tender.create', NULL, 'Approved by the purchase officer',
   false, false, false, NULL, NULL, 4),
  ('cst.finance_approve', 'cst', 'approve', 'Approve the comparative statement',
   'Records the finance officer''s approval of the generated statement.',
   'finance.approve', NULL, 'Approved by the finance officer',
   false, false, false, NULL, NULL, 4)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  permission = EXCLUDED.permission, target_stage = EXCLUDED.target_stage,
  entry_status = EXCLUDED.entry_status, requires_remarks = EXCLUDED.requires_remarks,
  guard_function = EXCLUDED.guard_function, gaps_function = EXCLUDED.gaps_function,
  sort_order = EXCLUDED.sort_order;

-- ===== The recommendation waits on both approvals =====
--
-- Only a decision that finalises something -- an award, a rejection, or a
-- re-tender -- waits on this. A send-back or a request for clarification
-- commits nobody to anything and is refused nowhere near as hard everywhere
-- else in this schema, so the same principle applies here.
CREATE OR REPLACE FUNCTION public.procurement_commercial_record_recommendation(
  _case_id              UUID,
  _outcome              TEXT,
  _bidder_id            UUID DEFAULT NULL,
  _justification_reason TEXT DEFAULT NULL,
  _justification_text   TEXT DEFAULT NULL,
  _remarks              TEXT DEFAULT NULL
)
RETURNS public.procurement_commercial_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version      INTEGER;
  _l1_id        UUID;
  _l1_cost      NUMERIC;
  _estimate     NUMERIC;
  _bidder_ok    BOOLEAN;
  _bidder_cost  NUMERIC;
  _is_override  BOOLEAN;
  _over_est     BOOLEAN;
  _reasons      TEXT[] := ARRAY[]::TEXT[];
  _prev         public.procurement_commercial_recommendations;
  _row          public.procurement_commercial_recommendations;
  _prev_name    TEXT;
  _new_name     TEXT;
  _quote_status TEXT;
BEGIN
  _version := public.procurement_cst_assert_may_evaluate(_case_id);

  IF COALESCE(btrim(_remarks), '') = '' THEN
    RAISE EXCEPTION 'Remarks are required for a recommendation' USING ERRCODE = 'check_violation';
  END IF;

  IF _outcome IN ('award', 'reject_all', 'retender') THEN
    SELECT quote_status INTO _quote_status
      FROM public.procurement_commercial WHERE case_id = _case_id;
    IF _quote_status IS DISTINCT FROM 'locked' THEN
      RAISE EXCEPTION 'Generate the comparative statement before recording this recommendation'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.procurement_commercial_approvals a
       WHERE a.case_id = _case_id AND a.kind = 'purchase_officer'
         AND a.revision = _version AND a.status = 'approved')
    THEN
      RAISE EXCEPTION 'The purchase officer has to approve the statement before this recommendation can be recorded'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.procurement_commercial_approvals a
       WHERE a.case_id = _case_id AND a.kind = 'finance'
         AND a.revision = _version AND a.status = 'approved')
    THEN
      RAISE EXCEPTION 'The finance officer has to approve the statement before this recommendation can be recorded'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT r.bidder_id, r.evaluated_cost INTO _l1_id, _l1_cost
    FROM public.procurement_commercial_ranking(_case_id) r WHERE r.is_l1;

  SELECT est.estimate_inclusive INTO _estimate
    FROM public.procurement_commercial_reasonableness(_case_id) est;

  IF _outcome = 'award' THEN
    IF _bidder_id IS NULL THEN
      RAISE EXCEPTION 'A recommendation to award has to name a bidder'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT r.eligible, r.evaluated_cost INTO _bidder_ok, _bidder_cost
      FROM public.procurement_commercial_ranking(_case_id) r WHERE r.bidder_id = _bidder_id;

    IF NOT COALESCE(_bidder_ok, false) OR COALESCE(_bidder_cost, 0) <= 0 THEN
      RAISE EXCEPTION 'The recommended bidder is not eligible to be ranked'
        USING ERRCODE = 'check_violation';
    END IF;

    _is_override := _bidder_id IS DISTINCT FROM _l1_id;
    _over_est := _estimate IS NOT NULL AND _bidder_cost > _estimate;

    IF _is_override THEN
      IF _justification_reason IS NULL OR length(btrim(COALESCE(_justification_text, ''))) < 10 THEN
        RAISE EXCEPTION 'Recommending anyone other than L1 needs a reason and at least ten characters of justification'
          USING ERRCODE = 'check_violation';
      END IF;
      _reasons := array_append(_reasons, 'A departure from the computed L1');
    END IF;

    IF _over_est THEN
      _reasons := array_append(_reasons, 'An award above the approved estimate');
    END IF;
  ELSE
    _bidder_id := NULL;
    _is_override := false;
    _over_est := false;
  END IF;

  SELECT * INTO _prev FROM public.procurement_commercial_recommendations WHERE case_id = _case_id;

  SELECT v.name INTO _prev_name FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id WHERE b.id = _prev.recommended_bidder_id;
  SELECT v.name INTO _new_name FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id WHERE b.id = _bidder_id;

  INSERT INTO public.procurement_commercial_recommendations
    (case_id, version, outcome, recommended_bidder_id, computed_l1_bidder_id,
     justification_reason, justification_text, authority_required, authority_reasons,
     remarks, recommended_by, recommended_at)
  VALUES
    (_case_id, _version, _outcome, _bidder_id, _l1_id,
     CASE WHEN _is_override THEN _justification_reason END,
     CASE WHEN _is_override THEN _justification_text END,
     COALESCE(array_length(_reasons, 1), 0) > 0, _reasons,
     _remarks, auth.uid(), now())
  ON CONFLICT (case_id) DO UPDATE SET
     version               = _version,
     outcome               = EXCLUDED.outcome,
     recommended_bidder_id = EXCLUDED.recommended_bidder_id,
     computed_l1_bidder_id = EXCLUDED.computed_l1_bidder_id,
     justification_reason  = EXCLUDED.justification_reason,
     justification_text    = EXCLUDED.justification_text,
     authority_required    = EXCLUDED.authority_required,
     authority_reasons     = EXCLUDED.authority_reasons,
     remarks               = EXCLUDED.remarks,
     recommended_by        = EXCLUDED.recommended_by,
     recommended_at        = now(),
     updated_at            = now()
  RETURNING * INTO _row;

  INSERT INTO public.procurement_commercial_recommendation_history
    (case_id, version, changed_by, previous_outcome, new_outcome,
     previous_bidder_id, new_bidder_id, previous_vendor_name, new_vendor_name,
     previous_reason, new_reason, remarks)
  VALUES
    (_case_id, _version, auth.uid(), _prev.outcome, _outcome,
     _prev.recommended_bidder_id, _bidder_id, _prev_name, _new_name,
     _prev.justification_reason, _row.justification_reason, _remarks);

  IF _prev.recommended_bidder_id IS DISTINCT FROM _bidder_id THEN
    DELETE FROM public.procurement_commercial_approvals
     WHERE case_id = _case_id AND kind = 'authority' AND revision = _version;
  END IF;

  PERFORM public.procurement_log_event(
    _case_id, 'cst',
    CASE WHEN _prev.case_id IS NULL THEN 'commercial.recommended' ELSE 'commercial.recommendation_revised' END,
    CASE WHEN _outcome = 'award' THEN 'Recommended ' || COALESCE(_new_name, 'a bidder')
         ELSE initcap(replace(_outcome, '_', ' ')) END,
    jsonb_build_object('outcome', _outcome, 'bidder_id', _bidder_id,
                       'is_override', _is_override, 'over_estimate', _over_est));

  RETURN _row;
END;
$$;

-- ===== The gate, in the corrected order =====

-- Every applicable rule is checked and listed, unconditionally -- the same
-- convention procurement_tender_gaps and procurement_commercial_gaps already
-- follow. An earlier version of this function returned early the moment the
-- statement wasn't yet generated, or the moment either the purchase officer
-- or finance had not approved, on the reasoning that nothing past that point
-- could be true anyway. It reads better in isolation, but it means a client
-- deriving per-step "done" flags from substring membership in this array
-- cannot tell "not yet reached" from "already satisfied" for anything past
-- the first blocker -- exactly the class of client/server disagreement this
-- schema's own convention exists to prevent (see the requisition's and the
-- tender's own checklists). Listing everything outstanding, always, is what
-- keeps `!gaps.includes(x)` a correct "done" check for every x here.
CREATE OR REPLACE FUNCTION public.procurement_cst_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version      INTEGER;
  _quote_status TEXT;
  _rec          public.procurement_commercial_recommendations;
  _gaps         TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT version INTO _version FROM public.procurement_cst_versions
   WHERE case_id = _case_id AND status = 'draft';

  IF _version IS NULL THEN
    RETURN ARRAY['A compiled comparative statement'];
  END IF;

  SELECT quote_status INTO _quote_status
    FROM public.procurement_commercial WHERE case_id = _case_id;

  IF _quote_status IS DISTINCT FROM 'locked' THEN
    _gaps := array_append(_gaps, 'The comparative statement to be generated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals a
     WHERE a.case_id = _case_id AND a.kind = 'purchase_officer'
       AND a.revision = _version AND a.status = 'approved')
  THEN
    _gaps := array_append(_gaps, 'The purchase officer''s approval of the statement');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals a
     WHERE a.case_id = _case_id AND a.kind = 'finance'
       AND a.revision = _version AND a.status = 'approved')
  THEN
    _gaps := array_append(_gaps, 'The finance officer''s approval of the statement');
  END IF;

  SELECT * INTO _rec FROM public.procurement_commercial_recommendations WHERE case_id = _case_id;
  IF _rec.case_id IS NULL THEN
    _gaps := array_append(_gaps, 'A recommended outcome for the statement');
  ELSIF _rec.outcome = 'award' AND _rec.recommended_bidder_id IS DISTINCT FROM _rec.computed_l1_bidder_id
        AND (_rec.justification_reason IS NULL OR COALESCE(_rec.justification_text, '') = '') THEN
    _gaps := array_append(_gaps, 'A justification for recommending other than L1');
  END IF;

  IF _rec.authority_required AND NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals a
     WHERE a.case_id = _case_id AND a.kind = 'authority' AND a.revision = _version AND a.status = 'approved')
  THEN
    _gaps := array_append(_gaps, 'The competent authority''s clearance for departing from L1 or exceeding the estimate');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals a
     WHERE a.case_id = _case_id AND a.kind = 'statement' AND a.revision = _version AND a.status = 'approved')
  THEN
    _gaps := array_append(_gaps, 'The head of division''s sign-off on the statement');
  END IF;

  RETURN _gaps;
END;
$$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_cst_generate_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_cst_generate_ready(UUID, JSONB) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_cst_generate_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_cst_generate_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_cst_generate_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_cst_generate_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
