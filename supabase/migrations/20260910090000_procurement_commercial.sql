-- The commercial desk: bids brought to the same terms, then ranked.
--
-- Two of the limits in PROCUREMENT.md 11 are really one limit. "Bids carry one
-- amount, not priced lines" is why "procurement_tender_summary.lowest_bid is
-- the lowest amount recorded and never a ranking" -- a lump figure from three
-- firms quoting different tax, different freight and different delivery is not
-- three comparable numbers, and sorting them would produce an L1 nobody
-- computed. Everything downstream -- the committee's resolution, the
-- negotiation mandate, the proposal -- rests on that number.
--
-- What this slice adds:
--   procurement_commercial            one row per case: the ranking basis, the
--                                     tax basis the estimate is read on, and
--                                     whether the quotes are still open.
--   procurement_commercial_quotes     one row per bidder: base price, tax,
--                                     freight, other charges, discount, a
--                                     stated loading, and the evaluated cost
--                                     derived from all of them.
--   procurement_quote_lines           one row per bidder per published bill
--                                     line: the rate that firm quoted against
--                                     that line, and nothing else.
--   procurement_commercial_approvals  the head of division's sign-offs, one
--                                     per kind per revision.
--
-- The arithmetic is the point, so none of it is typed. gst_amount,
-- taxable_value and evaluated_cost are generated columns on the quote, and
-- line_amount is a generated column on the schedule line, for the same reason
-- procurement_bidders.bid_amount_gross already is: "did they quote inclusive
-- of tax?" has to be arithmetic rather than an argument three stages later.
--
-- The ranking itself is NOT stored. procurement_commercial_ranking reads the
-- quotes fresh on every call, the same reasoning as
-- procurement_tec_case_consensus and procurement_tender_summary: a stored rank
-- drifts the moment a rate is corrected, and a rank that disagrees with the
-- figures beside it is worse than no rank at all.
--
-- Deliberately not modelled, and listed as limits rather than half-built:
-- currency conversion, customs duty as a head of its own, price escalation,
-- the net present value of payment terms, and spares loading. One stated
-- loading_amount with a mandatory loading_note carries what those would, and
-- says who decided it and why.

-- ===== The desk's own record =====

CREATE TABLE IF NOT EXISTS public.procurement_commercial (
  case_id          UUID PRIMARY KEY REFERENCES public.procurement_cases(id) ON DELETE CASCADE,

  -- Which figure L1 is read off. Recorded rather than assumed: an organisation
  -- that ranks on lowest evaluated cost and one that ranks on a quality-and-
  -- cost score are both doing it properly, and the statement has to say which.
  ranking_basis    TEXT NOT NULL DEFAULT 'evaluated_cost'
                     CHECK (ranking_basis IN ('evaluated_cost', 'base_price', 'weighted_score')),

  quote_status     TEXT NOT NULL DEFAULT 'draft' CHECK (quote_status IN ('draft', 'locked')),
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_commercial ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.procurement_commercial IS
  'One row per case, seeded on arrival at the commercial desk. Readable by anyone who can see the case; writable by the commercial team while the case is actually at that desk and the quotes are not locked behind a comparative statement.';

-- ===== One bidder's commercial reading =====

CREATE TABLE IF NOT EXISTS public.procurement_commercial_quotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised from the bidder and kept by a trigger, because every policy
  -- in this schema is written against case_id.
  case_id               UUID NOT NULL,
  bidder_id             UUID NOT NULL UNIQUE
                          REFERENCES public.procurement_bidders(id) ON DELETE CASCADE,

  base_price            NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  gst_pct               NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (gst_pct BETWEEN 0 AND 100),
  freight               NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (freight >= 0),
  other_charges         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  discount              NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),

  -- The one loading facility, and it has to say what it is for. A number that
  -- moves a firm's evaluated cost without a stated reason is not a loading,
  -- it is a thumb on the scale.
  loading_amount        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (loading_amount >= 0),
  loading_note          TEXT,

  -- Tax is charged on the base price alone, not on freight or other charges.
  gst_amount            NUMERIC(18,2) GENERATED ALWAYS AS
                          (ROUND(base_price * gst_pct / 100.0, 2)) STORED,
  taxable_value         NUMERIC(18,2) GENERATED ALWAYS AS
                          (ROUND(base_price + freight + other_charges - discount, 2)) STORED,
  evaluated_cost        NUMERIC(18,2) GENERATED ALWAYS AS
                          (ROUND(base_price
                                 + ROUND(base_price * gst_pct / 100.0, 2)
                                 + freight + other_charges - discount
                                 + loading_amount, 2)) STORED,

  commercial_compliance TEXT NOT NULL DEFAULT 'pending'
                          CHECK (commercial_compliance IN
                            ('pending', 'compliant', 'conditionally_compliant', 'non_compliant')),

  -- Where base_price came from. 'lines' means the schedule owns it and a
  -- trigger keeps it equal to the line total; the other two mean a person
  -- typed it and the schedule, if there is one, is incomplete.
  price_source          TEXT NOT NULL DEFAULT 'manual'
                          CHECK (price_source IN ('lines', 'manual', 'bid')),
  fully_priced          BOOLEAN NOT NULL DEFAULT false,

  -- What a submitted sheet claimed its own total was, and what did not line up
  -- when it was read. Kept beside the quote rather than in a table of their
  -- own: they are a report about one import, not independently useful facts.
  stated_total          NUMERIC(18,2),
  schedule_issues       JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule_source       TEXT,
  schedule_captured_at  TIMESTAMPTZ,

  remarks               TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Both are written against the base columns: a CHECK cannot reference a
  -- generated column of its own table.
  CONSTRAINT procurement_commercial_quotes_discount_within CHECK (
    discount <= base_price + ROUND(base_price * gst_pct / 100.0, 2) + freight + other_charges),
  CONSTRAINT procurement_commercial_quotes_loading_reasoned CHECK (
    loading_amount = 0 OR COALESCE(btrim(loading_note), '') <> '')
);
ALTER TABLE public.procurement_commercial_quotes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_commercial_quotes_case
  ON public.procurement_commercial_quotes(case_id);

COMMENT ON TABLE public.procurement_commercial_quotes IS
  'One bidder brought to comparable terms. Readable by anyone who can see the case; writable by the commercial team while the case is at the commercial desk and the quotes are not locked.';

-- ===== The item-wise price schedule =====

CREATE TABLE IF NOT EXISTS public.procurement_quote_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL,
  quote_id        UUID NOT NULL REFERENCES public.procurement_commercial_quotes(id) ON DELETE CASCADE,

  -- Deliberately NO foreign key, and the identity denormalised beside it -- the
  -- same reasoning as procurement_tender_items.source_line_id one level up, and
  -- for a sharper reason. procurement_issue_corrigendum amends the published
  -- bill by DELETEing every row for the tender and re-inserting
  -- (20260907090000_procurement_tender.sql:850). An ON DELETE CASCADE here
  -- would take every firm's entire priced schedule with it, silently, the
  -- moment somebody extended a deadline and amended a line -- and the roster
  -- would come back reading as though nobody had ever quoted.
  --
  -- So the schedule survives the amendment and goes stale instead, which is a
  -- state a reader can see and act on. procurement_commercial_gaps reports a
  -- schedule whose lines no longer match the published bill.
  tender_item_id  UUID NOT NULL,
  line_no         INTEGER NOT NULL DEFAULT 0,
  item_name       TEXT NOT NULL DEFAULT '',
  unit            TEXT,

  -- Copied from the published line by a trigger, never accepted from the
  -- caller. A generated column cannot reach into another table, and copying it
  -- makes "the published quantity wins" structural instead of a rule somebody
  -- has to remember while writing an importer.
  quantity        NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_rate       NUMERIC(16,2) CHECK (unit_rate IS NULL OR unit_rate >= 0),

  -- Recorded only when the bidder's own sheet disagreed with the published
  -- bill. Both are evidence of what they sent, not inputs to the arithmetic.
  quoted_quantity NUMERIC(14,3),
  stated_amount   NUMERIC(18,2),

  line_amount     NUMERIC(18,2) GENERATED ALWAYS AS
                    (ROUND(quantity * COALESCE(unit_rate, 0), 2)) STORED,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, tender_item_id)
);
ALTER TABLE public.procurement_quote_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_quote_lines_case
  ON public.procurement_quote_lines(case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_quote_lines_quote
  ON public.procurement_quote_lines(quote_id);
-- The matrix pivots on this: every firm's rate against one published line.
CREATE INDEX IF NOT EXISTS idx_procurement_quote_lines_item
  ON public.procurement_quote_lines(case_id, tender_item_id);

COMMENT ON TABLE public.procurement_quote_lines IS
  'What one firm quoted against one published bill line. Same visibility and the same write window as the quote it hangs off.';

-- ===== The head of division's sign-offs =====

CREATE TABLE IF NOT EXISTS public.procurement_commercial_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('opening', 'statement')),
  -- Keyed on the revision, which is what makes reopening a comparative
  -- statement wipe the sign-offs for free: the new revision simply has no row.
  revision     INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL CHECK (status IN ('approved', 'returned')),
  actor_id     UUID REFERENCES auth.users(id),
  remarks      TEXT,
  signature_id UUID REFERENCES public.procurement_case_signatures(id) ON DELETE SET NULL,
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, kind, revision)
);
ALTER TABLE public.procurement_commercial_approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_commercial_approvals_case
  ON public.procurement_commercial_approvals(case_id);

COMMENT ON TABLE public.procurement_commercial_approvals IS
  'The head of division decisions, one per kind per revision. Read-only to every client: no INSERT, UPDATE or DELETE policy exists at all, and the only writer is the trigger on procurement_case_events that fires when the head of division takes one of their stage actions.';

-- ===== Keeping case_id and the published quantity honest =====

CREATE OR REPLACE FUNCTION public.procurement_commercial_quote_set_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.bidder_id IS DISTINCT FROM OLD.bidder_id THEN
    SELECT b.case_id INTO NEW.case_id
      FROM public.procurement_bidders b
     WHERE b.id = NEW.bidder_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_commercial_quotes_case ON public.procurement_commercial_quotes;
CREATE TRIGGER trg_procurement_commercial_quotes_case
  BEFORE INSERT OR UPDATE ON public.procurement_commercial_quotes
  FOR EACH ROW EXECUTE FUNCTION public.procurement_commercial_quote_set_case();

-- The schedule line takes its case from its quote, and its quantity and
-- identity from the published bill. None of them is a field the caller gets an
-- opinion about: a bidder who quotes against a different quantity than the one
-- published has said something worth recording (quoted_quantity), but they have
-- not changed what is being bought.
--
-- When the published line is gone -- a corrigendum rewrote the bill under this
-- schedule -- the copied identity is left exactly as it was rather than blanked.
-- That is what makes the staleness visible: the row still says which line it was
-- quoting and what that line said at the time, and the gaps list reports that it
-- no longer matches anything published.
CREATE OR REPLACE FUNCTION public.procurement_quote_line_set_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.procurement_tender_items;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    SELECT q.case_id INTO NEW.case_id
      FROM public.procurement_commercial_quotes q
     WHERE q.id = NEW.quote_id;
  END IF;

  SELECT * INTO _item
    FROM public.procurement_tender_items i
   WHERE i.id = NEW.tender_item_id;

  IF FOUND THEN
    NEW.quantity  := _item.quantity;
    NEW.line_no   := _item.line_no;
    NEW.item_name := _item.item_name;
    NEW.unit      := _item.unit;
  ELSIF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'No published bill line % on this tender', NEW.tender_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_quote_lines_context ON public.procurement_quote_lines;
CREATE TRIGGER trg_procurement_quote_lines_context
  BEFORE INSERT OR UPDATE ON public.procurement_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.procurement_quote_line_set_context();

-- ===== The one stored rollup, and why =====

-- base_price and fully_priced are kept equal to the schedule by a trigger,
-- exactly as procurement_sync_case_cost keeps procurement_cases.estimated_cost
-- equal to the bill of quantities. The "a stored rollup drifts" rule this does
-- not break is the one that matters: nothing stored here varies with which
-- rows the reader is allowed to see, and the trigger fires on every write to
-- the lines, so there is no window in which the two disagree.
--
-- Only a schedule with a rate against every published line overrides the
-- figure a person typed. A half-priced schedule is not yet a price.
CREATE OR REPLACE FUNCTION public.procurement_sync_quote_price(_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tender_id UUID;
  _published INTEGER;
  _priced    INTEGER;
  _total     NUMERIC(18,2);
BEGIN
  SELECT t.id INTO _tender_id
    FROM public.procurement_commercial_quotes q
    JOIN public.procurement_bidders b ON b.id = q.bidder_id
    JOIN public.procurement_tenders t ON t.id = b.tender_id
   WHERE q.id = _quote_id;

  SELECT COUNT(*) INTO _published
    FROM public.procurement_tender_items i
   WHERE i.tender_id = _tender_id;

  -- Only lines still matching a published one count. A schedule left stale by a
  -- corrigendum stops being fully priced, which is exactly right: the firm has
  -- not quoted against the bill as it now stands.
  SELECT COUNT(*) FILTER (WHERE l.unit_rate IS NOT NULL),
         COALESCE(SUM(l.line_amount) FILTER (WHERE l.unit_rate IS NOT NULL), 0)
    INTO _priced, _total
    FROM public.procurement_quote_lines l
    JOIN public.procurement_tender_items i ON i.id = l.tender_item_id
   WHERE l.quote_id = _quote_id;

  UPDATE public.procurement_commercial_quotes q
     SET fully_priced = (_published > 0 AND _priced >= _published),
         base_price   = CASE
                          WHEN q.price_source = 'lines'
                           AND _published > 0 AND _priced >= _published THEN _total
                          ELSE q.base_price
                        END,
         updated_at   = now()
   WHERE q.id = _quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_quote_lines_resync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_sync_quote_price(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.quote_id ELSE NEW.quote_id END);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_quote_lines_resync ON public.procurement_quote_lines;
CREATE TRIGGER trg_procurement_quote_lines_resync
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.procurement_quote_lines_resync();

-- ===== updated_at =====

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_commercial',
                           'procurement_commercial_quotes',
                           'procurement_quote_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ===== Row-level security =====
--
-- One FOR ALL rather than separate INSERT/UPDATE/DELETE policies, and always
-- with WITH CHECK: USING alone permits reads and deletes while silently
-- rejecting every insert.
--
-- The stage clause is load-bearing. It is what makes the panel go read-only
-- the moment the case leaves the desk -- and a table with row-level security
-- and no policy that matches does not raise, it changes zero rows and reports
-- success, so the panel has to read the same predicate rather than discover it.

DROP POLICY IF EXISTS "Users can read the commercial record on cases in their remit"
  ON public.procurement_commercial;
CREATE POLICY "Users can read the commercial record on cases in their remit"
  ON public.procurement_commercial FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "The commercial team can keep its record while the case is there"
  ON public.procurement_commercial;
CREATE POLICY "The commercial team can keep its record while the case is there"
  ON public.procurement_commercial FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     WHERE c.id = case_id AND c.case_status = 'open'
       AND c.stage = 'commercial'::procurement_stage
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     WHERE c.id = case_id AND c.case_status = 'open'
       AND c.stage = 'commercial'::procurement_stage
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

DROP POLICY IF EXISTS "Users can read commercial quotes on cases in their remit"
  ON public.procurement_commercial_quotes;
CREATE POLICY "Users can read commercial quotes on cases in their remit"
  ON public.procurement_commercial_quotes FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "The commercial team can price bids while the case is there"
  ON public.procurement_commercial_quotes;
-- Qualifying `case_id` as procurement_commercial_quotes.case_id is not
-- decoration: procurement_commercial also has a column named case_id, and an
-- unqualified reference inside this EXISTS resolves to the innermost scope --
-- m.case_id, not the outer row under test. Written the unqualified way, the
-- predicate stops checking anything about the specific row being read or
-- written and instead asks only "does some open, draft, commercial-stage case
-- exist anywhere" -- true for the whole table the moment one case is at that
-- desk. This is exactly the class of RLS bug PROCUREMENT.md warns to assert
-- against with a row count, not an error: the write does not fail, it
-- silently succeeds on rows it should never have matched.
CREATE POLICY "The commercial team can price bids while the case is there"
  ON public.procurement_commercial_quotes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     JOIN public.procurement_commercial m ON m.case_id = c.id
     WHERE c.id = procurement_commercial_quotes.case_id AND c.case_status = 'open'
       AND c.stage = 'commercial'::procurement_stage
       AND m.quote_status = 'draft'
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_cases c
     JOIN public.procurement_commercial m ON m.case_id = c.id
     WHERE c.id = procurement_commercial_quotes.case_id AND c.case_status = 'open'
       AND c.stage = 'commercial'::procurement_stage
       AND m.quote_status = 'draft'
       AND (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
            OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

DROP POLICY IF EXISTS "Users can read priced lines on cases in their remit"
  ON public.procurement_quote_lines;
CREATE POLICY "Users can read priced lines on cases in their remit"
  ON public.procurement_quote_lines FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- No FOR ALL policy on procurement_quote_lines, deliberately. Every rate goes
-- through procurement_record_quote_schedule, because the matching rules and
-- the six issue codes have to run on every write -- a plain UPDATE ... SET
-- unit_rate would leave the issues describing a schedule that no longer
-- exists, and the panel would show a clean import over a broken one.

-- Nor on procurement_commercial_approvals. Its only writer is the trigger on
-- procurement_case_events, below.
DROP POLICY IF EXISTS "Users can read commercial approvals on cases in their remit"
  ON public.procurement_commercial_approvals;
CREATE POLICY "Users can read commercial approvals on cases in their remit"
  ON public.procurement_commercial_approvals FOR SELECT TO authenticated
  USING (public.procurement_can_view_case(auth.uid(), case_id));

-- ===== The desk assertion every write shares =====

CREATE OR REPLACE FUNCTION public.procurement_commercial_assert_open(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case   public.procurement_cases;
  _status TEXT;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF _case.stage <> 'commercial'::procurement_stage OR _case.case_status <> 'open' THEN
    RAISE EXCEPTION 'This case is not at the commercial evaluation desk'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT quote_status INTO _status
    FROM public.procurement_commercial WHERE case_id = _case_id;
  IF _status = 'locked' THEN
    RAISE EXCEPTION 'The priced bids are locked behind a comparative statement; reopen it for correction first'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_commercial_assert_may_price(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_commercial_assert_open(_case_id);
  IF NOT (public.has_procurement_permission(auth.uid(), 'commercial.evaluate')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold commercial.evaluate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ===== One bidder's commercial reading =====

CREATE OR REPLACE FUNCTION public.procurement_save_quote(
  _bidder_id             UUID,
  _base_price            NUMERIC DEFAULT NULL,
  _gst_pct               NUMERIC DEFAULT NULL,
  _freight               NUMERIC DEFAULT 0,
  _other_charges         NUMERIC DEFAULT 0,
  _discount              NUMERIC DEFAULT 0,
  _loading_amount        NUMERIC DEFAULT 0,
  _loading_note          TEXT    DEFAULT NULL,
  _commercial_compliance TEXT    DEFAULT 'pending',
  _price_source          TEXT    DEFAULT 'manual',
  _remarks               TEXT    DEFAULT NULL
)
RETURNS public.procurement_commercial_quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case_id     UUID;
  _vendor_name TEXT;
  _bid_amount  NUMERIC;
  _bid_gst     NUMERIC;
  _row         public.procurement_commercial_quotes;
BEGIN
  SELECT b.case_id, v.name, b.bid_amount, b.gst_pct
    INTO _case_id, _vendor_name, _bid_amount, _bid_gst
    FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.id = _bidder_id;

  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No such bidder' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_commercial_assert_may_price(_case_id);

  INSERT INTO public.procurement_commercial_quotes AS q
    (bidder_id, base_price, gst_pct, freight, other_charges, discount,
     loading_amount, loading_note, commercial_compliance, price_source,
     remarks, created_by)
  VALUES
    (_bidder_id,
     -- Nothing typed, nothing on file: fall back to what the tender desk
     -- recorded, so a lump-sum bid is comparable without being retyped.
     COALESCE(_base_price, _bid_amount, 0),
     COALESCE(_gst_pct, _bid_gst, 0),
     COALESCE(_freight, 0), COALESCE(_other_charges, 0), COALESCE(_discount, 0),
     COALESCE(_loading_amount, 0), NULLIF(btrim(COALESCE(_loading_note, '')), ''),
     COALESCE(_commercial_compliance, 'pending'),
     COALESCE(_price_source, 'manual'),
     _remarks, auth.uid())
  ON CONFLICT (bidder_id) DO UPDATE SET
     base_price            = COALESCE(_base_price, q.base_price),
     gst_pct               = COALESCE(_gst_pct, q.gst_pct),
     freight               = COALESCE(_freight, q.freight),
     other_charges         = COALESCE(_other_charges, q.other_charges),
     discount              = COALESCE(_discount, q.discount),
     loading_amount        = COALESCE(_loading_amount, q.loading_amount),
     loading_note          = NULLIF(btrim(COALESCE(_loading_note, '')), ''),
     commercial_compliance = COALESCE(_commercial_compliance, q.commercial_compliance),
     price_source          = COALESCE(_price_source, q.price_source),
     remarks               = COALESCE(_remarks, q.remarks),
     updated_at            = now()
  RETURNING * INTO _row;

  -- A change of price_source can hand the base price to the schedule or take
  -- it back, so the rollup is re-run rather than assumed.
  PERFORM public.procurement_sync_quote_price(_row.id);
  SELECT * INTO _row FROM public.procurement_commercial_quotes WHERE id = _row.id;

  PERFORM public.procurement_log_event(
    _case_id, 'commercial', 'commercial.quote_saved',
    _vendor_name || ' priced at ' || to_char(_row.evaluated_cost, 'FM999,999,999,990.00'),
    jsonb_build_object('bidder_id', _bidder_id, 'evaluated_cost', _row.evaluated_cost,
                       'compliance', _row.commercial_compliance));

  RETURN _row;
END;
$$;

-- ===== Reading a price schedule onto the published bill =====
--
-- A schedule is submitted whole and rebuilt whole. Merging row by row is what
-- lets a stale issue survive a corrected import and describe a sheet that is
-- no longer on file.
--
-- Seven things can be wrong with a sheet, and all seven are recorded rather
-- than raised: an import that refused outright would leave the officer with a
-- spreadsheet, an error, and no way to see which of two hundred lines caused
-- it. Two are errors and stop the case leaving the desk; five are warnings
-- that a reader should see and may accept.
--
--   unmatched_row      priced something that is not on the published bill
--   missing_line       a published line the sheet never mentioned      (error)
--   missing_rate       mentioned, but with no rate against it          (error)
--   quantity_mismatch  quoted a different quantity -- published wins
--   amount_mismatch    stated an amount that is not quantity x rate -- the
--                      arithmetic wins, because line_amount is generated
--   duplicate_line     priced the same line twice -- the later row wins
--   total_mismatch     the sheet's own grand total is not its lines, beyond a
--                      rupee of rounding
CREATE OR REPLACE FUNCTION public.procurement_record_quote_schedule(
  _quote_id     UUID,
  _lines        JSONB,
  _source       TEXT    DEFAULT 'manual',
  _stated_total NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case_id     UUID;
  _tender_id   UUID;
  _vendor_name TEXT;
  _issues      JSONB := '[]'::jsonb;
  _el          JSONB;
  _row_no      INTEGER := 0;
  _submitted   INTEGER;
  _item_id     UUID;
  _item_qty    NUMERIC(14,3);
  _matched     UUID[] := ARRAY[]::UUID[];
  _name        TEXT;
  _rate        NUMERIC;
  _qty         NUMERIC;
  _amount      NUMERIC;
  _computed    NUMERIC;
  _total       NUMERIC;
  _missing     RECORD;
BEGIN
  SELECT q.case_id, b.tender_id, v.name
    INTO _case_id, _tender_id, _vendor_name
    FROM public.procurement_commercial_quotes q
    JOIN public.procurement_bidders b ON b.id = q.bidder_id
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE q.id = _quote_id;

  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'No such quote' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_commercial_assert_may_price(_case_id);

  _submitted := jsonb_array_length(COALESCE(_lines, '[]'::jsonb));

  DELETE FROM public.procurement_quote_lines WHERE quote_id = _quote_id;

  FOR _el IN SELECT value FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    _row_no  := _row_no + 1;
    _item_id := NULL;
    _name    := btrim(COALESCE(_el ->> 'item_name', ''));

    -- Four passes, narrowest first: the line's own id, its published number,
    -- its exact name, then containment either way round with both sides at
    -- least four characters -- short enough and "kit" matches nine lines.
    IF NULLIF(_el ->> 'tender_item_id', '') IS NOT NULL THEN
      SELECT i.id, i.quantity INTO _item_id, _item_qty
        FROM public.procurement_tender_items i
       WHERE i.tender_id = _tender_id AND i.id = (_el ->> 'tender_item_id')::uuid;
    END IF;

    IF _item_id IS NULL AND NULLIF(_el ->> 'line_no', '') IS NOT NULL THEN
      SELECT i.id, i.quantity INTO _item_id, _item_qty
        FROM public.procurement_tender_items i
       WHERE i.tender_id = _tender_id AND i.line_no = (_el ->> 'line_no')::integer;
    END IF;

    IF _item_id IS NULL AND _name <> '' THEN
      SELECT i.id, i.quantity INTO _item_id, _item_qty
        FROM public.procurement_tender_items i
       WHERE i.tender_id = _tender_id
         AND lower(btrim(i.item_name)) = lower(_name)
       ORDER BY i.line_no LIMIT 1;
    END IF;

    IF _item_id IS NULL AND length(_name) >= 4 THEN
      SELECT i.id, i.quantity INTO _item_id, _item_qty
        FROM public.procurement_tender_items i
       WHERE i.tender_id = _tender_id
         AND length(btrim(i.item_name)) >= 4
         AND (lower(btrim(i.item_name)) LIKE '%' || lower(_name) || '%'
              OR lower(_name) LIKE '%' || lower(btrim(i.item_name)) || '%')
       ORDER BY i.line_no LIMIT 1;
    END IF;

    IF _item_id IS NULL THEN
      _issues := _issues || jsonb_build_object(
        'code', 'unmatched_row', 'severity', 'warning', 'row', _row_no,
        'detail', COALESCE(NULLIF(_name, ''), 'Row ' || _row_no)
                  || ' does not match anything on the published bill');
      CONTINUE;
    END IF;

    IF _item_id = ANY (_matched) THEN
      _issues := _issues || jsonb_build_object(
        'code', 'duplicate_line', 'severity', 'warning', 'row', _row_no,
        'tender_item_id', _item_id,
        'detail', _name || ' was priced more than once; the later row was kept');
    END IF;

    _rate   := NULLIF(_el ->> 'unit_rate', '')::numeric;
    _qty    := NULLIF(_el ->> 'quantity', '')::numeric;
    _amount := NULLIF(_el ->> 'amount', '')::numeric;

    -- A sheet that gives a line total and no rate has still priced the line.
    IF _rate IS NULL AND _amount IS NOT NULL AND _item_qty > 0 THEN
      _rate := ROUND(_amount / _item_qty, 2);
    END IF;

    IF _rate IS NULL THEN
      _issues := _issues || jsonb_build_object(
        'code', 'missing_rate', 'severity', 'error', 'row', _row_no,
        'tender_item_id', _item_id,
        'detail', 'No rate against ' || COALESCE(NULLIF(_name, ''), 'row ' || _row_no));
    END IF;

    IF _qty IS NOT NULL AND _qty <> _item_qty THEN
      _issues := _issues || jsonb_build_object(
        'code', 'quantity_mismatch', 'severity', 'warning', 'row', _row_no,
        'tender_item_id', _item_id,
        'detail', 'Quoted for ' || _qty || ' against a published ' || _item_qty
                  || '; the published quantity was used');
    END IF;

    _computed := ROUND(_item_qty * COALESCE(_rate, 0), 2);
    IF _amount IS NOT NULL AND ROUND(_amount, 2) <> _computed THEN
      _issues := _issues || jsonb_build_object(
        'code', 'amount_mismatch', 'severity', 'warning', 'row', _row_no,
        'tender_item_id', _item_id,
        'detail', 'Stated ' || ROUND(_amount, 2) || ' against a computed ' || _computed
                  || '; the arithmetic was used');
    END IF;

    INSERT INTO public.procurement_quote_lines
      (quote_id, tender_item_id, unit_rate, quoted_quantity, stated_amount)
    VALUES
      (_quote_id, _item_id, _rate,
       CASE WHEN _qty IS NOT NULL AND _qty <> _item_qty THEN _qty END,
       CASE WHEN _amount IS NOT NULL AND ROUND(_amount, 2) <> _computed THEN _amount END)
    ON CONFLICT (quote_id, tender_item_id) DO UPDATE SET
       unit_rate       = EXCLUDED.unit_rate,
       quoted_quantity = EXCLUDED.quoted_quantity,
       stated_amount   = EXCLUDED.stated_amount,
       updated_at      = now();

    _matched := _matched || _item_id;
  END LOOP;

  -- Only when the sheet attempted a schedule at all. A lump-sum bid with no
  -- price breakdown is a legitimate thing to record, and answering it with one
  -- error per published line would bury the real ones.
  IF _submitted > 0 THEN
    FOR _missing IN
      SELECT i.line_no, i.item_name
        FROM public.procurement_tender_items i
       WHERE i.tender_id = _tender_id
         AND NOT (i.id = ANY (_matched))
       ORDER BY i.line_no
    LOOP
      _issues := _issues || jsonb_build_object(
        'code', 'missing_line', 'severity', 'error', 'line_no', _missing.line_no,
        'detail', 'Line ' || _missing.line_no || ', ' || _missing.item_name
                  || ', was not priced');
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(line_amount), 0) INTO _total
    FROM public.procurement_quote_lines WHERE quote_id = _quote_id;

  -- A rupee of tolerance: a sheet that rounds each line and then sums is not
  -- wrong, and flagging it would train the reader to ignore the column.
  IF _stated_total IS NOT NULL AND abs(_stated_total - _total) > 1 THEN
    _issues := _issues || jsonb_build_object(
      'code', 'total_mismatch', 'severity', 'warning',
      'detail', 'The sheet totals ' || _stated_total || ' against ' || _total
                || ' from its own lines');
  END IF;

  UPDATE public.procurement_commercial_quotes
     SET schedule_issues      = _issues,
         schedule_source      = _source,
         schedule_captured_at = now(),
         stated_total         = _stated_total,
         price_source         = CASE WHEN _submitted > 0 THEN 'lines' ELSE price_source END,
         updated_at           = now()
   WHERE id = _quote_id;

  PERFORM public.procurement_sync_quote_price(_quote_id);

  PERFORM public.procurement_log_event(
    _case_id, 'commercial', 'commercial.schedule_recorded',
    _vendor_name || ': ' || cardinality(_matched) || ' of '
      || (SELECT COUNT(*) FROM public.procurement_tender_items WHERE tender_id = _tender_id)
      || ' published lines priced',
    jsonb_build_object('quote_id', _quote_id, 'source', _source,
                       'issue_count', jsonb_array_length(_issues)));

  RETURN _issues;
END;
$$;

-- ===== The basis L1 is read off =====

-- An event, not a field edit: changing it changes who is L1, and a reader of
-- the statement has to be able to see that somebody chose it and when.
CREATE OR REPLACE FUNCTION public.procurement_set_ranking_basis(_case_id UUID, _basis TEXT)
RETURNS public.procurement_commercial
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.procurement_commercial;
BEGIN
  PERFORM public.procurement_commercial_assert_may_price(_case_id);

  IF _basis NOT IN ('evaluated_cost', 'base_price', 'weighted_score') THEN
    RAISE EXCEPTION 'Unknown ranking basis "%"', _basis USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.procurement_commercial
     SET ranking_basis = _basis, updated_at = now()
   WHERE case_id = _case_id
  RETURNING * INTO _row;

  PERFORM public.procurement_log_event(
    _case_id, 'commercial', 'commercial.basis_changed',
    'Bids are now ranked on ' || replace(_basis, '_', ' '),
    jsonb_build_object('ranking_basis', _basis));

  RETURN _row;
END;
$$;

-- ===== The ranking, computed on read =====
--
-- Never stored. A stored rank drifts the moment a rate is corrected, and a
-- rank sitting beside figures that no longer produce it is worse than no rank
-- at all -- the same reasoning as procurement_tec_case_consensus and
-- procurement_tender_summary.
--
-- The weighted score is written here and in exactly one other place in this
-- product: nowhere. It reads procurement_bidders.delivery_days and
-- warranty_months, which are already integers, so nothing parses a delivery
-- period out of prose to decide a rank.
CREATE OR REPLACE FUNCTION public.procurement_commercial_ranking(_case_id UUID)
RETURNS TABLE (
  bidder_id             UUID,
  vendor_id             UUID,
  vendor_name           TEXT,
  base_price            NUMERIC,
  gst_pct               NUMERIC,
  gst_amount            NUMERIC,
  freight               NUMERIC,
  other_charges         NUMERIC,
  discount              NUMERIC,
  loading_amount        NUMERIC,
  loading_note          TEXT,
  taxable_value         NUMERIC,
  evaluated_cost        NUMERIC,
  delivery_days         INTEGER,
  warranty_months       INTEGER,
  payment_terms         TEXT,
  commercial_compliance TEXT,
  tec_qualified         BOOLEAN,
  fully_priced          BOOLEAN,
  price_source          TEXT,
  price_score           NUMERIC,
  delivery_score        NUMERIC,
  warranty_score        NUMERIC,
  weighted_score        NUMERIC,
  eligible              BOOLEAN,
  ineligible_reason     TEXT,
  rank                  INTEGER,
  is_l1                 BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _basis TEXT;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RETURN;
  END IF;

  SELECT m.ranking_basis INTO _basis
    FROM public.procurement_commercial m WHERE m.case_id = _case_id;
  _basis := COALESCE(_basis, 'evaluated_cost');

  RETURN QUERY
  WITH base AS (
    SELECT
      b.id AS bidder_id, b.vendor_id, v.name AS vendor_name,
      COALESCE(q.base_price, 0)     AS base_price,
      COALESCE(q.gst_pct, 0)        AS gst_pct,
      COALESCE(q.gst_amount, 0)     AS gst_amount,
      COALESCE(q.freight, 0)        AS freight,
      COALESCE(q.other_charges, 0)  AS other_charges,
      COALESCE(q.discount, 0)       AS discount,
      COALESCE(q.loading_amount, 0) AS loading_amount,
      q.loading_note,
      COALESCE(q.taxable_value, 0)  AS taxable_value,
      COALESCE(q.evaluated_cost, 0) AS evaluated_cost,
      b.delivery_days, b.warranty_months, b.payment_terms,
      COALESCE(q.commercial_compliance, 'pending') AS commercial_compliance,
      b.tec_qualified,
      COALESCE(q.fully_priced, false) AS fully_priced,
      COALESCE(q.price_source, 'manual') AS price_source,
      CASE
        WHEN b.status <> 'received' THEN 'The bid was ' || b.status
        -- IS FALSE, not "IS NOT TRUE". A case that came here through
        -- tender.to_commercial never saw the technical committee, so every
        -- tec_qualified is NULL -- reading that as a disqualification would
        -- make the whole route unusable.
        WHEN b.tec_qualified IS FALSE THEN 'Not technically qualified'
        WHEN q.id IS NULL OR COALESCE(q.evaluated_cost, 0) <= 0 THEN 'No price on file'
        WHEN q.price_source = 'lines' AND NOT q.fully_priced
          THEN 'The price schedule is incomplete'
        WHEN q.commercial_compliance = 'pending'
          THEN 'Commercial compliance not yet decided'
        WHEN q.commercial_compliance = 'non_compliant' THEN 'Commercially non-compliant'
      END AS ineligible_reason
    FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
    LEFT JOIN public.procurement_commercial_quotes q ON q.bidder_id = b.id
    WHERE b.case_id = _case_id
  ),
  bounds AS (
    SELECT MIN(x.evaluated_cost) AS min_cost,
           MIN(x.delivery_days)  AS min_days,
           MAX(x.warranty_months) AS max_warranty
      FROM base x WHERE x.ineligible_reason IS NULL
  ),
  scored AS (
    SELECT x.*,
      CASE WHEN x.ineligible_reason IS NULL AND x.evaluated_cost > 0 AND bo.min_cost IS NOT NULL
           THEN ROUND(100.0 * bo.min_cost / x.evaluated_cost, 2) END AS price_score,
      CASE WHEN x.ineligible_reason IS NULL AND x.delivery_days > 0 AND bo.min_days IS NOT NULL
           THEN ROUND(100.0 * bo.min_days / x.delivery_days, 2) END AS delivery_score,
      CASE WHEN x.ineligible_reason IS NULL AND COALESCE(bo.max_warranty, 0) > 0
           THEN ROUND(100.0 * COALESCE(x.warranty_months, 0) / bo.max_warranty, 2) END AS warranty_score
      FROM base x CROSS JOIN bounds bo
  ),
  weighted AS (
    SELECT s.*,
      CASE WHEN s.ineligible_reason IS NULL THEN
        ROUND(0.50 * COALESCE(s.price_score, 0)
            + 0.25 * COALESCE(s.delivery_score, 0)
            + 0.25 * COALESCE(s.warranty_score, 0), 2)
      END AS weighted_score
      FROM scored s
  ),
  ranked AS (
    SELECT w.*,
      CASE WHEN w.ineligible_reason IS NULL THEN
        RANK() OVER (
          PARTITION BY (w.ineligible_reason IS NULL)
          ORDER BY
            CASE _basis
              WHEN 'base_price'     THEN w.base_price
              WHEN 'weighted_score' THEN -COALESCE(w.weighted_score, 0)
              ELSE w.evaluated_cost
            END,
            w.delivery_days ASC NULLS LAST,
            w.vendor_name)
      ELSE 0 END::INTEGER AS rnk
      FROM weighted w
  )
  SELECT r.bidder_id, r.vendor_id, r.vendor_name,
         r.base_price, r.gst_pct, r.gst_amount, r.freight, r.other_charges,
         r.discount, r.loading_amount, r.loading_note,
         r.taxable_value, r.evaluated_cost,
         r.delivery_days, r.warranty_months, r.payment_terms,
         r.commercial_compliance, r.tec_qualified,
         r.fully_priced, r.price_source,
         r.price_score, r.delivery_score, r.warranty_score, r.weighted_score,
         (r.ineligible_reason IS NULL), r.ineligible_reason,
         r.rnk, (r.rnk = 1)
    FROM ranked r
   ORDER BY (r.rnk = 0), r.rnk, r.vendor_name;
END;
$$;

-- ===== The cross-bidder matrix =====
--
-- Long form: one row per published line per ranking-eligible firm. The panel
-- pivots it. Item-wise L1 falls out of line_rank = 1, and is advisory -- a
-- split award across firms is a decision this slice does not offer, only the
-- evidence for one.
CREATE OR REPLACE FUNCTION public.procurement_commercial_line_comparison(_case_id UUID)
RETURNS TABLE (
  tender_item_id   UUID,
  line_no          INTEGER,
  item_name        TEXT,
  unit             TEXT,
  quantity         NUMERIC,
  estimated_rate   NUMERIC,
  estimated_amount NUMERIC,
  bidder_id        UUID,
  vendor_name      TEXT,
  unit_rate        NUMERIC,
  line_amount      NUMERIC,
  line_rank        INTEGER,
  is_line_l1       BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT r.bidder_id, r.vendor_name
      FROM public.procurement_commercial_ranking(_case_id) r
     WHERE r.eligible
  ),
  cells AS (
    SELECT i.id AS tender_item_id, i.line_no, i.item_name, i.unit,
           i.quantity, i.estimated_rate, i.line_amount AS estimated_amount,
           e.bidder_id, e.vendor_name,
           l.unit_rate, l.line_amount,
           CASE WHEN l.unit_rate IS NOT NULL THEN
             RANK() OVER (PARTITION BY i.id, (l.unit_rate IS NOT NULL)
                          ORDER BY l.unit_rate, e.vendor_name)
           ELSE 0 END::INTEGER AS line_rank
      FROM public.procurement_tender_items i
      JOIN public.procurement_tenders t ON t.id = i.tender_id
      CROSS JOIN eligible e
      LEFT JOIN public.procurement_commercial_quotes q ON q.bidder_id = e.bidder_id
      LEFT JOIN public.procurement_quote_lines l
             ON l.quote_id = q.id AND l.tender_item_id = i.id
     WHERE t.case_id = _case_id
  )
  SELECT c.tender_item_id, c.line_no, c.item_name, c.unit,
         c.quantity, c.estimated_rate, c.estimated_amount,
         c.bidder_id, c.vendor_name, c.unit_rate, c.line_amount,
         c.line_rank, (c.line_rank = 1)
    FROM cells c
   ORDER BY c.line_no, c.line_rank = 0, c.line_rank, c.vendor_name;
END;
$$;

-- ===== Is the recommended price reasonable? =====
--
-- One check, and it is the only one this product can honestly make: the
-- evaluated cost against the estimate the bidders actually quoted against.
--
-- That estimate is procurement_tenders.estimated_value, stamped from the
-- published bill at floating and frozen there -- not procurement_cases
-- .estimated_cost, which follows the requisition and can still move. The
-- tender also carries its own gst_pct, so the comparison is like for like
-- without anybody being asked to state a tax basis by hand.
--
-- There is no last-purchase price and no market-rate benchmark here, and
-- nothing in this schema could supply one. Said plainly so that a reader does
-- not assume "reasonable" means more than it does.
CREATE OR REPLACE FUNCTION public.procurement_commercial_reasonableness(_case_id UUID)
RETURNS TABLE (
  estimate           NUMERIC,
  estimate_source    TEXT,
  estimate_gst_pct   NUMERIC,
  estimate_inclusive NUMERIC,
  l1_bidder_id       UUID,
  l1_vendor_name     TEXT,
  l1_cost            NUMERIC,
  variance           NUMERIC,
  variance_pct       NUMERIC,
  status             TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _est     NUMERIC;
  _src     TEXT;
  _gst     NUMERIC;
  _incl    NUMERIC;
  _l1_id   UUID;
  _l1_name TEXT;
  _l1_cost NUMERIC;
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RETURN;
  END IF;

  SELECT t.estimated_value, t.gst_pct INTO _est, _gst
    FROM public.procurement_tenders t WHERE t.case_id = _case_id;

  IF _est IS NOT NULL AND _est > 0 THEN
    _src := 'tender';
  ELSE
    SELECT c.estimated_cost INTO _est FROM public.procurement_cases c WHERE c.id = _case_id;
    _gst := 0;
    _src := CASE WHEN COALESCE(_est, 0) > 0 THEN 'requisition' ELSE 'none' END;
  END IF;

  _incl := CASE WHEN COALESCE(_est, 0) > 0
                THEN ROUND(_est * (1 + COALESCE(_gst, 0) / 100.0), 2) END;

  SELECT r.bidder_id, r.vendor_name, r.evaluated_cost
    INTO _l1_id, _l1_name, _l1_cost
    FROM public.procurement_commercial_ranking(_case_id) r
   WHERE r.is_l1 LIMIT 1;

  RETURN QUERY SELECT
    _est, _src, _gst, _incl, _l1_id, _l1_name, _l1_cost,
    CASE WHEN _incl IS NOT NULL AND _l1_cost IS NOT NULL THEN ROUND(_l1_cost - _incl, 2) END,
    CASE WHEN _incl IS NOT NULL AND _incl > 0 AND _l1_cost IS NOT NULL
         THEN ROUND(100.0 * (_l1_cost - _incl) / _incl, 2) END,
    CASE WHEN _incl IS NULL OR _l1_cost IS NULL THEN 'no_estimate'
         WHEN _l1_cost > _incl THEN 'over'
         ELSE 'within' END;
END;
$$;

-- ===== The gate out of the desk =====
--
-- Noun phrases, because procurement_record_decision renders them as
--   "Draw up the comparative statement" still needs: A; B; C
CREATE OR REPLACE FUNCTION public.procurement_commercial_gaps(_case_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rev  INTEGER;
  _gaps TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT m.revision INTO _rev
    FROM public.procurement_commercial m WHERE m.case_id = _case_id;

  IF _rev IS NULL THEN
    RETURN ARRAY['A commercial record on this case'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals a
     WHERE a.case_id = _case_id AND a.kind = 'opening'
       AND a.revision = _rev AND a.status = 'approved')
  THEN
    _gaps := array_append(_gaps, 'The head of division to approve opening the commercial bids');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_commercial_ranking(_case_id) r WHERE r.eligible)
  THEN
    _gaps := array_append(_gaps, 'At least one priced bid that can be ranked');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_bidders b
      LEFT JOIN public.procurement_commercial_quotes q ON q.bidder_id = b.id
     WHERE b.case_id = _case_id AND b.status = 'received'
       AND COALESCE(q.commercial_compliance, 'pending') = 'pending')
  THEN
    _gaps := array_append(_gaps, 'A commercial compliance call on every bid received');
  END IF;

  -- A corrigendum rewrote the published bill under a schedule somebody had
  -- already priced. The rates survived (there is no foreign key, on purpose)
  -- but they are answers to a question that has changed.
  IF EXISTS (
    SELECT 1 FROM public.procurement_quote_lines l
      LEFT JOIN public.procurement_tender_items i ON i.id = l.tender_item_id
     WHERE l.case_id = _case_id AND i.id IS NULL)
  THEN
    _gaps := array_append(_gaps, 'A price schedule read against the bill as it now stands, since a corrigendum changed it');
  END IF;

  RETURN _gaps;
END;
$$;

-- (uuid, jsonb). The engine resolves a guard with to_regprocedure and skips it
-- in silence if the arity does not match, so the assertion at the foot of this
-- file exists to make a typo here loud instead of permissive.
CREATE OR REPLACE FUNCTION public.procurement_guard_commercial_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(public.procurement_commercial_gaps(_case_id), 1), 0) = 0;
$$;

-- ===== Seeding the desk on arrival =====
--
-- Idempotent, and it never overwrites. The reference this process was studied
-- from repairs its record on every read -- advancing stuck cases, seeding zero
-- quotes from bid amounts, assuming a flat 18% tax while it does so -- which
-- makes a read a write and makes the data depend on who looked at it last.
-- Nothing here does that: arrival is an event, it seeds once, and a read is a
-- read.
CREATE OR REPLACE FUNCTION public.procurement_commercial_seed(_case_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.procurement_commercial (case_id)
  VALUES (_case_id)
  ON CONFLICT (case_id) DO NOTHING;

  -- One quote per firm that actually bid, carrying across what the tender desk
  -- already recorded so a lump-sum bid is comparable without being retyped.
  -- price_source 'bid' says where the figure came from; pricing it line by line
  -- later moves it to 'lines'.
  INSERT INTO public.procurement_commercial_quotes
    (bidder_id, base_price, gst_pct, price_source)
  SELECT b.id, COALESCE(b.bid_amount, 0), COALESCE(b.gst_pct, 0), 'bid'
    FROM public.procurement_bidders b
   WHERE b.case_id = _case_id AND b.status = 'received'
  ON CONFLICT (bidder_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_commercial_seed_on_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.procurement_commercial_seed(NEW.id);
  RETURN NULL;
END;
$$;

-- AFTER UPDATE OF stage on the case, because procurement_advance_stage is the
-- only thing that writes cases.stage -- so this catches every route in,
-- including tec.recommend, tender.to_commercial, a dpc.return, and an
-- administrator moving a case by hand.
DROP TRIGGER IF EXISTS trg_procurement_cases_commercial_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_commercial_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW
  WHEN (NEW.stage = 'commercial'::procurement_stage AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.procurement_commercial_seed_on_entry();

-- A case already sitting at the desk did not fire the trigger above and should
-- not have to bounce out and back in to get a record.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases
            WHERE stage = 'commercial'::procurement_stage LOOP
    PERFORM public.procurement_commercial_seed(c.id);
  END LOOP;
END $$;

-- ===== Turning the head of division's decision into an approval =====
--
-- The one unusual mechanism in this slice, so it is worth saying why plainly.
--
-- The head of division holds commercial.opening.approve and, until now, had
-- nothing to press at either of their own stages: an empty action bar, which
-- reads exactly like a broken one. Their sign-offs are therefore ordinary
-- stage actions, so the action bar and procurement_my_worklist surface them
-- with no new concept to learn.
--
-- But a holding action never moves the case, so there is no stage update for
-- an AFTER UPDATE OF stage trigger to catch, and procurement_record_decision
-- writes no arbitrary tables. The audit event is the one thing every decision
-- passes through, so that is the hook -- the same "catch it at the single
-- chokepoint" reasoning as procurement_tender_close_on_exit.
--
-- A future action code for this role has to be added to the WHEN clause below,
-- or it will record an event and no approval.
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

  _kind   := CASE WHEN NEW.action LIKE 'commercial.opening%' THEN 'opening' ELSE 'statement' END;
  _status := CASE WHEN NEW.action IN ('commercial.opening_approve', 'cst.signoff')
                  THEN 'approved' ELSE 'returned' END;

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
                       'cst.signoff', 'cst.signoff_return'))
  EXECUTE FUNCTION public.procurement_commercial_approval_from_event();

-- ===== Stage actions =====
--
-- Both hold the case: the head of division decides whether the bids may be
-- opened, they do not move the case anywhere. The entry status is what the
-- case then says, which needs the holding-action branch added to the engine in
-- 20260910080000_procurement_holding_status.sql -- without it these two record
-- an event and change nothing a reader can see.
INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status,
   requires_remarks, requires_signature, chair_only, sort_order) VALUES
  ('commercial.opening_approve', 'commercial', 'approve',
   'Approve opening of the commercial bids',
   'Clears the commercial team to open and price the bids. Recorded against this revision of the statement.',
   'commercial.opening.approve', NULL, 'Commercial bids may be opened',
   false, false, false, 5),
  ('commercial.opening_return', 'commercial', 'request_clarification',
   'Return the opening format',
   'Holds the case and asks the commercial team for a correction before the bids are opened.',
   'commercial.opening.approve', NULL, 'Opening format returned',
   true, false, false, 25)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  permission = EXCLUDED.permission, target_stage = EXCLUDED.target_stage,
  entry_status = EXCLUDED.entry_status, requires_remarks = EXCLUDED.requires_remarks,
  sort_order = EXCLUDED.sort_order;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_commercial_ready',
       gaps_function  = 'public.procurement_commercial_gaps',
       requires_remarks = true
 WHERE code = 'commercial.to_cst';

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_commercial_assert_open(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_assert_may_price(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_quote(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_record_quote_schedule(UUID, JSONB, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_set_ranking_basis(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_ranking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_line_comparison(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_reasonableness(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_commercial_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_guard_commercial_ready(UUID, JSONB) TO authenticated;

-- ===== The assertion that makes a wrong arity loud =====
--
-- procurement_record_decision resolves a guard with
--   to_regprocedure(guard || '(uuid,jsonb)')
-- and, when that comes back NULL, does not call it and does not complain -- so
-- a guard with a mistyped name or the wrong argument list leaves the gate wide
-- open and silent. PROCUREMENT.md has listed that as a hazard since the tender
-- slice; this is the first migration to actually check it.
DO $$
BEGIN
  IF to_regprocedure('public.procurement_guard_commercial_ready(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'procurement_guard_commercial_ready is not resolvable as (uuid,jsonb); the gate would be skipped in silence';
  END IF;
  IF to_regprocedure('public.procurement_commercial_gaps(uuid)') IS NULL THEN
    RAISE EXCEPTION 'procurement_commercial_gaps is not resolvable as (uuid); refusals would not name the gaps';
  END IF;
END $$;
