-- The purchase proposal stage had three bare actions (approve, revise,
-- reject) and nothing behind them: the approving authority saw the case
-- summary and the requisition it came from, never the figure they were
-- actually being asked to approve. Checking how the reference process this
-- workflow is modelled on runs its own proposal stage confirmed the shape
-- already chosen here -- one generic approving role, a single approve /
-- return-for-revision / reject decision, no value-based approval tiers --
-- but also showed what was missing: a proposal is a decision packet (the
-- recommended vendor, the original evaluated cost against the negotiated
-- figure, the terms, a written recommendation), not a bare button.
--
-- What this migration adds:
--   procurement_purchase_proposals   one row per case, seeded on arrival:
--                                    the recommended bidder, the evaluated
--                                    cost the comparative statement recorded
--                                    for them, the negotiated price if
--                                    price negotiation actually ran, the
--                                    delivery/payment/warranty terms, and
--                                    the purchase officer's own written
--                                    recommendation for the approving
--                                    authority.
--
-- Deliberately not built here, and left as a known limit rather than
-- half-built: the reference splits "approve the proposal" from "raise the
-- purchase order" into two separate actions by two separate roles (a
-- draft PO is staged, then a PO officer issues it) -- this migration keeps
-- proposal.approve moving straight to purchase_order, because the purchase
-- order stage itself has no working form yet for a draft to land in.

-- ===== The proposal record =====

CREATE TABLE IF NOT EXISTS public.procurement_purchase_proposals (
  case_id              UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  recommended_bidder_id UUID REFERENCES public.procurement_bidders(id) ON DELETE SET NULL,

  -- Snapshotted at arrival, not read live -- the same reasoning
  -- procurement_negotiations.opening_offer already carries: the approving
  -- authority is being asked about a specific figure, and that figure should
  -- not move under them if a case is later reopened upstream.
  original_evaluated_cost NUMERIC(18,2),
  -- NULL when the case reached here without negotiation (dpc.to_proposal
  -- directly) -- there is no negotiated figure to show, only the original.
  negotiated_price        NUMERIC(18,2),

  delivery_days        INTEGER,
  payment_terms        TEXT,
  warranty_months      INTEGER,

  -- One field, not a "justification" and a "recommendation" both -- the same
  -- lesson the comparative statement's own recommendation form already
  -- learned: asking for the same explanation twice only gets the same
  -- sentence typed twice.
  recommendation_note  TEXT NOT NULL DEFAULT '',

  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_purchase_proposals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_purchase_proposals IS
  'One row per case, seeded on arrival at purchase_proposal. Readable by anyone who can see the case; writable only through procurement_save_proposal below.';

DROP POLICY IF EXISTS "Users can read purchase proposals on cases in their remit"
  ON public.procurement_purchase_proposals;
CREATE POLICY "Users can read purchase proposals on cases in their remit"
  ON public.procurement_purchase_proposals FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy -- every write goes through procurement_save_proposal,
-- the same reasoning as procurement_cst_scrutiny and the negotiation tables:
-- the one thing worth enforcing here (a non-empty recommendation) belongs in
-- one place, not repeated in a table CHECK and a client form both.

-- ===== Writing the recommendation =====

CREATE OR REPLACE FUNCTION public.procurement_save_proposal(
  _case_id             UUID,
  _recommendation_note TEXT
)
RETURNS public.procurement_purchase_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _row  public.procurement_purchase_proposals;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage IS DISTINCT FROM 'purchase_proposal'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the purchase proposal desk'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (public.has_procurement_permission(auth.uid(), 'proposal.draft')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold proposal.draft'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(btrim(_recommendation_note), '') = '' THEN
    RAISE EXCEPTION 'A recommendation is needed for the approving authority'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_purchase_proposals
     SET recommendation_note = _recommendation_note, updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  IF _row.case_id IS NULL THEN
    RAISE EXCEPTION 'No proposal record exists for this case' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.procurement_log_event(
    _case_id, 'purchase_proposal', 'proposal.recommendation_saved',
    'Recorded the recommendation for the approving authority', NULL);

  RETURN _row;
END;
$$;

-- ===== The gate on approval =====

CREATE OR REPLACE FUNCTION public.procurement_proposal_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row  public.procurement_purchase_proposals;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO _row FROM public.procurement_purchase_proposals WHERE case_id = _case_id;
  IF _row.case_id IS NULL THEN
    RETURN ARRAY['A purchase proposal record on this case'];
  END IF;

  IF COALESCE(btrim(_row.recommendation_note), '') = '' THEN
    _gaps := array_append(_gaps, 'A recommendation write-up for the approving authority');
  END IF;

  RETURN _gaps;
END;
$$;

-- (uuid, jsonb). The engine resolves a guard with to_regprocedure and skips it
-- in silence if the arity does not match, so the assertion at the foot of this
-- file exists to make a typo here loud instead of permissive.
CREATE OR REPLACE FUNCTION public.procurement_guard_proposal_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_proposal_gaps(_case_id), 1), 0) = 0;
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_proposal_ready',
       gaps_function = 'public.procurement_proposal_gaps'
 WHERE code = 'proposal.approve';

-- ===== Seeding the desk on arrival =====
--
-- Idempotent, and never repairs a read -- the same reasoning as every other
-- seed-on-entry trigger in this schema. The recommended bidder is whoever
-- price negotiation was actually run against, if a negotiation record
-- exists, since that is the one figure the approving authority is meant to
-- be reading; otherwise it falls back to the commercial desk's own
-- recommendation, or the computed L1 if neither exists.
CREATE OR REPLACE FUNCTION public.procurement_proposal_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bidder    UUID;
  _neg       public.procurement_negotiations;
  _round     public.procurement_negotiation_rounds;
  _ranking   RECORD;
BEGIN
  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = _case_id;
  _bidder := _neg.bidder_id;

  -- Read the settled round directly rather than trusting
  -- procurement_negotiations.status/final_price to already be 'agreed' --
  -- this trigger and the one that writes those columns both fire off the
  -- same procurement_record_decision call for pnc.agreed, and this one runs
  -- first (the stage moves before the event that concludes the negotiation
  -- is logged). A case reaching purchase_proposal only ever does so because
  -- either pnc.agreed just fired or negotiation never ran at all, so a
  -- closed round with a settled figure means exactly what it will mean once
  -- procurement_pnc_conclude_from_event catches up a moment later.
  IF _bidder IS NOT NULL THEN
    SELECT * INTO _round FROM public.procurement_negotiation_rounds
     WHERE case_id = _case_id AND status = 'closed' AND final_offer IS NOT NULL
     ORDER BY round_no DESC LIMIT 1;
  END IF;

  IF _bidder IS NULL THEN
    SELECT recommended_bidder_id INTO _bidder
      FROM public.procurement_commercial_recommendations
     WHERE case_id = _case_id AND outcome = 'award';
  END IF;

  IF _bidder IS NULL THEN
    SELECT bidder_id INTO _bidder
      FROM public.procurement_commercial_ranking(_case_id) WHERE is_l1;
  END IF;

  SELECT r.evaluated_cost, r.delivery_days, r.payment_terms, r.warranty_months
    INTO _ranking
    FROM public.procurement_commercial_ranking(_case_id) r WHERE r.bidder_id = _bidder;

  INSERT INTO public.procurement_purchase_proposals
    (case_id, recommended_bidder_id, original_evaluated_cost, negotiated_price,
     delivery_days, payment_terms, warranty_months, created_by)
  VALUES (
    _case_id, _bidder,
    COALESCE(_neg.opening_offer, _ranking.evaluated_cost),
    _round.final_offer,
    COALESCE(_round.delivery_days, _ranking.delivery_days),
    COALESCE(_round.payment_terms, _ranking.payment_terms),
    COALESCE(_round.warranty_months, _ranking.warranty_months),
    auth.uid())
  ON CONFLICT (case_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_proposal_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_proposal_seed(NEW.id);
  RETURN NULL;
END;
$$;

-- AFTER UPDATE OF stage on the case, because procurement_advance_stage is the
-- only thing that writes cases.stage -- so this catches both dpc.to_proposal
-- (no negotiation) and pnc.agreed (negotiation actually ran).
DROP TRIGGER IF EXISTS trg_procurement_cases_proposal_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_proposal_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'purchase_proposal'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_proposal_seed_on_entry();

-- ===== Backfill =====

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'purchase_proposal'::procurement_stage LOOP
    PERFORM public.procurement_proposal_seed(c.id);
  END LOOP;
END $$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_save_proposal(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_proposal_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_proposal_ready(UUID, JSONB) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_proposal_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_proposal_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_proposal_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_proposal_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
