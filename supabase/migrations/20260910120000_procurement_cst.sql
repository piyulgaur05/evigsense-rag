-- The comparative statement: the priced bids, brought to one page, scrutinised,
-- signed off, and frozen.
--
-- Everything the commercial desk works out -- who is L1, on what basis, with
-- what loaded on top -- is live and re-derivable right up to the moment this
-- statement locks. After that it must stop being live: a purchase committee
-- three years from now has to be able to read exactly what was in front of the
-- committee that actually sat, not a recomputation against rates somebody has
-- since corrected. That is the whole reason this is a table of frozen versions
-- and not a view.
--
-- What this slice adds:
--   procurement_cst_versions       one row per version of the statement for a
--                                  case. A draft computes; a locked or
--                                  superseded version reads only its own
--                                  frozen snapshot.
--   procurement_cst_scrutiny       five fixed questions, for the record, not
--                                  for the gate -- the same shape as the TEC
--                                  committee's checklist.
--   procurement_commercial_recommendations / _history
--                                  the recommended bidder, why, and every
--                                  change to that recommendation with who made
--                                  it and when.
--
-- Reopening a locked statement does not edit it. It marks the version
-- superseded and opens the next one as a fresh draft, the same way a
-- corrigendum leaves the tender notice it amended untouched and issues a new
-- one. Both sign-offs disappear on reopen because they are keyed on the
-- version they were given against -- there is nothing to explicitly clear.

-- ===== The versioned freeze =====

CREATE TABLE IF NOT EXISTS public.procurement_cst_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL CHECK (version >= 1),

  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'locked', 'superseded')),

  -- Written exactly once, at lock. A draft version computes everything fresh
  -- from procurement_commercial_ranking and the schedule; a locked or
  -- superseded one reads only this.
  snapshot            JSONB,
  computed_l1_bidder_id UUID REFERENCES public.procurement_bidders(id) ON DELETE SET NULL,
  ranking_basis       TEXT,
  generated_on        DATE,

  compiled_by         UUID REFERENCES auth.users(id),
  compiled_at         TIMESTAMPTZ,
  signed_off_by       UUID REFERENCES auth.users(id),
  signed_off_at       TIMESTAMPTZ,
  signature_id        UUID REFERENCES public.procurement_case_signatures(id) ON DELETE SET NULL,
  locked_by           UUID REFERENCES auth.users(id),
  locked_at           TIMESTAMPTZ,

  superseded_at       TIMESTAMPTZ,
  reopen_reason       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (case_id, version),
  CONSTRAINT procurement_cst_versions_locked_is_frozen
    CHECK (status = 'draft' OR (snapshot IS NOT NULL AND locked_at IS NOT NULL))
);
ALTER TABLE public.procurement_cst_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_cst_versions_case
  ON public.procurement_cst_versions(case_id);

-- At most one version that is not superseded, per case. v1 stays v1 forever; a
-- reopen supersedes it and v2 is a new row -- so "the current version" is
-- always a single, unambiguous lookup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_cst_versions_live
  ON public.procurement_cst_versions(case_id) WHERE status <> 'superseded';

COMMENT ON TABLE public.procurement_cst_versions IS
  'The comparative statement, one row per version. No client write policy at all: every column here is either a lock stamp, a sign-off, or the frozen snapshot itself, and none of the three is a thing a client should be able to type.';

-- ===== The scrutiny checklist =====
--
-- Five fixed questions, shared by the whole desk, for the record rather than
-- the gate -- directly copying procurement_tec_checklist's shape and its
-- reasoning: neither this checklist nor a clean answer on every row is
-- required before the statement can be signed off. That is the reader's
-- judgement, not the engine's.
CREATE TABLE IF NOT EXISTS public.procurement_cst_scrutiny (
  case_id    UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  item_key   TEXT NOT NULL CHECK (item_key IN (
               'arithmetic_verified', 'taxes_and_loadings_consistent',
               'terms_brought_to_par', 'estimate_comparison_recorded',
               'deviations_documented')),
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'pass', 'fail', 'clarify')),
  remarks    TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, version, item_key)
);
ALTER TABLE public.procurement_cst_scrutiny ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_cst_scrutiny IS
  'Five fixed questions the desk answers before signing off a version of the statement. Writable while that version is the live draft; frozen into the version''s own snapshot at lock, same as the tender''s notice.';

-- ===== The recommendation =====

CREATE TABLE IF NOT EXISTS public.procurement_commercial_recommendations (
  case_id               UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  version               INTEGER NOT NULL DEFAULT 1,

  outcome               TEXT NOT NULL DEFAULT 'award'
                          CHECK (outcome IN
                            ('award', 'send_back', 'clarification', 'reject_all', 'retender')),
  recommended_bidder_id UUID REFERENCES public.procurement_bidders(id) ON DELETE RESTRICT,
  computed_l1_bidder_id UUID REFERENCES public.procurement_bidders(id) ON DELETE SET NULL,

  justification_reason  TEXT CHECK (justification_reason IS NULL OR justification_reason IN (
                           'delivery_lead_time', 'lifecycle_cost_benefit',
                           'oem_support_availability', 'risk_mitigation_split',
                           'technical_warranty_superiority',
                           'non_responsiveness_rejection', 'budget_excess', 'other')),
  justification_text    TEXT,

  authority_required    BOOLEAN NOT NULL DEFAULT false,
  authority_reasons     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  remarks               TEXT,
  recommended_by        UUID REFERENCES auth.users(id),
  recommended_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Recommending anyone other than the computed L1 has to say why, from a
  -- fixed category, and say more than a shrug: at least ten characters. This
  -- is schema, not only a check in the function that writes it, so the row
  -- itself is proof the rule was met.
  CONSTRAINT procurement_commercial_recommendations_award_names_a_vendor
    CHECK (outcome <> 'award' OR recommended_bidder_id IS NOT NULL),
  CONSTRAINT procurement_commercial_recommendations_override_justified
    CHECK (
      outcome <> 'award'
      OR recommended_bidder_id IS NOT DISTINCT FROM computed_l1_bidder_id
      OR (justification_reason IS NOT NULL AND length(btrim(COALESCE(justification_text, ''))) >= 10)
    )
);
ALTER TABLE public.procurement_commercial_recommendations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_commercial_recommendations IS
  'The one live recommendation on a case. No client write policy: recording it and writing its history row are one act, and a plain UPDATE would change the recommendation while losing the record of what it changed from.';

-- ===== Its history, append-only =====

CREATE TABLE IF NOT EXISTS public.procurement_commercial_recommendation_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  version               INTEGER NOT NULL,
  changed_by            UUID REFERENCES auth.users(id),
  changed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_outcome      TEXT,
  new_outcome           TEXT NOT NULL,
  -- No foreign key on the bidder columns: history must survive a bidder being
  -- removed from the roster, which the tender slice already allows.
  previous_bidder_id    UUID,
  new_bidder_id         UUID,
  previous_vendor_name  TEXT,
  new_vendor_name       TEXT,
  previous_reason       TEXT,
  new_reason            TEXT,
  remarks               TEXT
);
ALTER TABLE public.procurement_commercial_recommendation_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_commercial_recommendation_history_case
  ON public.procurement_commercial_recommendation_history(case_id);

COMMENT ON TABLE public.procurement_commercial_recommendation_history IS
  'Every change to the recommendation, in order. No client write policy: written solely by procurement_commercial_record_recommendation, in the same transaction as the recommendation itself.';

-- ===== updated_at =====

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_cst_versions', 'procurement_cst_scrutiny',
                           'procurement_commercial_recommendations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ===== Row-level security =====
--
-- procurement_cst_versions and procurement_commercial_recommendations get no
-- FOR ALL policy at all: every write to either is a function, for the same
-- reason procurement_case_signatures has none -- a lock stamp or a
-- recommendation a client could PATCH directly is not evidence of anything.

DROP POLICY IF EXISTS "Users can read cst versions on cases in their remit"
  ON public.procurement_cst_versions;
CREATE POLICY "Users can read cst versions on cases in their remit"
  ON public.procurement_cst_versions FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read cst scrutiny on cases in their remit"
  ON public.procurement_cst_scrutiny;
CREATE POLICY "Users can read cst scrutiny on cases in their remit"
  ON public.procurement_cst_scrutiny FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- Writable only while this row's own version is the live draft. Qualifying
-- procurement_cst_scrutiny.case_id and .version explicitly, rather than
-- leaving them bare, is not decoration: procurement_cst_versions has columns
-- of both names, and an unqualified reference inside this EXISTS would
-- resolve to the inner table and stop checking the row under test at all --
-- exactly the mistake this migration's sibling made on the quotes policy.
DROP POLICY IF EXISTS "The commercial team can scrutinise the live draft"
  ON public.procurement_cst_scrutiny;
CREATE POLICY "The commercial team can scrutinise the live draft"
  ON public.procurement_cst_scrutiny FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     JOIN public.procurement_cst_versions v
       ON v.case_id = c.id AND v.version = procurement_cst_scrutiny.version
     WHERE c.id = procurement_cst_scrutiny.case_id AND c.case_status = 'open'
       AND c.stage = 'cst'::procurement_stage AND v.status = 'draft'
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     JOIN public.procurement_cst_versions v
       ON v.case_id = c.id AND v.version = procurement_cst_scrutiny.version
     WHERE c.id = procurement_cst_scrutiny.case_id AND c.case_status = 'open'
       AND c.stage = 'cst'::procurement_stage AND v.status = 'draft'
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

DROP POLICY IF EXISTS "Users can read the commercial recommendation on cases in their remit"
  ON public.procurement_commercial_recommendations;
CREATE POLICY "Users can read the commercial recommendation on cases in their remit"
  ON public.procurement_commercial_recommendations FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read recommendation history on cases in their remit"
  ON public.procurement_commercial_recommendation_history;
CREATE POLICY "Users can read recommendation history on cases in their remit"
  ON public.procurement_commercial_recommendation_history FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- ===== The desk assertion =====

-- Visibility, stage and draft status only -- deliberately no permission
-- check here. cst.signoff and the recommendation are both taken at this
-- desk, but by two different permissions (commercial.evaluate for the
-- recommendation and the schedule, commercial.opening.approve for the two
-- sign-offs), and a shared assertion that hard-coded one of them would
-- silently lock the other role out of every function built on it -- which is
-- exactly what happened here once already: see the note on
-- procurement_approve_cst_authority below.
CREATE OR REPLACE FUNCTION public.procurement_cst_assert_draft(_case_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _v    public.procurement_cst_versions;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage <> 'cst'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the comparative statement desk'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _v FROM public.procurement_cst_versions
   WHERE case_id = _case_id AND status <> 'superseded';
  IF _v.id IS NULL OR _v.status <> 'draft' THEN
    RAISE EXCEPTION 'The comparative statement is locked; reopen it for correction first'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN _v.version;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_cst_assert_may_evaluate(_case_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version INTEGER;
BEGIN
  _version := public.procurement_cst_assert_draft(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold commercial.evaluate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _version;
END;
$$;

-- ===== Compiling the draft on arrival =====
--
-- Seeds the checklist and opens a draft version. Idempotent: a case already
-- sitting at cst does not need to bounce out and back to get one, and calling
-- this again on an existing draft changes nothing.
CREATE OR REPLACE FUNCTION public.procurement_cst_compile(_case_id UUID)
RETURNS public.procurement_cst_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next INTEGER;
  _v    public.procurement_cst_versions;
BEGIN
  SELECT * INTO _v FROM public.procurement_cst_versions
   WHERE case_id = _case_id AND status <> 'superseded';

  IF _v.id IS NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO _next
      FROM public.procurement_cst_versions WHERE case_id = _case_id;

    INSERT INTO public.procurement_cst_versions
      (case_id, version, compiled_by, compiled_at)
    VALUES (_case_id, _next, auth.uid(), now())
    RETURNING * INTO _v;

    INSERT INTO public.procurement_cst_scrutiny (case_id, version, item_key)
    SELECT _case_id, _v.version, key
      FROM unnest(ARRAY['arithmetic_verified', 'taxes_and_loadings_consistent',
                        'terms_brought_to_par', 'estimate_comparison_recorded',
                        'deviations_documented']) AS key
    ON CONFLICT DO NOTHING;

    PERFORM public.procurement_log_event(
      _case_id, 'cst', 'cst.compiled',
      'Comparative statement version ' || _v.version || ' compiled',
      jsonb_build_object('version', _v.version));
  END IF;

  RETURN _v;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_cst_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_cst_compile(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_cst_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_cst_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'cst'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_cst_seed_on_entry();

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'cst'::procurement_stage LOOP
    PERFORM public.procurement_cst_compile(c.id);
  END LOOP;
END $$;

-- ===== Reopening after a return, at any point of entry =====
--
-- A case can come back to commercial from cst.return or from dpc.return, and
-- an administrator can move a case by hand. All three have to have the same
-- effect: the last comparative statement stops being current. This is a
-- trigger on cases.stage rather than a step inside either return action for
-- the same reason procurement_tender_close_on_exit is one -- it is the single
-- chokepoint every route back through passes.
CREATE OR REPLACE FUNCTION public.procurement_commercial_reopen(_case_id UUID, _reason TEXT)
RETURNS public.procurement_commercial
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_commercial;
BEGIN
  UPDATE public.procurement_cst_versions
     SET status = 'superseded', superseded_at = now(),
         reopen_reason = COALESCE(NULLIF(btrim(_reason), ''), reopen_reason)
   WHERE case_id = _case_id AND status <> 'superseded';

  UPDATE public.procurement_commercial
     SET quote_status = 'draft', revision = revision + 1, updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  IF _row.case_id IS NOT NULL THEN
    PERFORM public.procurement_log_event(
      _case_id, 'commercial', 'commercial.reopened',
      'Reopened for correction' || CASE WHEN COALESCE(btrim(_reason), '') <> ''
        THEN ': ' || _reason ELSE '' END,
      jsonb_build_object('revision', _row.revision));
  END IF;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_commercial_reopen_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_commercial_reopen(
    NEW.id, 'Reopened from ' || OLD.stage::text);
  RETURN NULL;
END;
$$;

-- Fires only when the case re-enters commercial from a stage that could only
-- be reached with a statement already locked. tender.to_commercial and
-- tec.recommend also land here but with nothing yet to reopen -- the UPDATE
-- above then matches zero rows and procurement_commercial_seed_on_entry (the
-- other trigger on this same column) does the actual seeding.
DROP TRIGGER IF EXISTS trg_procurement_cases_commercial_reopen ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_commercial_reopen
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'commercial'::procurement_stage
        AND OLD.stage IN ('cst'::procurement_stage, 'dpc'::procurement_stage))
  EXECUTE FUNCTION public.procurement_commercial_reopen_on_entry();

-- ===== A third kind of approval: the competent authority's clearance =====
--
-- Recording a recommendation other than the computed L1, or one that costs
-- more than the estimate, is a decision this product does not model a
-- separate "competent authority" role for -- there is no such desk in
-- procurement_role_stages, and inventing one is a role-assignment change, not
-- a schema change this slice should make on its own. The sign-off is
-- therefore held by the same commercial.opening.approve permission as the
-- desk's other two, and kept as its own kind rather than folded into the
-- routine statement sign-off, because signing off on a departure from L1 is a
-- distinct assertion that should not be a side effect of a press about
-- something else.
ALTER TABLE public.procurement_commercial_approvals
  DROP CONSTRAINT IF EXISTS procurement_commercial_approvals_kind_check;
ALTER TABLE public.procurement_commercial_approvals
  ADD CONSTRAINT procurement_commercial_approvals_kind_check
  CHECK (kind IN ('opening', 'statement', 'authority'));

-- ===== Recording the recommendation =====
--
-- The L1 and the estimate are recomputed fresh here rather than trusted from
-- the caller, because "was this an override" and "is this over the estimate"
-- are exactly the two facts an untrusted client would have the strongest
-- reason to misstate.
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
BEGIN
  _version := public.procurement_cst_assert_may_evaluate(_case_id);

  IF COALESCE(btrim(_remarks), '') = '' THEN
    RAISE EXCEPTION 'Remarks are required for a recommendation' USING ERRCODE = 'check_violation';
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

  -- A new recommendation, or one that changes the vendor, discards any
  -- authority sign-off already on file for this version -- it was given
  -- against a different decision.
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

-- ===== The competent authority's clearance =====

CREATE OR REPLACE FUNCTION public.procurement_approve_cst_authority(_case_id UUID, _remarks TEXT DEFAULT NULL)
RETURNS public.procurement_commercial_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version INTEGER;
  _row     public.procurement_commercial_approvals;
BEGIN
  _version := public.procurement_cst_assert_draft(_case_id);

  IF NOT (public.has_procurement_permission(auth.uid(), 'commercial.opening.approve')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold commercial.opening.approve'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.procurement_commercial_approvals
    (case_id, kind, revision, status, actor_id, remarks)
  VALUES (_case_id, 'authority', _version, 'approved', auth.uid(), _remarks)
  ON CONFLICT (case_id, kind, revision) DO UPDATE SET
    status = 'approved', actor_id = auth.uid(), remarks = EXCLUDED.remarks, decided_at = now()
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'cst', 'cst.authority_approved',
    'Competent authority cleared the recommendation', jsonb_build_object('version', _version));

  RETURN _row;
END;
$$;

-- ===== The scrutiny checklist =====

CREATE OR REPLACE FUNCTION public.procurement_save_cst_scrutiny(
  _case_id UUID, _item_key TEXT, _status TEXT, _remarks TEXT DEFAULT NULL
)
RETURNS public.procurement_cst_scrutiny
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version INTEGER;
  _row     public.procurement_cst_scrutiny;
BEGIN
  _version := public.procurement_cst_assert_may_evaluate(_case_id);

  UPDATE public.procurement_cst_scrutiny
     SET status = _status, remarks = _remarks, updated_by = auth.uid(), updated_at = now()
   WHERE case_id = _case_id AND version = _version AND item_key = _item_key
  RETURNING * INTO _row;

  IF _row.case_id IS NULL THEN
    RAISE EXCEPTION 'No such scrutiny item' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN _row;
END;
$$;

-- ===== The frozen snapshot =====
--
-- Called at lock and never again. A future reader tempted to re-render this
-- from live state -- "just re-run the ranking, it will give the same answer"
-- -- would be deleting the one thing that makes a locked statement trustworthy:
-- the rates a corrigendum or a correction later changes must not follow a
-- reader back into a version that has already gone to a committee.
--
-- Every id carries the name resolved at freeze time, because a vendor's name
-- is not immutable -- procurement_vendors.name can be edited by anyone
-- holding vendor.manage -- and a snapshot holding only an id would silently
-- re-render under a name nobody on the committee actually saw.
CREATE OR REPLACE FUNCTION public.procurement_cst_build_snapshot(_case_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case      public.procurement_cases;
  _bill      JSONB;
  _bidders   JSONB;
  _matrix    JSONB;
  _issues    JSONB;
  _reason    RECORD;
  _rec       public.procurement_commercial_recommendations;
  _rec_json  JSONB;
  _scrutiny  JSONB;
  _opening   JSONB;
  _statement JSONB;
  _authority JSONB;
BEGIN
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;

  SELECT jsonb_agg(jsonb_build_object(
           'line_no', i.line_no, 'item_name', i.item_name, 'specification', i.specification,
           'quantity', i.quantity, 'unit', i.unit, 'hsn_code', i.hsn_code,
           'estimated_rate', i.estimated_rate, 'line_amount', i.line_amount)
         ORDER BY i.line_no)
    INTO _bill
    FROM public.procurement_tender_items i
    JOIN public.procurement_tenders t ON t.id = i.tender_id
   WHERE t.case_id = _case_id;

  SELECT jsonb_agg(jsonb_build_object(
           'bidder_id', r.bidder_id, 'vendor_id', r.vendor_id, 'vendor_name', r.vendor_name,
           'base_price', r.base_price, 'gst_pct', r.gst_pct, 'gst_amount', r.gst_amount,
           'freight', r.freight, 'other_charges', r.other_charges, 'discount', r.discount,
           'loading_amount', r.loading_amount, 'loading_note', r.loading_note,
           'taxable_value', r.taxable_value, 'evaluated_cost', r.evaluated_cost,
           'delivery_days', r.delivery_days, 'warranty_months', r.warranty_months,
           'payment_terms', r.payment_terms, 'commercial_compliance', r.commercial_compliance,
           'tec_qualified', r.tec_qualified, 'fully_priced', r.fully_priced,
           'price_source', r.price_source,
           'price_score', r.price_score, 'delivery_score', r.delivery_score,
           'warranty_score', r.warranty_score, 'weighted_score', r.weighted_score,
           'eligible', r.eligible, 'ineligible_reason', r.ineligible_reason,
           'rank', r.rank, 'is_l1', r.is_l1)
         ORDER BY (r.rank = 0), r.rank, r.vendor_name)
    INTO _bidders
    FROM public.procurement_commercial_ranking(_case_id) r;

  SELECT jsonb_agg(jsonb_build_object(
           'line_no', m.line_no, 'tender_item_id', m.tender_item_id,
           'item_name', m.item_name, 'unit', m.unit,
           'quantity', m.quantity, 'estimated_rate', m.estimated_rate,
           'bidder_id', m.bidder_id, 'vendor_name', m.vendor_name,
           'unit_rate', m.unit_rate, 'line_amount', m.line_amount, 'is_line_l1', m.is_line_l1)
         ORDER BY m.line_no, m.vendor_name)
    INTO _matrix
    FROM public.procurement_commercial_line_comparison(_case_id) m;

  SELECT jsonb_agg(jsonb_build_object(
           'bidder_id', q.bidder_id, 'vendor_name', v.name,
           'code', e ->> 'code', 'detail', e ->> 'detail'))
    INTO _issues
    FROM public.procurement_commercial_quotes q
    JOIN public.procurement_bidders b ON b.id = q.bidder_id
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
    CROSS JOIN LATERAL jsonb_array_elements(q.schedule_issues) e
   WHERE q.case_id = _case_id;

  SELECT * INTO _rec FROM public.procurement_commercial_recommendations WHERE case_id = _case_id;
  IF _rec.case_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'outcome', _rec.outcome,
             'recommended_bidder_id', _rec.recommended_bidder_id,
             'recommended_vendor_name', v1.name,
             'computed_l1_bidder_id', _rec.computed_l1_bidder_id,
             'computed_l1_vendor_name', v2.name,
             'justification_reason', _rec.justification_reason,
             'justification_text', _rec.justification_text,
             'authority_required', _rec.authority_required,
             'authority_reasons', to_jsonb(_rec.authority_reasons),
             'remarks', _rec.remarks,
             'recommended_by', jsonb_build_object('id', _rec.recommended_by, 'name', p.display_name),
             'recommended_at', _rec.recommended_at)
      INTO _rec_json
      FROM (SELECT 1) x
      LEFT JOIN public.procurement_bidders bb1 ON bb1.id = _rec.recommended_bidder_id
      LEFT JOIN public.procurement_vendors v1 ON v1.id = bb1.vendor_id
      LEFT JOIN public.procurement_bidders bb2 ON bb2.id = _rec.computed_l1_bidder_id
      LEFT JOIN public.procurement_vendors v2 ON v2.id = bb2.vendor_id
      LEFT JOIN public.profiles p ON p.id = _rec.recommended_by;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'item_key', s.item_key, 'status', s.status, 'remarks', s.remarks,
           'updated_by', s.updated_by, 'updated_at', s.updated_at))
    INTO _scrutiny
    FROM public.procurement_cst_scrutiny s
   WHERE s.case_id = _case_id
     AND s.version = (SELECT COALESCE(MAX(version), 1) FROM public.procurement_cst_versions
                        WHERE case_id = _case_id AND status <> 'superseded');

  SELECT jsonb_build_object('status', a.status, 'by', jsonb_build_object('id', a.actor_id, 'name', p.display_name),
                            'at', a.decided_at, 'remarks', a.remarks)
    INTO _opening
    FROM public.procurement_commercial_approvals a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
   WHERE a.case_id = _case_id AND a.kind = 'opening'
   ORDER BY a.decided_at DESC LIMIT 1;

  SELECT jsonb_build_object('status', a.status, 'by', jsonb_build_object('id', a.actor_id, 'name', p.display_name),
                            'at', a.decided_at, 'remarks', a.remarks)
    INTO _statement
    FROM public.procurement_commercial_approvals a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
   WHERE a.case_id = _case_id AND a.kind = 'statement'
   ORDER BY a.decided_at DESC LIMIT 1;

  SELECT jsonb_build_object('status', a.status, 'by', jsonb_build_object('id', a.actor_id, 'name', p.display_name),
                            'at', a.decided_at, 'remarks', a.remarks)
    INTO _authority
    FROM public.procurement_commercial_approvals a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
   WHERE a.case_id = _case_id AND a.kind = 'authority'
   ORDER BY a.decided_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'case_no', _case.case_no, 'case_title', _case.title,
    'currency', 'INR',
    'ranking_basis', (SELECT ranking_basis FROM public.procurement_commercial WHERE case_id = _case_id),
    'generated_on', CURRENT_DATE,
    'bill', COALESCE(_bill, '[]'::jsonb),
    'bidders', COALESCE(_bidders, '[]'::jsonb),
    'matrix', COALESCE(_matrix, '[]'::jsonb),
    'issues', COALESCE(_issues, '[]'::jsonb),
    'reasonableness', (SELECT to_jsonb(r) FROM public.procurement_commercial_reasonableness(_case_id) r),
    'recommendation', _rec_json,
    'scrutiny', COALESCE(_scrutiny, '[]'::jsonb),
    'approvals', jsonb_build_object('opening', _opening, 'statement', _statement, 'authority', _authority)
  );
END;
$$;

-- ===== The gate =====

CREATE OR REPLACE FUNCTION public.procurement_cst_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version INTEGER;
  _rec     public.procurement_commercial_recommendations;
  _gaps    TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT version INTO _version FROM public.procurement_cst_versions
   WHERE case_id = _case_id AND status = 'draft';

  IF _version IS NULL THEN
    RETURN ARRAY['A compiled comparative statement'];
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

CREATE OR REPLACE FUNCTION public.procurement_guard_cst_ready(_case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_cst_gaps(_case_id), 1), 0) = 0;
$$;

-- ===== Locking =====
--
-- Called from an AFTER UPDATE OF stage trigger once cst.to_dpc has already
-- moved the case to dpc -- so by the time this runs, the case itself no
-- longer reads as being "at" the comparative statement desk. It cannot
-- therefore go through procurement_cst_assert_draft, which requires exactly
-- that stage: doing so raised "This case is not at the comparative statement
-- desk" on every successful hand-off, since the case had, correctly, just
-- left it. What has to hold instead is narrower and does not depend on where
-- the case currently sits: visibility, and a live draft version to freeze.
--
-- The gate inside procurement_record_decision already refused the stage
-- action itself without a recommendation and a sign-off, while the case was
-- still at cst -- so by the time this runs there is something worth freezing.
CREATE OR REPLACE FUNCTION public.procurement_cst_lock(_case_id UUID)
RETURNS public.procurement_cst_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _version  INTEGER;
  _snapshot JSONB;
  _l1       UUID;
  _selected UUID;
  _row      public.procurement_cst_versions;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT version INTO _version FROM public.procurement_cst_versions
   WHERE case_id = _case_id AND status = 'draft';
  IF _version IS NULL THEN
    RAISE EXCEPTION 'There is no draft comparative statement to lock'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.procurement_guard_cst_ready(_case_id) THEN
    RAISE EXCEPTION 'The comparative statement is not ready to lock'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking(_case_id) r WHERE r.is_l1;
  SELECT recommended_bidder_id INTO _selected
    FROM public.procurement_commercial_recommendations WHERE case_id = _case_id;

  _snapshot := public.procurement_cst_build_snapshot(_case_id);

  UPDATE public.procurement_cst_versions
     SET status = 'locked', snapshot = _snapshot,
         computed_l1_bidder_id = _l1,
         ranking_basis = (SELECT ranking_basis FROM public.procurement_commercial WHERE case_id = _case_id),
         generated_on = CURRENT_DATE,
         locked_by = auth.uid(), locked_at = now(), updated_at = now()
   WHERE case_id = _case_id AND version = _version
  RETURNING * INTO _row;

  UPDATE public.procurement_commercial
     SET quote_status = 'locked', updated_at = now()
   WHERE case_id = _case_id;

  PERFORM public.procurement_log_event(
    _case_id, 'cst', 'cst.locked',
    'Comparative statement version ' || _version || ' locked; L1 is '
      || COALESCE((SELECT v.name FROM public.procurement_bidders b
                     JOIN public.procurement_vendors v ON v.id = b.vendor_id
                    WHERE b.id = COALESCE(_selected, _l1)), 'undetermined'),
    jsonb_build_object('version', _version, 'l1_bidder_id', _l1, 'selected_bidder_id', _selected));

  RETURN _row;
END;
$$;

-- Runs after the case has already moved -- procurement_advance_stage is the
-- only writer of cases.stage, and a STABLE guard function must not write. The
-- guard above still runs first inside procurement_record_decision and refuses
-- with a readable gaps list before this trigger is ever reached, so a lock
-- failure here would mean the guard and the lock have drifted apart, not that
-- the officer is missing something.
CREATE OR REPLACE FUNCTION public.procurement_cst_lock_on_exit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_cst_lock(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_cst_lock ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_cst_lock
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (OLD.stage = 'cst'::procurement_stage AND NEW.stage = 'dpc'::procurement_stage)
  EXECUTE FUNCTION public.procurement_cst_lock_on_exit();

-- ===== Turning the head of division's cst decision into an approval =====

DROP TRIGGER IF EXISTS trg_procurement_case_events_commercial_approval
  ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_commercial_approval
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action IN ('commercial.opening_approve', 'commercial.opening_return',
                       'cst.signoff', 'cst.signoff_return'))
  EXECUTE FUNCTION public.procurement_commercial_approval_from_event();

-- ===== Stage actions =====

INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status,
   requires_remarks, requires_signature, chair_only, sort_order) VALUES
  ('cst.signoff', 'cst', 'approve', 'Sign off the comparative statement',
   'Certifies the statement and its recommendation before the case is placed before the purchase committee.',
   'commercial.opening.approve', NULL, 'Comparative statement signed off',
   true, true, false, 5),
  ('cst.signoff_return', 'cst', 'request_clarification', 'Return the statement for correction',
   'Holds the case and reopens the statement for the commercial team to correct.',
   'commercial.opening.approve', NULL, 'Returned for correction',
   true, false, false, 25)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  permission = EXCLUDED.permission, target_stage = EXCLUDED.target_stage,
  entry_status = EXCLUDED.entry_status, requires_remarks = EXCLUDED.requires_remarks,
  sort_order = EXCLUDED.sort_order;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_cst_ready',
       gaps_function  = 'public.procurement_cst_gaps',
       requires_remarks = true,
       requires_signature = true
 WHERE code = 'cst.to_dpc';

-- A cst.signoff_return holds the case at cst but the statement it was
-- signing off has to stop being current -- otherwise a corrected commercial
-- record would sit under a "signed off" statement nobody re-read.
CREATE OR REPLACE FUNCTION public.procurement_cst_reopen_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_commercial_reopen(
    NEW.case_id, COALESCE(NULLIF(btrim(NEW.details ->> 'remarks'), ''), NEW.summary));
  PERFORM public.procurement_cst_compile(NEW.case_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_cst_return ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_cst_return
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'cst.signoff_return')
  EXECUTE FUNCTION public.procurement_cst_reopen_from_event();

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_cst_assert_draft(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cst_assert_may_evaluate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cst_compile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_reopen(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_cst_scrutiny(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_record_recommendation(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_approve_cst_authority(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cst_build_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cst_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_cst_ready(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cst_lock(UUID) TO authenticated;

-- ===== The arity assertion =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_cst_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_cst_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_cst_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_cst_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
