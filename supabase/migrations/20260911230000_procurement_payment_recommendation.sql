-- Payment recommendation had four bare actions and nothing behind them.
-- Checking the reference process this workflow is modelled on found its own
-- module thin by its own admission -- no three-way match, no TDS or bank
-- detail, no distinct preparer-versus-approver enforcement despite role
-- names that suggest one, and clearing payment closes the case as a direct
-- side effect with no separate completion record. None of that is a gap to
-- close here; it is simply what this stage is. What this migration adds is
-- a real record for the one thing every version of this stage actually
-- needs: a stated invoice, set against what goods receipt already accepted,
-- with a gate before the case can close.
--
-- Deliberately not built, matching the reference's own absence of each:
-- statutory deductions (TDS), bank/beneficiary detail, a due date, a
-- three-way match against the purchase order, partial payment as a distinct
-- concept from a full hold, and any security-deposit or bank-guarantee
-- release tied to closing.

-- ===== The recommendation =====

CREATE TABLE IF NOT EXISTS public.procurement_payment_recommendations (
  case_id             UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,

  -- Snapshotted from goods receipt at arrival -- what was actually accepted,
  -- for the officer to weigh the invoice against. Not itself editable here;
  -- correcting it means a goods receipt amendment, not a payment-desk edit.
  accepted_value      NUMERIC(18,2) NOT NULL DEFAULT 0,

  invoice_number      TEXT,
  invoice_date        DATE,
  invoice_amount      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (invoice_amount >= 0),
  penalty_deductions  NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (penalty_deductions >= 0),
  recommended_amount  NUMERIC(18,2) GENERATED ALWAYS AS
                        (ROUND(invoice_amount - penalty_deductions, 2)) STORED,

  -- Recorded, not acted on -- the same as the reference's own fields.
  -- Nothing here triggers an actual transfer; this system stops at recording
  -- that a payment was recommended and, later, cleared.
  voucher_number      TEXT,
  voucher_date        DATE,
  remarks             TEXT,

  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cleared')),
  cleared_by          UUID REFERENCES auth.users(id),
  cleared_at          TIMESTAMPTZ,

  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT procurement_payment_recommendations_deductions_within_invoice
    CHECK (penalty_deductions <= invoice_amount)
);
ALTER TABLE public.procurement_payment_recommendations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_payment_recommendations IS
  'One row per case, seeded on arrival at payment_recommendation from what goods receipt accepted. No client write policy at all; every write goes through procurement_save_payment_recommendation.';

DROP POLICY IF EXISTS "Users can read payment recommendations on cases in their remit"
  ON public.procurement_payment_recommendations;
CREATE POLICY "Users can read payment recommendations on cases in their remit"
  ON public.procurement_payment_recommendations FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy -- see the header comment.

-- ===== The desk assertions every write shares =====

CREATE OR REPLACE FUNCTION public.procurement_payment_assert_open(_case_id UUID)
RETURNS public.procurement_payment_recommendations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _row  public.procurement_payment_recommendations;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage IS DISTINCT FROM 'payment_recommendation'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the payment desk'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _row FROM public.procurement_payment_recommendations WHERE case_id = _case_id;
  IF _row.case_id IS NULL THEN
    RAISE EXCEPTION 'No payment recommendation exists for this case' USING ERRCODE = 'check_violation';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'This payment has already been cleared' USING ERRCODE = 'check_violation';
  END IF;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_payment_assert_may_record(_case_id UUID)
RETURNS public.procurement_payment_recommendations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_payment_recommendations;
BEGIN
  _row := public.procurement_payment_assert_open(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'payment.process')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold payment.process'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _row;
END;
$$;

-- ===== Recording the invoice =====

CREATE OR REPLACE FUNCTION public.procurement_save_payment_recommendation(
  _case_id            UUID,
  _invoice_number     TEXT,
  _invoice_date       DATE,
  _invoice_amount     NUMERIC,
  _penalty_deductions NUMERIC,
  _voucher_number     TEXT,
  _voucher_date       DATE,
  _remarks            TEXT
)
RETURNS public.procurement_payment_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_payment_recommendations;
BEGIN
  PERFORM public.procurement_payment_assert_may_record(_case_id);

  UPDATE public.procurement_payment_recommendations
     SET invoice_number = _invoice_number,
         invoice_date = _invoice_date,
         invoice_amount = COALESCE(_invoice_amount, 0),
         penalty_deductions = COALESCE(_penalty_deductions, 0),
         voucher_number = _voucher_number,
         voucher_date = _voucher_date,
         remarks = _remarks,
         updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ===== The gate on clearing =====

CREATE OR REPLACE FUNCTION public.procurement_payment_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row  public.procurement_payment_recommendations;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO _row FROM public.procurement_payment_recommendations WHERE case_id = _case_id;
  IF _row.case_id IS NULL THEN
    RETURN ARRAY['A payment recommendation record on this case'];
  END IF;

  IF COALESCE(btrim(_row.invoice_number), '') = '' THEN
    _gaps := array_append(_gaps, 'An invoice number');
  END IF;
  IF _row.invoice_date IS NULL THEN
    _gaps := array_append(_gaps, 'An invoice date');
  END IF;
  IF _row.invoice_amount <= 0 THEN
    _gaps := array_append(_gaps, 'An invoice amount');
  END IF;

  RETURN _gaps;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_guard_payment_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_payment_gaps(_case_id), 1), 0) = 0;
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_payment_ready',
       gaps_function = 'public.procurement_payment_gaps'
 WHERE code = 'payment.clear';

-- ===== Clearing =====

CREATE OR REPLACE FUNCTION public.procurement_payment_clear_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.procurement_payment_recommendations
     SET status = 'cleared', cleared_by = NEW.actor_id, cleared_at = now(), updated_at = now()
   WHERE case_id = NEW.case_id AND status <> 'cleared';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_payment_clear ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_payment_clear
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'payment.clear')
  EXECUTE FUNCTION public.procurement_payment_clear_from_event();

-- ===== Seeding the desk on arrival =====
--
-- Idempotent, never repairs a read. accepted_value is the sum of every
-- line's accepted value across every goods-receipt cycle -- what the
-- invoice is actually being weighed against -- and invoice_amount starts
-- there too, purely as a convenience the officer can correct: a real
-- invoice can legitimately differ (freight, a rounding difference, a
-- statutory charge this schema does not model), so nothing here treats a
-- mismatch as an error.
CREATE OR REPLACE FUNCTION public.procurement_payment_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _accepted NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM public.procurement_payment_recommendations WHERE case_id = _case_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(s.total_accepted_value), 0) INTO _accepted
    FROM public.procurement_grn_summary(_case_id) s;

  INSERT INTO public.procurement_payment_recommendations
    (case_id, accepted_value, invoice_amount, created_by)
  VALUES (_case_id, _accepted, _accepted, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_payment_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_payment_seed(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_payment_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_payment_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'payment_recommendation'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_payment_seed_on_entry();

-- ===== Backfill =====

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'payment_recommendation'::procurement_stage LOOP
    PERFORM public.procurement_payment_seed(c.id);
  END LOOP;
END $$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_payment_assert_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_payment_assert_may_record(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_payment_recommendation(UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_payment_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_payment_ready(UUID, JSONB) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_payment_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_payment_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_payment_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_payment_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
