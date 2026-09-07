-- The purchase order stage had one bare action (po.issue) and nothing behind
-- it. Checking how the reference process this workflow is modelled on runs
-- its own purchase-order stage surfaced three domain facts worth keeping,
-- and one genuine AI feature worth building rather than a fixed template:
--
--   * a PO is a real document -- line items, a delivery date and address, a
--     billing address, payment/delivery terms, a warranty period, a penalty
--     clause -- carried in from the approved proposal, not typed from
--     nothing. The reference populates all of that deterministically from
--     the proposal and the priced schedule; nothing about the PO's own
--     transactional fields is model-generated there.
--   * separately, the reference has a genuine LLM-drafting feature: given
--     the vendor, the amount, and the negotiated terms, a model drafts the
--     narrative clause text (the payment-terms paragraph, the delivery /
--     execution schedule paragraph, the warranty and inspection paragraph)
--     for a human to review and use as a starting point -- never written
--     directly into the record. That is the shape copied here, as its own
--     suggestion table nothing downstream reads, the same discipline this
--     schema already holds TEC's AI suggestion to.
--   * once issued, a PO can be amended -- price, date, terms -- logged with
--     a reason and a version bump, the same corrigendum shape a tender
--     notice already uses. Before issue there is nothing to amend, only a
--     draft to correct; procurement_save_po is that, plain and unlogged.
--
-- Not built here, and not a gap relative to the reference either: a second,
-- finance-specific sign-off before release (the reference's own equivalent
-- is an optional generic e-sign flag, not a hardcoded second role) and a
-- separate dispatch-instruction step (the reference has none).

-- ===== The order itself =====

CREATE TABLE IF NOT EXISTS public.procurement_purchase_orders (
  case_id               UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  po_no                 TEXT NOT NULL UNIQUE,
  recommended_bidder_id UUID REFERENCES public.procurement_bidders(id) ON DELETE SET NULL,

  total_value           NUMERIC(18,2),

  delivery_date         DATE,
  delivery_address      TEXT,
  billing_address       TEXT,
  payment_terms         TEXT,
  delivery_terms        TEXT,
  special_conditions    TEXT,
  warranty_months       INTEGER,
  penalty_clause        TEXT,

  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued')),
  version               INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),

  -- Recorded on the vendor's behalf by the purchase officer -- the same
  -- shape as every other vendor-side fact in this schema (a bid, a
  -- compliance call): there is no bidder-facing door for a vendor to record
  -- their own acknowledgement through.
  vendor_ack_status      TEXT NOT NULL DEFAULT 'pending'
                           CHECK (vendor_ack_status IN ('pending', 'acknowledged', 'accepted', 'rejected')),
  vendor_ack_note        TEXT,
  vendor_ack_recorded_by UUID REFERENCES auth.users(id),
  vendor_ack_recorded_at TIMESTAMPTZ,

  issued_by             UUID REFERENCES auth.users(id),
  issued_at             TIMESTAMPTZ,

  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_purchase_orders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_purchase_orders IS
  'One row per case, seeded on arrival at purchase_order from the approved proposal. Readable by anyone who can see the case; writable only through the RPCs below.';

-- ===== Line items =====

CREATE TABLE IF NOT EXISTS public.procurement_po_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES public.procurement_purchase_orders(case_id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL DEFAULT 0,
  item_name      TEXT NOT NULL DEFAULT '',
  unit           TEXT,
  quantity       NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_rate      NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (unit_rate >= 0),
  gst_pct        NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (gst_pct BETWEEN 0 AND 100),
  line_amount    NUMERIC(18,2) GENERATED ALWAYS AS
                   (ROUND(quantity * unit_rate * (1 + gst_pct / 100.0), 2)) STORED,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_po_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_po_lines_case ON public.procurement_po_lines(case_id);

COMMENT ON TABLE public.procurement_po_lines IS
  'What the order actually books, one line at a time -- seeded once from the awarded bidder''s own priced schedule, or a single lump line when they never priced item by item. Same visibility as the order; no client write policy.';

-- ===== Amendments =====

CREATE TABLE IF NOT EXISTS public.procurement_po_amendments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.procurement_purchase_orders(case_id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  changes     JSONB NOT NULL DEFAULT '{}'::jsonb,
  amended_by  UUID REFERENCES auth.users(id),
  amended_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_po_amendments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_po_amendments_case ON public.procurement_po_amendments(case_id, amended_at DESC);

COMMENT ON TABLE public.procurement_po_amendments IS
  'Every change made to an issued order, with a reason and what moved from what to what -- the same corrigendum shape a floated tender notice already uses. No client write policy; every row comes from procurement_amend_po.';

-- ===== The AI-drafted clause text =====
--
-- A suggestion, not a decision: it lives in its own table, nothing that
-- gates po.issue ever reads it, and it never overwrites the officer's own
-- fields on save -- the same discipline procurement_tec_ai_suggestions holds.
CREATE TABLE IF NOT EXISTS public.procurement_po_ai_drafts (
  case_id                  UUID PRIMARY KEY REFERENCES public.procurement_purchase_orders(case_id) ON DELETE CASCADE,
  payment_terms_draft      TEXT,
  delivery_terms_draft     TEXT,
  warranty_clause_draft    TEXT,
  special_conditions_draft TEXT,
  model                    TEXT,
  requested_by             UUID REFERENCES auth.users(id),
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_po_ai_drafts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_po_ai_drafts IS
  'A model''s drafted clause text for one order -- payment terms, delivery/execution schedule, warranty and inspection, special conditions -- for the purchase officer to review and use as a starting point. Regenerated in place (one row per case), never blended into procurement_purchase_orders on its own.';

-- ===== Read access =====

DROP POLICY IF EXISTS "Users can read purchase orders on cases in their remit"
  ON public.procurement_purchase_orders;
CREATE POLICY "Users can read purchase orders on cases in their remit"
  ON public.procurement_purchase_orders FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read PO lines on cases in their remit"
  ON public.procurement_po_lines;
CREATE POLICY "Users can read PO lines on cases in their remit"
  ON public.procurement_po_lines FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read PO amendments on cases in their remit"
  ON public.procurement_po_amendments;
CREATE POLICY "Users can read PO amendments on cases in their remit"
  ON public.procurement_po_amendments FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read PO AI drafts on cases in their remit"
  ON public.procurement_po_ai_drafts;
CREATE POLICY "Users can read PO AI drafts on cases in their remit"
  ON public.procurement_po_ai_drafts FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy on any of the four -- every write goes through an RPC
-- below, the same reasoning as procurement_cst_scrutiny and the negotiation
-- and proposal tables.

-- ===== The desk assertions every write shares =====

CREATE OR REPLACE FUNCTION public.procurement_po_assert_open(_case_id UUID)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _po   public.procurement_purchase_orders;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage IS DISTINCT FROM 'purchase_order'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the purchase order desk'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _po FROM public.procurement_purchase_orders WHERE case_id = _case_id;
  IF _po.case_id IS NULL THEN
    RAISE EXCEPTION 'No purchase order record exists for this case' USING ERRCODE = 'check_violation';
  END IF;

  RETURN _po;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_po_assert_may_edit(_case_id UUID)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po public.procurement_purchase_orders;
BEGIN
  _po := public.procurement_po_assert_open(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'po.issue')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold po.issue'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _po;
END;
$$;

-- A separate, looser assertion for anything that legitimately happens after
-- the order has already moved the case on -- recording the vendor's
-- response, or amending an issued order. procurement_po_assert_open checks
-- the case is still "at" purchase_order, which po.issue itself has just made
-- false by the time either of these would ever be called; neither has any
-- reason to require the case to still be sitting at that desk.
CREATE OR REPLACE FUNCTION public.procurement_po_assert_may_manage(_case_id UUID)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case public.procurement_cases;
  _po   public.procurement_purchase_orders;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is closed' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _po FROM public.procurement_purchase_orders WHERE case_id = _case_id;
  IF _po.case_id IS NULL THEN
    RAISE EXCEPTION 'No purchase order record exists for this case' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (public.has_procurement_permission(auth.uid(), 'po.issue')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold po.issue'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN _po;
END;
$$;

-- ===== Editing the draft =====

CREATE OR REPLACE FUNCTION public.procurement_save_po(
  _case_id            UUID,
  _delivery_date      DATE,
  _delivery_address   TEXT,
  _billing_address    TEXT,
  _payment_terms      TEXT,
  _delivery_terms     TEXT,
  _special_conditions TEXT,
  _warranty_months    INTEGER,
  _penalty_clause     TEXT
)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po  public.procurement_purchase_orders;
  _row public.procurement_purchase_orders;
BEGIN
  _po := public.procurement_po_assert_may_edit(_case_id);

  IF _po.status <> 'draft' THEN
    RAISE EXCEPTION 'This order has already been issued; amend it instead'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_purchase_orders
     SET delivery_date = _delivery_date,
         delivery_address = _delivery_address,
         billing_address = _billing_address,
         payment_terms = _payment_terms,
         delivery_terms = _delivery_terms,
         special_conditions = _special_conditions,
         warranty_months = _warranty_months,
         penalty_clause = _penalty_clause,
         updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ===== The gate on issuing =====

CREATE OR REPLACE FUNCTION public.procurement_po_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po   public.procurement_purchase_orders;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT * INTO _po FROM public.procurement_purchase_orders WHERE case_id = _case_id;
  IF _po.case_id IS NULL THEN
    RETURN ARRAY['A purchase order record on this case'];
  END IF;

  IF _po.delivery_date IS NULL THEN
    _gaps := array_append(_gaps, 'A delivery date');
  END IF;
  IF COALESCE(btrim(_po.delivery_address), '') = '' THEN
    _gaps := array_append(_gaps, 'A delivery address');
  END IF;
  IF COALESCE(btrim(_po.payment_terms), '') = '' THEN
    _gaps := array_append(_gaps, 'Payment terms');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_po_lines WHERE case_id = _case_id) THEN
    _gaps := array_append(_gaps, 'At least one order line');
  END IF;

  RETURN _gaps;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_guard_po_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_po_gaps(_case_id), 1), 0) = 0;
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_po_ready',
       gaps_function = 'public.procurement_po_gaps'
 WHERE code = 'po.issue';

-- ===== Issuing, via the same trigger shape as every other holding decision =====

CREATE OR REPLACE FUNCTION public.procurement_po_issue_from_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.procurement_purchase_orders
     SET status = 'issued', issued_by = NEW.actor_id, issued_at = now(), updated_at = now()
   WHERE case_id = NEW.case_id AND status <> 'issued';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_case_events_po_issue ON public.procurement_case_events;
CREATE TRIGGER trg_procurement_case_events_po_issue
  AFTER INSERT ON public.procurement_case_events
  FOR EACH ROW
  WHEN (NEW.action = 'po.issue')
  EXECUTE FUNCTION public.procurement_po_issue_from_event();

-- ===== The vendor's acknowledgement, recorded on their behalf =====

CREATE OR REPLACE FUNCTION public.procurement_record_po_vendor_ack(
  _case_id UUID,
  _status  TEXT,
  _note    TEXT DEFAULT NULL
)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po  public.procurement_purchase_orders;
  _row public.procurement_purchase_orders;
BEGIN
  _po := public.procurement_po_assert_may_manage(_case_id);

  IF _po.status <> 'issued' THEN
    RAISE EXCEPTION 'The order has not been issued yet' USING ERRCODE = 'check_violation';
  END IF;
  IF _status NOT IN ('acknowledged', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Not a recognised acknowledgement status' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_purchase_orders
     SET vendor_ack_status = _status, vendor_ack_note = _note,
         vendor_ack_recorded_by = auth.uid(), vendor_ack_recorded_at = now(),
         updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'purchase_order', 'po.vendor_ack_recorded',
    'Recorded the vendor''s response: ' || replace(_status, '_', ' '),
    jsonb_build_object('status', _status));

  RETURN _row;
END;
$$;

-- ===== Amending an issued order =====

CREATE OR REPLACE FUNCTION public.procurement_amend_po(
  _case_id            UUID,
  _reason             TEXT,
  _delivery_date      DATE DEFAULT NULL,
  _delivery_terms     TEXT DEFAULT NULL,
  _special_conditions TEXT DEFAULT NULL,
  _total_value        NUMERIC DEFAULT NULL
)
RETURNS public.procurement_purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _po      public.procurement_purchase_orders;
  _row     public.procurement_purchase_orders;
  _changes JSONB := '{}'::jsonb;
BEGIN
  _po := public.procurement_po_assert_may_manage(_case_id);

  IF _po.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued order can be amended; save the draft instead'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is needed to amend an order' USING ERRCODE = 'check_violation';
  END IF;

  IF _delivery_date IS NOT NULL AND _delivery_date IS DISTINCT FROM _po.delivery_date THEN
    _changes := _changes || jsonb_build_object('delivery_date',
      jsonb_build_object('from', _po.delivery_date, 'to', _delivery_date));
  END IF;
  IF _delivery_terms IS NOT NULL AND _delivery_terms IS DISTINCT FROM _po.delivery_terms THEN
    _changes := _changes || jsonb_build_object('delivery_terms',
      jsonb_build_object('from', _po.delivery_terms, 'to', _delivery_terms));
  END IF;
  IF _special_conditions IS NOT NULL AND _special_conditions IS DISTINCT FROM _po.special_conditions THEN
    _changes := _changes || jsonb_build_object('special_conditions',
      jsonb_build_object('from', _po.special_conditions, 'to', _special_conditions));
  END IF;
  IF _total_value IS NOT NULL AND _total_value IS DISTINCT FROM _po.total_value THEN
    _changes := _changes || jsonb_build_object('total_value',
      jsonb_build_object('from', _po.total_value, 'to', _total_value));
  END IF;

  IF _changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing on the order actually changed' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_purchase_orders
     SET delivery_date = COALESCE(_delivery_date, delivery_date),
         delivery_terms = COALESCE(_delivery_terms, delivery_terms),
         special_conditions = COALESCE(_special_conditions, special_conditions),
         total_value = COALESCE(_total_value, total_value),
         version = version + 1,
         updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  INSERT INTO public.procurement_po_amendments (case_id, version, reason, changes, amended_by)
  VALUES (_case_id, _row.version, _reason, _changes, auth.uid());

  PERFORM public.procurement_log_event(
    _case_id, 'purchase_order', 'po.amended',
    'Amended the order (version ' || _row.version || '): ' || _reason,
    _changes);

  RETURN _row;
END;
$$;

-- ===== The AI-drafted clause text =====

CREATE OR REPLACE FUNCTION public.procurement_record_po_ai_draft(
  _case_id                  UUID,
  _payment_terms_draft      TEXT,
  _delivery_terms_draft     TEXT,
  _warranty_clause_draft    TEXT,
  _special_conditions_draft TEXT,
  _model                    TEXT
)
RETURNS public.procurement_po_ai_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_po_ai_drafts;
BEGIN
  PERFORM public.procurement_po_assert_may_edit(_case_id);

  INSERT INTO public.procurement_po_ai_drafts
    (case_id, payment_terms_draft, delivery_terms_draft, warranty_clause_draft,
     special_conditions_draft, model, requested_by, generated_at)
  VALUES
    (_case_id, _payment_terms_draft, _delivery_terms_draft, _warranty_clause_draft,
     _special_conditions_draft, _model, auth.uid(), now())
  ON CONFLICT (case_id) DO UPDATE SET
    payment_terms_draft = EXCLUDED.payment_terms_draft,
    delivery_terms_draft = EXCLUDED.delivery_terms_draft,
    warranty_clause_draft = EXCLUDED.warranty_clause_draft,
    special_conditions_draft = EXCLUDED.special_conditions_draft,
    model = EXCLUDED.model,
    requested_by = EXCLUDED.requested_by,
    generated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- ===== Seeding the desk on arrival =====
--
-- Idempotent, never repairs a read. Lines are copied once from the awarded
-- bidder's own priced schedule when they priced item by item; a bidder who
-- was priced as a lump sum gets a single line carrying the proposal's own
-- figure, because there is nothing item-wise on file to copy.
CREATE OR REPLACE FUNCTION public.procurement_po_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prop     public.procurement_purchase_proposals;
  _req      RECORD;
  _po_no    TEXT;
  _value    NUMERIC;
  _has_lines BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM public.procurement_purchase_orders WHERE case_id = _case_id) THEN
    RETURN;
  END IF;

  SELECT * INTO _prop FROM public.procurement_purchase_proposals WHERE case_id = _case_id;

  SELECT r.delivery_note, l.name AS warehouse_name
    INTO _req
    FROM public.procurement_requisitions r
    LEFT JOIN public.procurement_lookups l ON l.id = r.warehouse_id
   WHERE r.case_id = _case_id;

  _value := COALESCE(_prop.negotiated_price, _prop.original_evaluated_cost);
  _po_no := public.procurement_next_ref('PO');

  INSERT INTO public.procurement_purchase_orders
    (case_id, po_no, recommended_bidder_id, total_value,
     delivery_address, payment_terms, delivery_terms, warranty_months, created_by)
  VALUES (
    _case_id, _po_no, _prop.recommended_bidder_id, _value,
    NULLIF(_req.warehouse_name, ''), _prop.payment_terms,
    CASE WHEN _prop.delivery_days IS NOT NULL
         THEN _prop.delivery_days || ' days from the date of this order' END,
    _prop.warranty_months, auth.uid());

  SELECT EXISTS (
    SELECT 1 FROM public.procurement_quote_lines ql
      JOIN public.procurement_commercial_quotes q ON q.id = ql.quote_id
     WHERE q.bidder_id = _prop.recommended_bidder_id AND q.price_source = 'lines')
    INTO _has_lines;

  IF _has_lines THEN
    INSERT INTO public.procurement_po_lines
      (case_id, line_no, item_name, unit, quantity, unit_rate, gst_pct)
    SELECT _case_id, ql.line_no, ql.item_name, ql.unit, ql.quantity,
           COALESCE(ql.unit_rate, 0), COALESCE(q.gst_pct, 0)
      FROM public.procurement_quote_lines ql
      JOIN public.procurement_commercial_quotes q ON q.id = ql.quote_id
     WHERE q.bidder_id = _prop.recommended_bidder_id
     ORDER BY ql.line_no;
  ELSE
    INSERT INTO public.procurement_po_lines (case_id, line_no, item_name, unit, quantity, unit_rate, gst_pct)
    VALUES (_case_id, 1, 'As per the comparative statement (lump sum)', 'Lot', 1, COALESCE(_value, 0), 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_po_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_po_seed(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_po_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_po_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'purchase_order'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_po_seed_on_entry();

-- ===== Backfill =====

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'purchase_order'::procurement_stage LOOP
    PERFORM public.procurement_po_seed(c.id);
  END LOOP;
END $$;

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_po_assert_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_po_assert_may_edit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_po_assert_may_manage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_po(UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_po_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_po_ready(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_record_po_vendor_ack(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_amend_po(UUID, TEXT, DATE, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_record_po_ai_draft(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ===== The arity assertions =====

DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_po_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_po_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_po_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_po_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
