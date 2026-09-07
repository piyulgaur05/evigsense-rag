-- Goods receipt had three bare actions and nothing behind them. Checking how
-- the reference process this workflow is modelled on runs its own receipt
-- module surfaced the domain facts worth keeping, adapted to this schema's
-- own single-transition-per-stage engine rather than copied wholesale:
--
--   * a receipt is seeded automatically from the issued order's own lines --
--     ordered quantity and rate, not retyped.
--   * receiving happens in rounds ("cycles" here, the same word this schema
--     already uses for a committee's own membership term): one open cycle
--     at a time, each carrying what was delivered, accepted and rejected
--     per line, and a rejection needs a stated reason -- the reference's own
--     "discrepancy entry" idea, without the separate schema it never
--     actually enforces (its own inspection step is designed but unused in
--     its real workflow; not copied here for the same reason nothing here
--     should be built and then never wired to anything).
--   * completion does NOT require full quantity. The reference forwards a
--     short receipt to payment and reopens the next cycle for the balance
--     in the same action; this engine moves one case through one stage at a
--     time, so that becomes two actions instead of one: `grn.close_cycle`
--     finishes recording one delivery (and auto-opens the next cycle if a
--     balance remains, exactly the reference's own reopening rule) and
--     `grn.forward` -- the actual hand-off to payment -- is available the
--     moment the latest cycle is closed, whether or not everything ordered
--     has arrived. The same two-step shape price negotiation already uses
--     for "close a round" versus "conclude the negotiation."
--
-- Deliberately not built: a separate inspection/QA verdict (the reference's
-- own schema for this is never actually exercised by its workflow, so
-- reproducing it here would be building the same unused shape twice); a
-- debit note or vendor-facing shortage notice (the reference records a
-- shortage as a fact and takes no further procedural action either); and a
-- security deposit / bank guarantee check (absent from the reference's own
-- goods-receipt module entirely).

-- ===== The receipt cycle =====

CREATE TABLE IF NOT EXISTS public.procurement_goods_receipts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  cycle      INTEGER NOT NULL CHECK (cycle >= 1),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'forwarded')),
  closed_by  UUID REFERENCES auth.users(id),
  closed_at  TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, cycle)
);
ALTER TABLE public.procurement_goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_goods_receipts_case ON public.procurement_goods_receipts(case_id);

-- One open cycle at a time -- the fact that makes "close this delivery
-- before starting the next" a database rule, the same shape as price
-- negotiation's one-open-round index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_goods_receipts_one_open
  ON public.procurement_goods_receipts(case_id) WHERE status = 'open';

COMMENT ON TABLE public.procurement_goods_receipts IS
  'One row per delivery cycle, seeded on arrival at goods_receipt and reopened automatically while a balance remains. No client write policy at all; every write goes through the RPCs below.';

-- ===== What arrived, per line, per cycle =====

CREATE TABLE IF NOT EXISTS public.procurement_grn_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id                  UUID NOT NULL REFERENCES public.procurement_goods_receipts(id) ON DELETE CASCADE,
  case_id                 UUID NOT NULL,
  line_no                 INTEGER NOT NULL DEFAULT 0,
  item_name               TEXT NOT NULL DEFAULT '',
  unit                    TEXT,
  unit_rate               NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (unit_rate >= 0),

  ordered_qty             NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (ordered_qty >= 0),
  -- The running total from every earlier cycle -- carried forward so a
  -- reader never has to sum history to see what is actually still owed.
  previously_accepted_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (previously_accepted_qty >= 0),

  delivered_qty           NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
  accepted_qty            NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
  rejected_qty            NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  -- Required only for an actual rejection -- a line simply not yet delivered
  -- in this cycle (arriving in a later one) is not a discrepancy.
  discrepancy_reason      TEXT,

  accepted_value          NUMERIC(18,2) GENERATED ALWAYS AS
                            (ROUND(accepted_qty * unit_rate, 2)) STORED,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT procurement_grn_lines_classified_within_delivered
    CHECK (accepted_qty + rejected_qty <= delivered_qty),
  CONSTRAINT procurement_grn_lines_accepted_within_ordered
    CHECK (previously_accepted_qty + accepted_qty <= ordered_qty),
  CONSTRAINT procurement_grn_lines_rejection_reasoned
    CHECK (rejected_qty = 0 OR COALESCE(btrim(discrepancy_reason), '') <> '')
);
ALTER TABLE public.procurement_grn_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_grn_lines_case ON public.procurement_grn_lines(case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_grn_lines_grn ON public.procurement_grn_lines(grn_id);

COMMENT ON TABLE public.procurement_grn_lines IS
  'One published order line, one cycle. No client write policy; every write goes through procurement_save_grn_line.';

-- ===== Read access =====

DROP POLICY IF EXISTS "Users can read goods receipts on cases in their remit"
  ON public.procurement_goods_receipts;
CREATE POLICY "Users can read goods receipts on cases in their remit"
  ON public.procurement_goods_receipts FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read GRN lines on cases in their remit"
  ON public.procurement_grn_lines;
CREATE POLICY "Users can read GRN lines on cases in their remit"
  ON public.procurement_grn_lines FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy on either -- see the header comment.

-- ===== The desk assertions every write shares =====

CREATE OR REPLACE FUNCTION public.procurement_grn_assert_open(_case_id UUID)
RETURNS public.procurement_goods_receipts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _grn  public.procurement_goods_receipts;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage IS DISTINCT FROM 'goods_receipt'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at goods receipt'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _grn FROM public.procurement_goods_receipts
   WHERE case_id = _case_id AND status = 'open';
  IF _grn.id IS NULL THEN
    RAISE EXCEPTION 'No delivery is currently open to record against'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN _grn;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_grn_assert_may_record(_case_id UUID)
RETURNS public.procurement_goods_receipts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grn public.procurement_goods_receipts;
BEGIN
  _grn := public.procurement_grn_assert_open(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'grn.create')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold grn.create'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _grn;
END;
$$;

-- ===== Recording one line =====

CREATE OR REPLACE FUNCTION public.procurement_save_grn_line(
  _line_id            UUID,
  _delivered_qty      NUMERIC,
  _accepted_qty       NUMERIC,
  _rejected_qty       NUMERIC,
  _discrepancy_reason TEXT DEFAULT NULL
)
RETURNS public.procurement_grn_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case_id UUID;
  _row     public.procurement_grn_lines;
BEGIN
  SELECT l.case_id INTO _case_id
    FROM public.procurement_grn_lines l
    JOIN public.procurement_goods_receipts g ON g.id = l.grn_id
   WHERE l.id = _line_id AND g.status = 'open';
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No open delivery line to record against' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_grn_assert_may_record(_case_id);

  UPDATE public.procurement_grn_lines
     SET delivered_qty = COALESCE(_delivered_qty, 0),
         accepted_qty = COALESCE(_accepted_qty, 0),
         rejected_qty = COALESCE(_rejected_qty, 0),
         discrepancy_reason = _discrepancy_reason,
         updated_at = now()
   WHERE id = _line_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ===== The rollup a reader (and the payment desk, later) actually wants =====
--
-- Grouped by line_no rather than read one cycle at a time: previously
-- accepted quantity is bookkeeping for the next cycle's own ceiling, not a
-- second figure to add on top of a sum across cycles.
CREATE OR REPLACE FUNCTION public.procurement_grn_summary(_case_id UUID)
RETURNS TABLE (
  line_no              INTEGER,
  item_name            TEXT,
  unit                 TEXT,
  unit_rate            NUMERIC,
  ordered_qty          NUMERIC,
  total_delivered_qty  NUMERIC,
  total_accepted_qty   NUMERIC,
  total_rejected_qty   NUMERIC,
  total_accepted_value NUMERIC,
  fully_received       BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.line_no, l.item_name, l.unit, l.unit_rate,
         MAX(l.ordered_qty),
         SUM(l.delivered_qty),
         SUM(l.accepted_qty),
         SUM(l.rejected_qty),
         SUM(l.accepted_value),
         SUM(l.accepted_qty) >= MAX(l.ordered_qty)
    FROM public.procurement_grn_lines l
   WHERE l.case_id = _case_id
     AND public.procurement_can_view_case(auth.uid(), _case_id)
   GROUP BY l.line_no, l.item_name, l.unit, l.unit_rate
   ORDER BY l.line_no;
$$;

-- ===== Closing a cycle =====

CREATE OR REPLACE FUNCTION public.procurement_grn_close_cycle_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grn  public.procurement_goods_receipts;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO _grn FROM public.procurement_goods_receipts
   WHERE case_id = _case_id AND status = 'open';
  IF _grn.id IS NULL THEN
    RETURN ARRAY['An open delivery to close'];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.procurement_grn_lines WHERE grn_id = _grn.id AND delivered_qty > 0) THEN
    _gaps := array_append(_gaps, 'At least one line actually delivered');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_grn_lines
     WHERE grn_id = _grn.id AND accepted_qty + rejected_qty <> delivered_qty)
  THEN
    _gaps := array_append(_gaps, 'Every delivered line classified as accepted or rejected');
  END IF;

  RETURN _gaps;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_guard_grn_close_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_grn_close_cycle_gaps(_case_id), 1), 0) = 0;
$$;

-- Fires on grn.close_cycle: closes the open cycle, and reopens the next one
-- automatically if any line still has a balance left to receive -- the
-- reference's own reopening rule, just decoupled from forwarding to payment.
CREATE OR REPLACE FUNCTION public.procurement_grn_close_cycle_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grn        public.procurement_goods_receipts;
  _next_id    UUID;
  _incomplete BOOLEAN;
BEGIN
  SELECT * INTO _grn FROM public.procurement_goods_receipts
   WHERE case_id = NEW.case_id AND status = 'open';
  IF _grn.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.procurement_goods_receipts
     SET status = 'closed', closed_by = NEW.actor_id, closed_at = now(), updated_at = now()
   WHERE id = _grn.id;

  SELECT EXISTS (
    SELECT 1 FROM public.procurement_grn_lines
     WHERE grn_id = _grn.id AND previously_accepted_qty + accepted_qty < ordered_qty)
    INTO _incomplete;

  IF _incomplete THEN
    INSERT INTO public.procurement_goods_receipts (case_id, cycle, created_by)
    VALUES (NEW.case_id, _grn.cycle + 1, NEW.actor_id)
    RETURNING id INTO _next_id;

    INSERT INTO public.procurement_grn_lines
      (grn_id, case_id, line_no, item_name, unit, unit_rate, ordered_qty, previously_accepted_qty)
    SELECT _next_id, NEW.case_id, l.line_no, l.item_name, l.unit, l.unit_rate,
           l.ordered_qty, l.previously_accepted_qty + l.accepted_qty
      FROM public.procurement_grn_lines l
     WHERE l.grn_id = _grn.id
     ORDER BY l.line_no;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_grn_close ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_grn_close
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'grn.close_cycle')
  EXECUTE FUNCTION public.procurement_grn_close_cycle_from_event();

-- ===== Forwarding to payment =====
--
-- No full-quantity requirement -- the reference's own rule. All this gate
-- asks is that the latest cycle actually be closed, i.e. that whatever
-- arrived has been classified, not that everything ordered has arrived.
CREATE OR REPLACE FUNCTION public.procurement_grn_forward_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _latest public.procurement_goods_receipts;
BEGIN
  SELECT * INTO _latest FROM public.procurement_goods_receipts
   WHERE case_id = _case_id ORDER BY cycle DESC LIMIT 1;

  IF _latest.id IS NULL THEN
    RETURN ARRAY['A goods receipt record on this case'];
  END IF;
  IF _latest.status = 'open' THEN
    RETURN ARRAY['The current delivery closed before forwarding'];
  END IF;

  RETURN ARRAY[]::TEXT[];
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_guard_grn_forward_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_grn_forward_gaps(_case_id), 1), 0) = 0;
$$;

CREATE OR REPLACE FUNCTION public.procurement_grn_forward_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.procurement_goods_receipts
     SET status = 'forwarded', updated_at = now()
   WHERE case_id = NEW.case_id AND status = 'closed';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_grn_forward ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_grn_forward
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'grn.forward')
  EXECUTE FUNCTION public.procurement_grn_forward_from_event();

-- ===== The stage action, and the gate wired onto the existing one =====

INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status,
   requires_remarks, requires_signature, chair_only, guard_function, gaps_function, sort_order) VALUES
  ('grn.close_cycle', 'goods_receipt', 'approve', 'Close this delivery',
   'Finishes recording what arrived. Reopens automatically if a balance remains.',
   'grn.create', NULL, 'Delivery recorded',
   false, false, false,
   'public.procurement_guard_grn_close_ready', 'public.procurement_grn_close_cycle_gaps', 5)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  permission = EXCLUDED.permission, target_stage = EXCLUDED.target_stage,
  entry_status = EXCLUDED.entry_status, requires_remarks = EXCLUDED.requires_remarks,
  guard_function = EXCLUDED.guard_function, gaps_function = EXCLUDED.gaps_function,
  sort_order = EXCLUDED.sort_order;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_grn_forward_ready',
       gaps_function = 'public.procurement_grn_forward_gaps'
 WHERE code = 'grn.forward';

-- ===== Seeding the desk on arrival =====

CREATE OR REPLACE FUNCTION public.procurement_grn_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grn_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.procurement_goods_receipts WHERE case_id = _case_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.procurement_goods_receipts (case_id, cycle, created_by)
  VALUES (_case_id, 1, auth.uid())
  RETURNING id INTO _grn_id;

  INSERT INTO public.procurement_grn_lines
    (grn_id, case_id, line_no, item_name, unit, unit_rate, ordered_qty)
  SELECT _grn_id, _case_id, l.line_no, l.item_name, l.unit, l.unit_rate, l.quantity
    FROM public.procurement_po_lines l
   WHERE l.case_id = _case_id
   ORDER BY l.line_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_grn_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_grn_seed(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_grn_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_grn_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'goods_receipt'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_grn_seed_on_entry();

-- ===== Backfill =====

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'goods_receipt'::procurement_stage LOOP
    PERFORM public.procurement_grn_seed(c.id);
  END LOOP;
END $$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_grn_assert_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_grn_assert_may_record(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_grn_line(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_grn_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_grn_close_cycle_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_grn_close_ready(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_grn_forward_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_grn_forward_ready(UUID, JSONB) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_grn_close_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_grn_close_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_grn_close_cycle_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_grn_close_cycle_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
  IF to_regprocedure('public.procurement_guard_grn_forward_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_grn_forward_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_grn_forward_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_grn_forward_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
