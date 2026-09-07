-- Price negotiation had three buttons and nothing behind them: pnc.agreed,
-- pnc.return and pnc.failed moved the case, but nothing recorded what was
-- actually negotiated, so "agreement reached" meant nothing more than a
-- chair's signature on an empty stage. Studying how the reference process
-- this workflow is modelled on runs its own negotiation committee gave three
-- domain facts worth keeping:
--
--   * negotiation targets one vendor, not a re-run of the whole bid -- the
--     firm the purchase committee's own resolution already pointed at (its
--     recommended bidder, or the computed L1 if the resolution named nobody
--     in particular) -- and the committee needs a stated mandate (why it is
--     negotiating, at least one objective) before it can put anything to
--     that vendor.
--   * a negotiation runs in rounds: one open round at a time, each carrying
--     the vendor's current offer, a rejected asking price is not the same as
--     the terms actually being negotiated. A committee's own counter can
--     never exceed the vendor's current offer -- a "counter" that asks for
--     more than the vendor themselves is asking is not a negotiation -- and
--     settling a round above the vendor's own offer (accepting an increase,
--     say for added scope) is still possible but has to say why.
--   * reaching agreement does not rewrite the locked comparative statement.
--     It writes a separate negotiated result -- price and whatever terms
--     moved alongside it -- that a purchase proposal would read next to the
--     original L1 figure, not in place of it. The statement stays what the
--     committee evaluated; the negotiated price is what was actually agreed.
--
-- None of the reference's own field names, screens or copy are reused here --
-- only the three facts above, expressed in this schema's own shape.
--
-- What this migration adds:
--   procurement_negotiations        one row per case, seeded on arrival at
--                                    pnc: which vendor, the opening offer to
--                                    negotiate against, the committee's own
--                                    mandate, and -- once concluded -- the
--                                    agreed price and terms.
--   procurement_negotiation_rounds  one row per round: the vendor's offer,
--                                    the committee's counter, and, once
--                                    closed, the settled figure for that
--                                    round. Plain records, not signed --
--                                    pnc.agreed itself carries the signature,
--                                    the same division this schema already
--                                    draws between a committee's own working
--                                    notes and the transition that acts on
--                                    them.
--
-- Both tables carry no client write policy at all: every write goes through
-- an RPC below, the same reasoning as procurement_quote_lines and
-- procurement_cst_scrutiny -- the single-open-round rule and the
-- counter-offer ceiling have to hold on every write, not just the ones a
-- particular form remembered to check.

-- ===== The negotiation header =====

CREATE TABLE IF NOT EXISTS public.procurement_negotiations (
  case_id               UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  bidder_id             UUID REFERENCES public.procurement_bidders(id) ON DELETE SET NULL,

  -- Snapshotted at arrival so the rounds have something fixed to negotiate
  -- against even if the comparative statement is later reopened and its own
  -- numbers move.
  opening_offer         NUMERIC(18,2),

  mandate_reason        TEXT NOT NULL DEFAULT '',
  mandate_instructions  TEXT,
  objectives            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'agreed', 'failed', 'returned')),

  final_price           NUMERIC(18,2),
  final_delivery_days   INTEGER,
  final_payment_terms   TEXT,
  final_warranty_months INTEGER,
  concluded_by          UUID REFERENCES auth.users(id),
  concluded_at          TIMESTAMPTZ,

  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_negotiations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_negotiations IS
  'One row per case, seeded on arrival at pnc against the purchase committee''s recommended vendor (or the computed L1). Readable by anyone who can see the case; writable only through the RPCs below.';

-- ===== One round of negotiation =====

CREATE TABLE IF NOT EXISTS public.procurement_negotiation_rounds (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 UUID NOT NULL REFERENCES public.procurement_negotiations(case_id) ON DELETE CASCADE,
  round_no                INTEGER NOT NULL CHECK (round_no >= 1),
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

  vendor_offer            NUMERIC(18,2) NOT NULL CHECK (vendor_offer >= 0),
  committee_counter_offer NUMERIC(18,2) CHECK (committee_counter_offer IS NULL OR committee_counter_offer >= 0),
  final_offer             NUMERIC(18,2) CHECK (final_offer IS NULL OR final_offer >= 0),

  delivery_days           INTEGER,
  payment_terms           TEXT,
  warranty_months         INTEGER,
  notes                   TEXT,

  -- Required only for the one case that needs justifying: settling above
  -- what the vendor themselves offered this round.
  override_reason         TEXT,

  round_date              DATE NOT NULL DEFAULT current_date,
  conducted_by            UUID,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at               TIMESTAMPTZ,

  UNIQUE (case_id, round_no),
  CONSTRAINT procurement_negotiation_rounds_counter_within CHECK (
    committee_counter_offer IS NULL OR committee_counter_offer <= vendor_offer),
  CONSTRAINT procurement_negotiation_rounds_final_needs_override CHECK (
    final_offer IS NULL OR final_offer <= vendor_offer OR COALESCE(btrim(override_reason), '') <> '')
);
ALTER TABLE public.procurement_negotiation_rounds ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_negotiation_rounds_case
  ON public.procurement_negotiation_rounds(case_id);

-- Only one round open at a time -- the fact that made "close a round before
-- starting another" a database rule instead of a UI convention.
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_negotiation_rounds_one_open
  ON public.procurement_negotiation_rounds(case_id) WHERE status = 'open';

COMMENT ON TABLE public.procurement_negotiation_rounds IS
  'One round of negotiation with the case''s one vendor. Plain committee record, not a signed decision -- pnc.agreed, pnc.return and pnc.failed are the transitions that carry the signature. Writable only through the RPCs below.';

-- ===== Read access =====

DROP POLICY IF EXISTS "Users can read negotiations on cases in their remit"
  ON public.procurement_negotiations;
CREATE POLICY "Users can read negotiations on cases in their remit"
  ON public.procurement_negotiations FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read negotiation rounds on cases in their remit"
  ON public.procurement_negotiation_rounds;
CREATE POLICY "Users can read negotiation rounds on cases in their remit"
  ON public.procurement_negotiation_rounds FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy on either table -- see the header comment.

-- ===== The desk assertions every write shares =====

CREATE OR REPLACE FUNCTION public.procurement_pnc_assert_open(_case_id UUID)
RETURNS public.procurement_negotiations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _neg  public.procurement_negotiations;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage IS DISTINCT FROM 'pnc'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at price negotiation'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = _case_id;
  IF _neg.case_id IS NULL THEN
    RAISE EXCEPTION 'No negotiation record exists for this case'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _neg.status <> 'open' THEN
    RAISE EXCEPTION 'This negotiation has already been concluded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN _neg;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_pnc_assert_may_negotiate(_case_id UUID)
RETURNS public.procurement_negotiations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neg public.procurement_negotiations;
BEGIN
  _neg := public.procurement_pnc_assert_open(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'pnc.negotiate')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold pnc.negotiate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _neg;
END;
$$;

-- ===== The committee's mandate =====

CREATE OR REPLACE FUNCTION public.procurement_save_negotiation_mandate(
  _case_id      UUID,
  _reason       TEXT,
  _instructions TEXT DEFAULT NULL,
  _objectives   TEXT[] DEFAULT NULL
)
RETURNS public.procurement_negotiations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_negotiations;
BEGIN
  PERFORM public.procurement_pnc_assert_may_negotiate(_case_id);

  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is needed for the negotiation mandate'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_negotiations
     SET mandate_reason = _reason,
         mandate_instructions = _instructions,
         objectives = COALESCE(_objectives, ARRAY[]::TEXT[]),
         updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'pnc', 'pnc.mandate_saved', 'Recorded the negotiation mandate',
    jsonb_build_object('objectives', to_jsonb(_row.objectives)));

  RETURN _row;
END;
$$;

-- ===== Rounds =====

CREATE OR REPLACE FUNCTION public.procurement_open_negotiation_round(
  _case_id                 UUID,
  _vendor_offer            NUMERIC,
  _committee_counter_offer NUMERIC DEFAULT NULL,
  _delivery_days           INTEGER DEFAULT NULL,
  _payment_terms           TEXT DEFAULT NULL,
  _warranty_months         INTEGER DEFAULT NULL,
  _notes                   TEXT DEFAULT NULL
)
RETURNS public.procurement_negotiation_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neg      public.procurement_negotiations;
  _round_no INTEGER;
  _row      public.procurement_negotiation_rounds;
BEGIN
  _neg := public.procurement_pnc_assert_may_negotiate(_case_id);

  IF COALESCE(btrim(_neg.mandate_reason), '') = ''
     OR COALESCE(array_length(_neg.objectives, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Record the negotiation mandate before opening a round'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_negotiation_rounds
     WHERE case_id = _case_id AND status = 'open')
  THEN
    RAISE EXCEPTION 'A round is already open; close it before starting another'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _vendor_offer IS NULL OR _vendor_offer < 0 THEN
    RAISE EXCEPTION 'A vendor offer is needed to open a round'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(MAX(round_no), 0) + 1 INTO _round_no
    FROM public.procurement_negotiation_rounds WHERE case_id = _case_id;

  INSERT INTO public.procurement_negotiation_rounds
    (case_id, round_no, vendor_offer, committee_counter_offer,
     delivery_days, payment_terms, warranty_months, notes, conducted_by, created_by)
  VALUES
    (_case_id, _round_no, _vendor_offer, _committee_counter_offer,
     _delivery_days, _payment_terms, _warranty_months, _notes, auth.uid(), auth.uid())
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'pnc', 'pnc.round_opened', 'Opened negotiation round ' || _round_no,
    jsonb_build_object('round_no', _round_no, 'vendor_offer', _vendor_offer));

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_update_negotiation_round(
  _round_id                UUID,
  _vendor_offer            NUMERIC,
  _committee_counter_offer NUMERIC DEFAULT NULL,
  _delivery_days           INTEGER DEFAULT NULL,
  _payment_terms           TEXT DEFAULT NULL,
  _warranty_months         INTEGER DEFAULT NULL,
  _notes                   TEXT DEFAULT NULL
)
RETURNS public.procurement_negotiation_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case_id UUID;
  _row     public.procurement_negotiation_rounds;
BEGIN
  SELECT case_id INTO _case_id FROM public.procurement_negotiation_rounds
   WHERE id = _round_id AND status = 'open';
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No open round to update' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_pnc_assert_may_negotiate(_case_id);

  IF _vendor_offer IS NULL OR _vendor_offer < 0 THEN
    RAISE EXCEPTION 'A vendor offer is needed'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_negotiation_rounds
     SET vendor_offer = _vendor_offer,
         committee_counter_offer = _committee_counter_offer,
         delivery_days = _delivery_days,
         payment_terms = _payment_terms,
         warranty_months = _warranty_months,
         notes = _notes,
         updated_at = now()
   WHERE id = _round_id AND status = 'open'
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_close_negotiation_round(
  _round_id        UUID,
  _final_offer     NUMERIC,
  _override_reason TEXT DEFAULT NULL,
  _delivery_days   INTEGER DEFAULT NULL,
  _payment_terms   TEXT DEFAULT NULL,
  _warranty_months INTEGER DEFAULT NULL,
  _notes           TEXT DEFAULT NULL
)
RETURNS public.procurement_negotiation_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _round public.procurement_negotiation_rounds;
  _row   public.procurement_negotiation_rounds;
BEGIN
  SELECT * INTO _round FROM public.procurement_negotiation_rounds WHERE id = _round_id;
  IF _round.id IS NULL THEN
    RAISE EXCEPTION 'No such round' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_pnc_assert_may_negotiate(_round.case_id);

  IF _round.status <> 'open' THEN
    RAISE EXCEPTION 'This round is already closed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_offer IS NULL OR _final_offer < 0 THEN
    RAISE EXCEPTION 'A final figure is needed to close a round'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_offer > _round.vendor_offer AND COALESCE(btrim(_override_reason), '') = '' THEN
    RAISE EXCEPTION 'Settling above the vendor''s own offer needs a stated reason'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_negotiation_rounds
     SET status = 'closed',
         final_offer = _final_offer,
         override_reason = _override_reason,
         delivery_days = COALESCE(_delivery_days, delivery_days),
         payment_terms = COALESCE(_payment_terms, payment_terms),
         warranty_months = COALESCE(_warranty_months, warranty_months),
         notes = COALESCE(_notes, notes),
         closed_at = now(),
         updated_at = now()
   WHERE id = _round_id
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _round.case_id, 'pnc', 'pnc.round_closed', 'Closed negotiation round ' || _round.round_no,
    jsonb_build_object('round_no', _round.round_no, 'final_offer', _final_offer));

  RETURN _row;
END;
$$;

-- ===== The gate on "agreement reached" =====

CREATE OR REPLACE FUNCTION public.procurement_pnc_agreement_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _neg  public.procurement_negotiations;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = _case_id;
  IF _neg.case_id IS NULL THEN
    RETURN ARRAY['A negotiation record on this case'];
  END IF;

  IF COALESCE(btrim(_neg.mandate_reason), '') = '' THEN
    _gaps := array_append(_gaps, 'The negotiation mandate (why the committee is negotiating)');
  END IF;

  IF COALESCE(array_length(_neg.objectives, 1), 0) = 0 THEN
    _gaps := array_append(_gaps, 'At least one negotiation objective');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_negotiation_rounds
     WHERE case_id = _case_id AND status = 'open')
  THEN
    _gaps := array_append(_gaps, 'The open round to be closed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_negotiation_rounds
     WHERE case_id = _case_id AND status = 'closed' AND final_offer IS NOT NULL)
  THEN
    _gaps := array_append(_gaps, 'A round recording the terms both sides agreed to');
  END IF;

  RETURN _gaps;
END;
$$;

-- (uuid, jsonb). The engine resolves a guard with to_regprocedure and skips it
-- in silence if the arity does not match, so the assertion at the foot of this
-- file exists to make a typo here loud instead of permissive.
CREATE OR REPLACE FUNCTION public.procurement_guard_pnc_agreed(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_pnc_agreement_gaps(_case_id), 1), 0) = 0;
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_pnc_agreed',
       gaps_function = 'public.procurement_pnc_agreement_gaps'
 WHERE code = 'pnc.agreed';

-- ===== Concluding: what pnc.agreed / pnc.return / pnc.failed each write =====

CREATE OR REPLACE FUNCTION public.procurement_pnc_conclude_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _round public.procurement_negotiation_rounds;
BEGIN
  IF NEW.action = 'pnc.agreed' THEN
    SELECT * INTO _round FROM public.procurement_negotiation_rounds
     WHERE case_id = NEW.case_id AND status = 'closed' AND final_offer IS NOT NULL
     ORDER BY round_no DESC LIMIT 1;

    UPDATE public.procurement_negotiations
       SET status = 'agreed',
           final_price = _round.final_offer,
           final_delivery_days = _round.delivery_days,
           final_payment_terms = _round.payment_terms,
           final_warranty_months = _round.warranty_months,
           concluded_by = NEW.actor_id,
           concluded_at = now(),
           updated_at = now()
     WHERE case_id = NEW.case_id;

  ELSIF NEW.action = 'pnc.failed' THEN
    UPDATE public.procurement_negotiations
       SET status = 'failed', concluded_by = NEW.actor_id, concluded_at = now(), updated_at = now()
     WHERE case_id = NEW.case_id;

  ELSIF NEW.action = 'pnc.return' THEN
    UPDATE public.procurement_negotiations
       SET status = 'returned', updated_at = now()
     WHERE case_id = NEW.case_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_pnc_conclude ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_pnc_conclude
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action IN ('pnc.agreed', 'pnc.failed', 'pnc.return'))
  EXECUTE FUNCTION public.procurement_pnc_conclude_from_event();

-- ===== Seeding the desk on arrival =====
--
-- Targets whoever the purchase committee actually recommended -- if its
-- resolution named an award, that bidder; otherwise the computed L1, which is
-- what a resolution that skipped straight to "refer for negotiation" without
-- naming anyone is implicitly pointing at. A case returning to pnc a second
-- time (dpc.return from here, then dpc.to_pnc again) keeps its rounds and its
-- mandate rather than starting over: only a negotiation that never opened, or
-- one that was returned rather than concluded, gets flipped back to 'open'.
CREATE OR REPLACE FUNCTION public.procurement_pnc_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bidder  UUID;
  _opening NUMERIC;
BEGIN
  SELECT recommended_bidder_id INTO _bidder
    FROM public.procurement_commercial_recommendations
   WHERE case_id = _case_id AND outcome = 'award';

  IF _bidder IS NULL THEN
    SELECT bidder_id INTO _bidder
      FROM public.procurement_commercial_ranking(_case_id) WHERE is_l1;
  END IF;

  SELECT evaluated_cost INTO _opening
    FROM public.procurement_commercial_ranking(_case_id) WHERE bidder_id = _bidder;

  INSERT INTO public.procurement_negotiations (case_id, bidder_id, opening_offer, created_by)
  VALUES (_case_id, _bidder, _opening, auth.uid())
  ON CONFLICT (case_id) DO UPDATE SET
    status = CASE WHEN public.procurement_negotiations.status = 'returned'
                   THEN 'open' ELSE public.procurement_negotiations.status END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_pnc_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_pnc_seed(NEW.id);
  RETURN NULL;
END;
$$;

-- AFTER UPDATE OF stage on the case, because procurement_advance_stage is the
-- only thing that writes cases.stage -- so this catches every route in,
-- including dpc.to_pnc and an administrator moving a case by hand.
DROP TRIGGER IF EXISTS trg_procurement_cases_pnc_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_pnc_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'pnc'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_pnc_seed_on_entry();

-- ===== Backfill =====
--
-- A case already sitting at pnc did not fire the trigger above.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'pnc'::procurement_stage LOOP
    PERFORM public.procurement_pnc_seed(c.id);
  END LOOP;
END $$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_pnc_assert_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_pnc_assert_may_negotiate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_negotiation_mandate(UUID, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_open_negotiation_round(UUID, NUMERIC, NUMERIC, INTEGER, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_update_negotiation_round(UUID, NUMERIC, NUMERIC, INTEGER, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_close_negotiation_round(UUID, NUMERIC, TEXT, INTEGER, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_pnc_agreement_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_pnc_agreed(UUID, JSONB) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_pnc_agreed(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_pnc_agreed is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_pnc_agreement_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_pnc_agreement_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
