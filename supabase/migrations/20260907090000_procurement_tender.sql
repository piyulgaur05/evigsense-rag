-- Procurement, slice 4: the tender.
--
-- Until now the tender stage was a label. A case arrived from finance, somebody
-- pressed "Hand off for technical evaluation", and the committee received a
-- case that said nothing about what had been floated, to whom, on what terms,
-- or who had bid. This slice gives the stage its record.
--
-- What it deliberately does not do: rank bids. A bidder here carries one
-- amount, not priced lines, and nothing in this file computes a lowest
-- evaluated bidder. That is the comparative statement's job and it needs the
-- technical evaluation first.
--
-- Four rules the rest of the schema depends on:
--
--   * The vendor register is the identity. A bidder points at a vendor row by
--     id, never by name. Matching firms by name across stages makes "Meridian
--     Instruments" and "Meridian Instruments Pvt Ltd" the same firm by luck;
--     UNIQUE (name) plus a foreign key is the whole fix.
--
--   * The tender's bill of quantities is a snapshot, not a view of the
--     requisition. Once a tender is floated the bill is what bidders were
--     shown, and it may only change by corrigendum.
--
--   * The notice is frozen when it is issued. notice_snapshot holds every field
--     the printed notice carries as of the moment of floating. A notice issued
--     on the 3rd must not silently change because the tender was edited on the
--     5th, so nothing re-renders it from live state.
--
--   * Transitions are functions; fields are RLS. Editing a mode or a date is a
--     plain form write under a policy. Floating, closing bidding and issuing a
--     corrigendum are SECURITY DEFINER functions, because each is a constrained
--     multi-table act that has to be logged. See the note above
--     procurement_float_tender for why that split is not arbitrary.

-- ===== The vendor register =====

-- Organisation-wide master data, not case data: a vendor outlives every tender
-- it bids on, which is why it sits beside the budget heads rather than under a
-- case. Retired and blacklisted are flags rather than deletes so that a bidder
-- row recorded three years ago still resolves to a name.
CREATE TABLE IF NOT EXISTS public.procurement_vendors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  registration_id  TEXT,
  gst_number       TEXT,
  pan_number       TEXT,
  msme_category    TEXT CHECK (msme_category IN ('micro', 'small', 'medium', 'none')),
  email            TEXT,
  phone            TEXT,
  contact_person   TEXT,
  address          TEXT,
  city             TEXT,
  state            TEXT,
  country          TEXT NOT NULL DEFAULT 'India',
  website          TEXT,
  category_id      UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  notes            TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  blacklisted      BOOLEAN NOT NULL DEFAULT false,
  blacklist_reason TEXT,
  blacklisted_at   TIMESTAMPTZ,
  blacklisted_by   UUID,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);
ALTER TABLE public.procurement_vendors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_vendors_active
  ON public.procurement_vendors(active, name);
-- Partial, because most registers have gaps: only a stated code has to be
-- unique, and saying so in the index beats discovering it from a constraint
-- violation on the second vendor with no registration number.
CREATE UNIQUE INDEX IF NOT EXISTS idx_procurement_vendors_registration
  ON public.procurement_vendors(registration_id)
  WHERE registration_id IS NOT NULL;

-- ===== The tender =====

CREATE TABLE IF NOT EXISTS public.procurement_tenders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID NOT NULL UNIQUE REFERENCES public.procurement_cases(id) ON DELETE CASCADE,

  -- What is being floated, and how
  reference_no             TEXT,
  title                    TEXT,
  -- Free of value thresholds on purpose. Which mode a given estimate obliges is
  -- policy that differs by organisation and by year; the portal records the
  -- choice and then validates what that choice requires.
  mode                     TEXT NOT NULL DEFAULT 'open'
                           CHECK (mode IN ('open', 'limited', 'single', 'gem', 'eprocurement')),
  portal_reference         TEXT,
  portal_url               TEXT,
  single_justification     TEXT,
  scope_summary            TEXT,
  eligibility              TEXT,
  evaluation_note          TEXT,

  -- A text CHECK rather than an enum: this list will grow (cancelled,
  -- retendered) and extending an enum needs ALTER TYPE. The schema keeps enums
  -- for what the stage engine dispatches on; a tender's own lifecycle is data.
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'ready', 'floated',
                                             'bidding_open', 'bidding_closed', 'evaluation')),

  -- Dates
  published_on             DATE,
  bid_start_at             TIMESTAMPTZ,
  bid_end_at               TIMESTAMPTZ,
  prebid_meeting_at        TIMESTAMPTZ,
  prebid_venue             TEXT,
  query_deadline_at        TIMESTAMPTZ,
  technical_opening_at     TIMESTAMPTZ,
  financial_opening_at     TIMESTAMPTZ,
  delivery_days            INTEGER CHECK (delivery_days IS NULL OR delivery_days >= 0),
  -- How long a bid stands. The first thing anybody asks when an award slips.
  bid_validity_days        INTEGER CHECK (bid_validity_days IS NULL OR bid_validity_days > 0),

  -- Money
  currency                 TEXT NOT NULL DEFAULT 'INR',
  emd_required             BOOLEAN NOT NULL DEFAULT true,
  emd_amount               NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (emd_amount >= 0),
  emd_exemption_note       TEXT,
  tender_fee               NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (tender_fee >= 0),
  performance_security_pct NUMERIC(6,3) NOT NULL DEFAULT 0
                           CHECK (performance_security_pct BETWEEN 0 AND 100),
  gst_pct                  NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (gst_pct BETWEEN 0 AND 100),
  payment_terms            TEXT,
  warranty_terms           TEXT,

  -- The notice, frozen at the moment of floating. Never re-rendered from the
  -- columns above: those stay editable in principle and the notice must not.
  notice_snapshot          JSONB,
  notice_issued_at         TIMESTAMPTZ,
  notice_document_id       UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  -- Written by the lifecycle functions, never by a client.
  floated_at               TIMESTAMPTZ,
  floated_by               UUID,
  bidding_closed_at        TIMESTAMPTZ,
  bidding_closed_by        UUID,
  estimated_value          NUMERIC(18,2),

  created_by               UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT procurement_tenders_bid_window
    CHECK (bid_end_at IS NULL OR bid_start_at IS NULL OR bid_end_at > bid_start_at),
  CONSTRAINT procurement_tenders_query_deadline
    CHECK (query_deadline_at IS NULL OR bid_end_at IS NULL OR query_deadline_at <= bid_end_at)
);
ALTER TABLE public.procurement_tenders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_tenders_case_id
  ON public.procurement_tenders(case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_tenders_status
  ON public.procurement_tenders(status);

-- ===== Who was asked =====

-- Only a limited or single-source tender obliges an invitation list. That rule
-- lives in the guard rather than here, because an open tender may still want to
-- record the firms it wrote to.
CREATE TABLE IF NOT EXISTS public.procurement_tender_invitees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  UUID NOT NULL REFERENCES public.procurement_tenders(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a vendor that has been invited to anything cannot be
  -- deleted out from under the record. Retiring and blacklisting are the ways
  -- to take a vendor out of use.
  vendor_id  UUID NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE RESTRICT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by UUID,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, vendor_id)
);
ALTER TABLE public.procurement_tender_invitees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_tender_invitees_tender
  ON public.procurement_tender_invitees(tender_id);

-- ===== The published bill =====

-- A copy of the requisition's bill of quantities, taken when the tender is
-- floated.
--
-- A view over procurement_boq_lines would have been less to write and wrong.
-- Once a bidder has quoted against line 3, line 3 has to mean forever what it
-- meant then; the requisition stays correctable in principle, and a change to
-- what bidders were shown must be a numbered, dated, notified event rather than
-- something a reader can only detect by noticing the total moved.
CREATE TABLE IF NOT EXISTS public.procurement_tender_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id      UUID NOT NULL REFERENCES public.procurement_tenders(id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL,
  -- Deliberately no foreign key: the requisition line may be deleted or
  -- renumbered later and the snapshot has to survive that.
  source_line_id UUID,
  item_name      TEXT NOT NULL,
  specification  TEXT,
  quantity       NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit           TEXT,
  hsn_code       TEXT,
  estimated_rate NUMERIC(16,2),
  line_amount    NUMERIC(18,2) GENERATED ALWAYS AS
                   (ROUND(quantity * COALESCE(estimated_rate, 0), 2)) STORED,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, line_no)
);
ALTER TABLE public.procurement_tender_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_tender_items_tender
  ON public.procurement_tender_items(tender_id, line_no);

-- ===== The roster =====

-- One row per firm that bid. The tender is floated on an external portal or by
-- hand, and the purchase officer records what came back -- this product has no
-- bidder-facing door and makes no sealed-bid promise it could not keep.
CREATE TABLE IF NOT EXISTS public.procurement_bidders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id           UUID NOT NULL REFERENCES public.procurement_tenders(id) ON DELETE CASCADE,
  -- Denormalised from the tender, kept honest by a trigger. Every row-level
  -- policy in this schema is written against case_id; a policy that had to join
  -- through procurement_tenders to find the case would be slower and one more
  -- place to get the predicate wrong.
  case_id             UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  vendor_id           UUID NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE RESTRICT,

  bid_reference       TEXT,
  submitted_at        TIMESTAMPTZ,
  bid_amount          NUMERIC(18,2) CHECK (bid_amount IS NULL OR bid_amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  gst_pct             NUMERIC(6,3) CHECK (gst_pct IS NULL OR gst_pct BETWEEN 0 AND 100),
  -- Generated, so "did they quote inclusive of tax?" is arithmetic rather than
  -- a spreadsheet argument three stages later.
  bid_amount_gross    NUMERIC(18,2) GENERATED ALWAYS AS
                        (ROUND(COALESCE(bid_amount, 0) * (1 + COALESCE(gst_pct, 0) / 100.0), 2)) STORED,

  -- Earnest money is real money the organisation is holding, so it gets a
  -- settlement trail and not just a status word.
  emd_status          TEXT NOT NULL DEFAULT 'not_received'
                      CHECK (emd_status IN ('not_received', 'received', 'exempt',
                                            'returned', 'forfeited')),
  emd_amount          NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (emd_amount >= 0),
  emd_instrument      TEXT,
  emd_received_at     TIMESTAMPTZ,
  emd_settled_at      TIMESTAMPTZ,
  emd_settlement_note TEXT,

  msme_category       TEXT CHECK (msme_category IN ('micro', 'small', 'medium', 'none')),
  delivery_days       INTEGER CHECK (delivery_days IS NULL OR delivery_days >= 0),
  warranty_months     INTEGER CHECK (warranty_months IS NULL OR warranty_months >= 0),
  amc_years           NUMERIC(4,2) CHECK (amc_years IS NULL OR amc_years >= 0),
  payment_terms       TEXT,
  bid_validity_days   INTEGER CHECK (bid_validity_days IS NULL OR bid_validity_days > 0),

  status              TEXT NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received', 'withdrawn', 'rejected', 'disqualified')),
  disqualified_reason TEXT,
  remarks             TEXT,
  recorded_by         UUID,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, vendor_id)
);
ALTER TABLE public.procurement_bidders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_bidders_tender
  ON public.procurement_bidders(tender_id);
CREATE INDEX IF NOT EXISTS idx_procurement_bidders_case
  ON public.procurement_bidders(case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_bidders_vendor
  ON public.procurement_bidders(vendor_id);

-- ===== Corrigenda =====

-- A numbered, dated amendment to a floated tender. Anything that changes what
-- bidders were told has to arrive this way, which is the whole reason the
-- published bill is a snapshot.
CREATE TABLE IF NOT EXISTS public.procurement_corrigenda (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id            UUID NOT NULL REFERENCES public.procurement_tenders(id) ON DELETE CASCADE,
  case_id              UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  -- 1, 2, 3 within the tender, assigned by the issuing function under the row
  -- lock it already holds. A corrigendum is cited by its number in
  -- correspondence, so it cannot be a uuid the reader has never seen.
  serial_no            INTEGER NOT NULL,
  category             TEXT NOT NULL
                       CHECK (category IN ('schedule', 'technical', 'commercial', 'administrative')),
  title                TEXT NOT NULL,
  reason               TEXT NOT NULL,
  detail               TEXT,
  issued_on            DATE NOT NULL DEFAULT CURRENT_DATE,
  issued_by            UUID,

  -- JSONB because the shape varies by category -- a schedule amendment is a
  -- couple of timestamps, a technical one is a list of bill lines -- and no
  -- query reaches inside them. What a query does need is lifted out below.
  before_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The corrigendum notice, frozen at issue, on the same terms as the tender's.
  notice_snapshot      JSONB,
  notice_document_id   UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  value_before         NUMERIC(18,2),
  value_after          NUMERIC(18,2),
  value_delta          NUMERIC(18,2) GENERATED ALWAYS AS
                         (COALESCE(value_after, 0) - COALESCE(value_before, 0)) STORED,
  -- An amendment that moves the money is a budget question again, not just a
  -- notice. The flag is set by the issuing function; acting on it is finance's.
  needs_finance_review BOOLEAN NOT NULL DEFAULT false,
  new_bid_end_at       TIMESTAMPTZ,

  status               TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  revoked_at           TIMESTAMPTZ,
  revoked_by           UUID,
  revoke_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tender_id, serial_no)
);
ALTER TABLE public.procurement_corrigenda ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_corrigenda_tender
  ON public.procurement_corrigenda(tender_id, serial_no);
CREATE INDEX IF NOT EXISTS idx_procurement_corrigenda_case
  ON public.procurement_corrigenda(case_id);

-- A record that a bidder was told, not a mailer. Nothing in this slice sends
-- anything: the officer writes, telephones or posts, and then records it here
-- so the file can show who was on notice of what.
CREATE TABLE IF NOT EXISTS public.procurement_corrigendum_notices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrigendum_id UUID NOT NULL REFERENCES public.procurement_corrigenda(id) ON DELETE CASCADE,
  vendor_id      UUID NOT NULL REFERENCES public.procurement_vendors(id) ON DELETE RESTRICT,
  notified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel        TEXT NOT NULL DEFAULT 'portal'
                 CHECK (channel IN ('portal', 'email', 'phone', 'post')),
  note           TEXT,
  notified_by    UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (corrigendum_id, vendor_id)
);
ALTER TABLE public.procurement_corrigendum_notices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_corrigendum_notices_corrigendum
  ON public.procurement_corrigendum_notices(corrigendum_id);

-- ===== The case the award points at =====

-- procurement_cases.awarded_vendor_id has been a bare uuid since the foundation
-- migration, because the table it meant to name did not exist yet. Nothing in
-- this slice writes it -- the award is settled at the purchase committee and
-- the order -- but it can at least stop dangling.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'procurement_cases_awarded_vendor_id_fkey'
  ) THEN
    ALTER TABLE public.procurement_cases
      ADD CONSTRAINT procurement_cases_awarded_vendor_id_fkey
      FOREIGN KEY (awarded_vendor_id) REFERENCES public.procurement_vendors(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ===== updated_at =====
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_vendors','procurement_tenders','procurement_tender_invitees',
    'procurement_tender_items','procurement_bidders','procurement_corrigenda',
    'procurement_corrigendum_notices'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- Keeps the denormalised case_id equal to the tender's, so no client can put a
-- bidder on one case and a tender on another.
CREATE OR REPLACE FUNCTION public.procurement_bidder_set_case()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT case_id INTO NEW.case_id FROM public.procurement_tenders WHERE id = NEW.tender_id;
  IF NEW.case_id IS NULL THEN
    RAISE EXCEPTION 'Tender % does not exist', NEW.tender_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_bidders_case ON public.procurement_bidders;
CREATE TRIGGER trg_procurement_bidders_case
  BEFORE INSERT OR UPDATE ON public.procurement_bidders
  FOR EACH ROW EXECUTE FUNCTION public.procurement_bidder_set_case();

-- ===== Reading the tender =====

CREATE OR REPLACE FUNCTION public.procurement_tender_boq_total(_tender_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(line_amount), 0)
  FROM public.procurement_tender_items WHERE tender_id = _tender_id
$$;

-- One row for the head of the tender panel, so the screen does not assemble it
-- from six separate round trips.
--
-- lowest_bid is the lowest amount recorded, and nothing more. It is not a
-- ranking and must never be presented as one: a bid is only comparable after
-- the technical evaluation has said which bidders qualify and the comparative
-- statement has brought the quotes to the same terms. Both are later slices.
CREATE OR REPLACE FUNCTION public.procurement_tender_summary(_case_id UUID)
RETURNS TABLE (
  tender_id UUID, status TEXT, mode TEXT, reference_no TEXT, portal_reference TEXT,
  bid_start_at TIMESTAMPTZ, bid_end_at TIMESTAMPTZ, floated_at TIMESTAMPTZ,
  invitee_count BIGINT, bidder_count BIGINT, item_count BIGINT,
  published_value NUMERIC, lowest_bid NUMERIC, corrigendum_count BIGINT,
  emd_outstanding_count BIGINT, notice_issued_at TIMESTAMPTZ, notice_document_id UUID
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.status, t.mode, t.reference_no, t.portal_reference,
         t.bid_start_at, t.bid_end_at, t.floated_at,
         (SELECT COUNT(*) FROM public.procurement_tender_invitees i WHERE i.tender_id = t.id),
         (SELECT COUNT(*) FROM public.procurement_bidders b
           WHERE b.tender_id = t.id AND b.status = 'received'),
         (SELECT COUNT(*) FROM public.procurement_tender_items li WHERE li.tender_id = t.id),
         public.procurement_tender_boq_total(t.id),
         (SELECT MIN(b.bid_amount) FROM public.procurement_bidders b
           WHERE b.tender_id = t.id AND b.status = 'received' AND b.bid_amount IS NOT NULL),
         (SELECT COUNT(*) FROM public.procurement_corrigenda cg
           WHERE cg.tender_id = t.id AND cg.status = 'issued'),
         (SELECT COUNT(*) FROM public.procurement_bidders b
           WHERE b.tender_id = t.id AND b.status = 'received'
             AND b.emd_status IN ('not_received', 'received')),
         t.notice_issued_at, t.notice_document_id
  FROM public.procurement_tenders t
  JOIN public.procurement_cases c ON c.id = t.case_id
  WHERE t.case_id = _case_id
    AND public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
$$;

-- ===== The notice =====

-- Everything the printed notice states, as one object.
--
-- Called at the moment of floating and at each corrigendum, and never again.
-- The point of freezing it is that the tender's own columns stay editable in
-- principle while the notice that went out does not, so a future reader who is
-- tempted to "simplify" this by rendering from the live row should know they
-- would be deleting the only thing that makes an issued notice trustworthy.
CREATE OR REPLACE FUNCTION public.procurement_build_notice(_tender_id UUID)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reference_no', t.reference_no,
    'title', COALESCE(NULLIF(btrim(t.title), ''), c.title),
    'case_no', c.case_no,
    'department', d.name,
    'mode', t.mode,
    'portal_reference', t.portal_reference,
    'portal_url', t.portal_url,
    'scope_summary', t.scope_summary,
    'eligibility', t.eligibility,
    'single_justification', t.single_justification,
    'currency', t.currency,
    'emd_required', t.emd_required,
    'emd_amount', t.emd_amount,
    'emd_exemption_note', t.emd_exemption_note,
    'tender_fee', t.tender_fee,
    'performance_security_pct', t.performance_security_pct,
    'gst_pct', t.gst_pct,
    'payment_terms', t.payment_terms,
    'warranty_terms', t.warranty_terms,
    'published_on', t.published_on,
    'bid_start_at', t.bid_start_at,
    'bid_end_at', t.bid_end_at,
    'prebid_meeting_at', t.prebid_meeting_at,
    'prebid_venue', t.prebid_venue,
    'query_deadline_at', t.query_deadline_at,
    'technical_opening_at', t.technical_opening_at,
    'financial_opening_at', t.financial_opening_at,
    'delivery_days', t.delivery_days,
    'bid_validity_days', t.bid_validity_days,
    'estimated_value', public.procurement_tender_boq_total(t.id),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'line_no', li.line_no, 'item_name', li.item_name,
               'specification', li.specification, 'quantity', li.quantity,
               'unit', li.unit, 'hsn_code', li.hsn_code,
               'estimated_rate', li.estimated_rate, 'line_amount', li.line_amount)
             ORDER BY li.line_no)
      FROM public.procurement_tender_items li WHERE li.tender_id = t.id
    ), '[]'::jsonb),
    'invitees', COALESCE((
      SELECT jsonb_agg(v.name ORDER BY v.name)
      FROM public.procurement_tender_invitees i
      JOIN public.procurement_vendors v ON v.id = i.vendor_id
      WHERE i.tender_id = t.id
    ), '[]'::jsonb)
  )
  FROM public.procurement_tenders t
  JOIN public.procurement_cases c ON c.id = t.case_id
  LEFT JOIN public.procurement_lookups d ON d.id = c.department_id
  WHERE t.id = _tender_id
$$;

-- ===== The lifecycle =====

-- Floating, closing bidding and amending are functions rather than plain writes
-- for three reasons, and it is worth writing them down because a future reader
-- will otherwise see six columns and reach for an UPDATE:
--
--   1. The transitions are constrained. A CHECK constraint cannot see the old
--      row, and spreading the rule across a trigger, a policy and the client is
--      how it rots. One function per transition puts the precondition next to
--      the stamp it writes.
--   2. They have to be auditable. The case file is read through
--      procurement_case_activity, which unions procurement_case_events. A
--      direct UPDATE writes no event and the whole tender lifecycle is invisible
--      in the timeline. A trigger could log it but could not capture remarks.
--   3. They are multi-table. Floating publishes the bill and freezes the
--      notice; a corrigendum writes the amendment, mutates the bill and may
--      write notices. Those are transactions, not row edits.
--
-- Being SECURITY DEFINER also means they are the sanctioned way past the
-- freeze: the row-level policies on procurement_tender_items and
-- procurement_bidders shut the door on ordinary writes once a tender is
-- floated, and these functions are not subject to them.

CREATE OR REPLACE FUNCTION public.procurement_tender_assert_desk(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'No such case, or not one you can see'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.has_procurement_permission(auth.uid(), 'tender.create')
          OR public.has_procurement_role(auth.uid(), 'proc_admin')) THEN
    RAISE EXCEPTION 'You do not hold tender.create'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Copies the requisition's bill into the tender. Returns how many lines landed.
-- Refuses once the tender has been floated: after that the bill only moves by
-- corrigendum, which calls this function's sibling rather than this one.
CREATE OR REPLACE FUNCTION public.procurement_publish_boq(_case_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tender public.procurement_tenders;
  _n      INTEGER;
BEGIN
  PERFORM public.procurement_tender_assert_desk(_case_id);

  SELECT * INTO _tender FROM public.procurement_tenders WHERE case_id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This case has no tender yet' USING ERRCODE = 'no_data_found';
  END IF;
  IF _tender.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'The bill is published; amend it by corrigendum'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.procurement_tender_items WHERE tender_id = _tender.id;

  INSERT INTO public.procurement_tender_items
    (tender_id, line_no, source_line_id, item_name, specification,
     quantity, unit, hsn_code, estimated_rate)
  SELECT _tender.id, b.line_no, b.id, b.item_name, b.specification,
         b.quantity, b.unit, b.hsn_code, b.estimated_rate
  FROM public.procurement_boq_lines b
  WHERE b.case_id = _case_id
  ORDER BY b.line_no;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_float_tender(
  _case_id UUID, _remarks TEXT DEFAULT NULL
)
RETURNS public.procurement_tenders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tender public.procurement_tenders;
BEGIN
  PERFORM public.procurement_tender_assert_desk(_case_id);

  SELECT * INTO _tender FROM public.procurement_tenders WHERE case_id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This case has no tender yet' USING ERRCODE = 'no_data_found';
  END IF;
  IF _tender.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'This tender has already been floated' USING ERRCODE = 'check_violation';
  END IF;

  -- Looser than the stage guard on purpose. This is the gate on publishing a
  -- notice, not on handing the case to the committee: bidders are not expected
  -- yet, and bidding has obviously not closed.
  IF COALESCE(btrim(_tender.reference_no), '') = '' THEN
    RAISE EXCEPTION 'A tender needs a reference number before it is floated'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _tender.bid_end_at IS NULL THEN
    RAISE EXCEPTION 'A tender needs a bid submission deadline before it is floated'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _tender.mode IN ('gem', 'eprocurement')
     AND COALESCE(btrim(_tender.portal_reference), '') = '' THEN
    RAISE EXCEPTION 'A tender floated on a portal needs that portal''s own number'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _tender.mode IN ('limited', 'single')
     AND NOT EXISTS (SELECT 1 FROM public.procurement_tender_invitees
                      WHERE tender_id = _tender.id) THEN
    RAISE EXCEPTION 'A limited or single-source tender needs its invitation list'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _tender.mode = 'single'
     AND COALESCE(btrim(_tender.single_justification), '') = '' THEN
    RAISE EXCEPTION 'A single-source tender needs a written justification'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Publish the bill if nobody has yet. A tender with no lines is allowed --
  -- some purchases are described in the scope text alone -- but a stale copy is
  -- not, so this always reflects the requisition as it stands right now.
  PERFORM public.procurement_publish_boq(_case_id);

  UPDATE public.procurement_tenders
     SET status           = CASE WHEN bid_start_at IS NULL OR bid_start_at <= now()
                                 THEN 'bidding_open' ELSE 'floated' END,
         published_on     = COALESCE(published_on, CURRENT_DATE),
         floated_at       = now(),
         floated_by       = auth.uid(),
         estimated_value  = public.procurement_tender_boq_total(id),
         notice_snapshot  = public.procurement_build_notice(id),
         notice_issued_at = now()
   WHERE id = _tender.id
  RETURNING * INTO _tender;

  PERFORM public.procurement_log_event(
    _case_id, 'tender', 'tender.floated',
    'Tender ' || COALESCE(_tender.reference_no, '') || ' floated',
    jsonb_build_object('remarks', _remarks, 'mode', _tender.mode,
                       'portal_reference', _tender.portal_reference,
                       'bid_end_at', _tender.bid_end_at));

  RETURN _tender;
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_close_bidding(
  _case_id UUID, _remarks TEXT DEFAULT NULL
)
RETURNS public.procurement_tenders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tender public.procurement_tenders;
  _bids   BIGINT;
BEGIN
  PERFORM public.procurement_tender_assert_desk(_case_id);

  SELECT * INTO _tender FROM public.procurement_tenders WHERE case_id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This case has no tender yet' USING ERRCODE = 'no_data_found';
  END IF;
  IF _tender.status NOT IN ('floated', 'bidding_open') THEN
    RAISE EXCEPTION 'Bidding is not open on this tender' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO _bids FROM public.procurement_bidders
   WHERE tender_id = _tender.id AND status = 'received';

  UPDATE public.procurement_tenders
     SET status            = 'bidding_closed',
         bidding_closed_at = now(),
         bidding_closed_by = auth.uid()
   WHERE id = _tender.id
  RETURNING * INTO _tender;

  PERFORM public.procurement_log_event(
    _case_id, 'tender', 'tender.bidding_closed',
    CASE WHEN _bids = 1 THEN 'Bidding closed with 1 bid'
         ELSE 'Bidding closed with ' || _bids || ' bids' END,
    jsonb_build_object('remarks', _remarks, 'bidders', _bids));

  RETURN _tender;
END;
$$;

-- Amends a floated tender.
--
-- _payload carries the amendment: category, title, reason, detail, an optional
-- new bid deadline, and an optional 'items' array replacing the published bill.
-- Everything the amendment touches is captured before and after, so the change
-- is legible without a diff tool and can be put back.
CREATE OR REPLACE FUNCTION public.procurement_issue_corrigendum(
  _case_id UUID, _payload JSONB
)
RETURNS public.procurement_corrigenda LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tender public.procurement_tenders;
  _corr   public.procurement_corrigenda;
  _serial INTEGER;
  _before JSONB;
  _after  JSONB;
  _vb     NUMERIC;
  _va     NUMERIC;
  _newend TIMESTAMPTZ;
  _items  JSONB;
BEGIN
  PERFORM public.procurement_tender_assert_desk(_case_id);

  SELECT * INTO _tender FROM public.procurement_tenders WHERE case_id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This case has no tender yet' USING ERRCODE = 'no_data_found';
  END IF;
  IF _tender.status = 'draft' OR _tender.status = 'ready' THEN
    RAISE EXCEPTION 'Nothing has been floated yet, so edit the tender instead'
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(_payload ->> 'reason'), '') = '' THEN
    RAISE EXCEPTION 'A corrigendum has to say why' USING ERRCODE = 'check_violation';
  END IF;

  _vb := public.procurement_tender_boq_total(_tender.id);
  _before := jsonb_build_object(
    'bid_end_at', _tender.bid_end_at,
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(li) ORDER BY li.line_no)
                       FROM public.procurement_tender_items li
                       WHERE li.tender_id = _tender.id), '[]'::jsonb));

  _newend := NULLIF(_payload ->> 'new_bid_end_at', '')::TIMESTAMPTZ;
  IF _newend IS NOT NULL THEN
    IF _tender.bid_end_at IS NOT NULL AND _newend <= _tender.bid_end_at THEN
      RAISE EXCEPTION 'An extension has to move the deadline later'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.procurement_tenders
       SET bid_end_at = _newend,
           -- An extension reopens a tender whose window had already shut.
           status = CASE WHEN status = 'bidding_closed' THEN 'bidding_open' ELSE status END
     WHERE id = _tender.id;
  END IF;

  _items := _payload -> 'items';
  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' THEN
    DELETE FROM public.procurement_tender_items WHERE tender_id = _tender.id;
    INSERT INTO public.procurement_tender_items
      (tender_id, line_no, item_name, specification, quantity, unit, hsn_code, estimated_rate)
    SELECT _tender.id,
           (r ->> 'line_no')::INTEGER,
           r ->> 'item_name',
           r ->> 'specification',
           COALESCE((r ->> 'quantity')::NUMERIC, 0),
           r ->> 'unit',
           r ->> 'hsn_code',
           NULLIF(r ->> 'estimated_rate', '')::NUMERIC
    FROM jsonb_array_elements(_items) r;
  END IF;

  _va := public.procurement_tender_boq_total(_tender.id);

  SELECT * INTO _tender FROM public.procurement_tenders WHERE id = _tender.id;
  _after := jsonb_build_object(
    'bid_end_at', _tender.bid_end_at,
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(li) ORDER BY li.line_no)
                       FROM public.procurement_tender_items li
                       WHERE li.tender_id = _tender.id), '[]'::jsonb));

  SELECT COALESCE(MAX(serial_no), 0) + 1 INTO _serial
    FROM public.procurement_corrigenda WHERE tender_id = _tender.id;

  INSERT INTO public.procurement_corrigenda
    (tender_id, case_id, serial_no, category, title, reason, detail,
     issued_by, before_snapshot, after_snapshot, value_before, value_after,
     needs_finance_review, new_bid_end_at, notice_snapshot)
  VALUES (
    _tender.id, _case_id, _serial,
    COALESCE(NULLIF(btrim(_payload ->> 'category'), ''), 'administrative'),
    COALESCE(NULLIF(btrim(_payload ->> 'title'), ''), 'Corrigendum ' || _serial),
    btrim(_payload ->> 'reason'),
    NULLIF(btrim(_payload ->> 'detail'), ''),
    auth.uid(), _before, _after, _vb, _va,
    COALESCE(_va, 0) <> COALESCE(_vb, 0),
    _newend,
    public.procurement_build_notice(_tender.id))
  RETURNING * INTO _corr;

  -- The tender's own notice is superseded but not rewritten. What went out
  -- first stays as it went out; the corrigendum carries the amended text.
  PERFORM public.procurement_log_event(
    _case_id, 'tender', 'tender.corrigendum',
    'Corrigendum ' || _serial || ' issued',
    jsonb_build_object('serial_no', _serial, 'category', _corr.category,
                       'reason', _corr.reason, 'value_delta', _corr.value_delta,
                       'needs_finance_review', _corr.needs_finance_review));

  RETURN _corr;
END;
$$;

-- Puts back what a corrigendum changed. Only the most recent one, because
-- reversing an earlier amendment underneath a later one would restore a state
-- nobody was ever notified of.
CREATE OR REPLACE FUNCTION public.procurement_revoke_corrigendum(
  _corrigendum_id UUID, _reason TEXT
)
RETURNS public.procurement_corrigenda LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _corr   public.procurement_corrigenda;
  _latest INTEGER;
  _items  JSONB;
BEGIN
  SELECT * INTO _corr FROM public.procurement_corrigenda WHERE id = _corrigendum_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such corrigendum' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.procurement_tender_assert_desk(_corr.case_id);

  IF _corr.status = 'revoked' THEN
    RAISE EXCEPTION 'That corrigendum has already been revoked' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Revoking a corrigendum has to say why' USING ERRCODE = 'check_violation';
  END IF;

  SELECT MAX(serial_no) INTO _latest FROM public.procurement_corrigenda
   WHERE tender_id = _corr.tender_id AND status = 'issued';
  IF _corr.serial_no <> _latest THEN
    RAISE EXCEPTION 'Only the most recent corrigendum can be revoked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _corr.new_bid_end_at IS NOT NULL THEN
    UPDATE public.procurement_tenders
       SET bid_end_at = NULLIF(_corr.before_snapshot ->> 'bid_end_at', '')::TIMESTAMPTZ
     WHERE id = _corr.tender_id;
  END IF;

  _items := _corr.before_snapshot -> 'items';
  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array'
     AND _corr.after_snapshot -> 'items' IS DISTINCT FROM _items THEN
    DELETE FROM public.procurement_tender_items WHERE tender_id = _corr.tender_id;
    INSERT INTO public.procurement_tender_items
      (tender_id, line_no, source_line_id, item_name, specification,
       quantity, unit, hsn_code, estimated_rate)
    SELECT _corr.tender_id,
           (r ->> 'line_no')::INTEGER,
           NULLIF(r ->> 'source_line_id', '')::UUID,
           r ->> 'item_name',
           r ->> 'specification',
           COALESCE((r ->> 'quantity')::NUMERIC, 0),
           r ->> 'unit',
           r ->> 'hsn_code',
           NULLIF(r ->> 'estimated_rate', '')::NUMERIC
    FROM jsonb_array_elements(_items) r;
  END IF;

  UPDATE public.procurement_corrigenda
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = btrim(_reason)
   WHERE id = _corrigendum_id
  RETURNING * INTO _corr;

  PERFORM public.procurement_log_event(
    _corr.case_id, 'tender', 'tender.corrigendum_revoked',
    'Corrigendum ' || _corr.serial_no || ' revoked',
    jsonb_build_object('serial_no', _corr.serial_no, 'reason', _corr.revoke_reason));

  RETURN _corr;
END;
$$;

-- ===== The gate in front of the committee =====

-- A case may only leave the tender desk when bidding has actually happened: a
-- notice with a number, a deadline, whatever that mode of tendering obliged,
-- bidding closed, and at least one bid on file with an amount against it.
--
-- Mirrored client-side in src/features/procurement/lib/tenderChecks.ts so the
-- portal can say what is missing before the button is pressed. Change one and
-- change the other.
CREATE OR REPLACE FUNCTION public.procurement_guard_tender_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_tenders t
    WHERE t.case_id = _case_id
      AND t.status IN ('bidding_closed', 'evaluation')
      AND btrim(COALESCE(t.reference_no, '')) <> ''
      AND t.bid_end_at IS NOT NULL
      AND (t.mode NOT IN ('gem', 'eprocurement')
           OR btrim(COALESCE(t.portal_reference, '')) <> '')
      AND (t.mode NOT IN ('limited', 'single')
           OR EXISTS (SELECT 1 FROM public.procurement_tender_invitees i
                       WHERE i.tender_id = t.id))
      AND (t.mode <> 'single'
           OR btrim(COALESCE(t.single_justification, '')) <> '')
      AND EXISTS (SELECT 1 FROM public.procurement_bidders b
                   WHERE b.tender_id = t.id AND b.status = 'received')
      AND NOT EXISTS (SELECT 1 FROM public.procurement_bidders b
                       WHERE b.tender_id = t.id AND b.status = 'received'
                         AND b.bid_amount IS NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.procurement_tender_gaps(_case_id UUID)
RETURNS TEXT[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN t.id IS NULL THEN 'A tender record' END,
    CASE WHEN t.id IS NOT NULL AND btrim(COALESCE(t.reference_no, '')) = ''
         THEN 'A tender reference number' END,
    CASE WHEN t.mode IN ('gem', 'eprocurement')
          AND btrim(COALESCE(t.portal_reference, '')) = ''
         THEN 'The number the portal gave this tender' END,
    CASE WHEN t.mode IN ('limited', 'single')
          AND NOT EXISTS (SELECT 1 FROM public.procurement_tender_invitees i
                           WHERE i.tender_id = t.id)
         THEN 'At least one invited vendor' END,
    CASE WHEN t.mode = 'single' AND btrim(COALESCE(t.single_justification, '')) = ''
         THEN 'A written justification for going to a single source' END,
    CASE WHEN t.id IS NOT NULL AND t.bid_end_at IS NULL
         THEN 'A bid submission deadline' END,
    CASE WHEN t.id IS NOT NULL AND t.status IN ('draft', 'ready')
         THEN 'The tender to be floated' END,
    CASE WHEN t.status IN ('floated', 'bidding_open')
         THEN 'Bidding to be closed' END,
    CASE WHEN t.id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.procurement_bidders b
                           WHERE b.tender_id = t.id AND b.status = 'received')
         THEN 'At least one recorded bid' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.procurement_bidders b
                       WHERE b.tender_id = t.id AND b.status = 'received'
                         AND b.bid_amount IS NULL)
         THEN 'An amount against every recorded bid' END
  ], NULL)
  FROM public.procurement_cases c
  LEFT JOIN public.procurement_tenders t ON t.case_id = c.id
  WHERE c.id = _case_id
$$;

-- ===== Permissions =====

INSERT INTO public.procurement_permissions (key, label, stage) VALUES
  ('vendor.manage', 'Maintain the vendor register', 'Administration')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, stage = EXCLUDED.stage;

-- Additive only. The foundation's wholesale DELETE FROM
-- procurement_role_permissions is a bootstrap, and re-running that shape here
-- would wipe anything granted by hand since. It also means proc_admin does not
-- pick this key up from the "administrator holds everything" SELECT, which ran
-- before the key existed -- hence the explicit row.
INSERT INTO public.procurement_role_permissions (role, permission) VALUES
  ('proc_admin', 'vendor.manage'),
  ('purchase_officer', 'vendor.manage')
ON CONFLICT DO NOTHING;

-- ===== Stage actions =====

-- The tender desk was the one place in the workflow with no way back. A
-- requisition that turns out to be wrong could only be refused outright, which
-- ends the case rather than fixing it.
INSERT INTO public.procurement_return_paths (from_stage, to_stage) VALUES
  ('tender', 'mpr')
ON CONFLICT DO NOTHING;

INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status,
   requires_remarks, requires_signature, chair_only, sort_order) VALUES
  ('tender.return','tender','send_back','Return to the requester',
   'Sends the requisition back for correction before anything is floated.',
   'tender.create','mpr','Returned for correction',true,false,false,30)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  permission = EXCLUDED.permission, target_stage = EXCLUDED.target_stage,
  entry_status = EXCLUDED.entry_status, requires_remarks = EXCLUDED.requires_remarks,
  sort_order = EXCLUDED.sort_order;

-- Both ways out of the tender desk now carry the same precondition. Note the
-- (uuid, jsonb) signature: procurement_record_decision resolves the guard with
-- to_regprocedure and skips it silently if it does not match, so a typo here
-- would leave the gate open with no complaint from anywhere.
UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_tender_ready'
 WHERE code IN ('tender.to_tec', 'tender.to_commercial');

-- ===== Row level security =====

-- The register reads like the budget ledger: everybody signed in can read it,
-- because a bidder row shows a vendor's name at every stage downstream and a
-- register nobody can read renders as blank identifiers. Only the tender desk
-- and the administrator change it.
DROP POLICY IF EXISTS "Signed-in users can read the vendor register" ON public.procurement_vendors;
CREATE POLICY "Signed-in users can read the vendor register" ON public.procurement_vendors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "The tender desk and admins can manage vendors" ON public.procurement_vendors;
CREATE POLICY "The tender desk and admins can manage vendors" ON public.procurement_vendors
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'vendor.manage')
         OR public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'vendor.manage')
              OR public.has_procurement_permission(auth.uid(), 'master_data.manage'));

-- The tender, its bidders and its corrigenda follow the case: readable by
-- anyone who can see the case, writable only by the tender desk and only while
-- the case is actually sitting at that desk.
--
-- The stage clause is deliberate. The moment the case moves on, the roster is
-- evidence rather than a working list, and it stops being editable. The portal
-- has to render read-only at that point: a table with row-level security and no
-- policy that matches does not raise, it silently changes nothing, and a Save
-- button that appears to work is worse than one that is missing.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_tenders','procurement_bidders','procurement_corrigenda'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can read the tender on cases in their remit" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can read the tender on cases in their remit" ON public.%I
         FOR SELECT TO authenticated
         USING (public.procurement_can_view_case(auth.uid(), case_id))', t);

    -- One FOR ALL rather than separate INSERT/UPDATE/DELETE policies, and
    -- always with WITH CHECK: USING alone permits reads and deletes while
    -- silently rejecting every insert.
    EXECUTE format('DROP POLICY IF EXISTS "The tender desk can work the tender" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "The tender desk can work the tender" ON public.%I
         FOR ALL TO authenticated
         USING (EXISTS (
           SELECT 1 FROM public.procurement_cases c
           WHERE c.id = case_id
             AND c.case_status = ''open''
             AND c.stage = ''tender''::procurement_stage
             AND (public.has_procurement_permission(auth.uid(), ''tender.create'')
                  OR public.has_procurement_role(auth.uid(), ''proc_admin''))
         ))
         WITH CHECK (EXISTS (
           SELECT 1 FROM public.procurement_cases c
           WHERE c.id = case_id
             AND c.case_status = ''open''
             AND c.stage = ''tender''::procurement_stage
             AND (public.has_procurement_permission(auth.uid(), ''tender.create'')
                  OR public.has_procurement_role(auth.uid(), ''proc_admin''))
         ))', t);
  END LOOP;
END $$;

-- The three tables with no case_id of their own reach it through their parent.
DROP POLICY IF EXISTS "Users can read invitees on cases in their remit" ON public.procurement_tender_invitees;
CREATE POLICY "Users can read invitees on cases in their remit" ON public.procurement_tender_invitees
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procurement_tenders t
                  WHERE t.id = tender_id
                    AND public.procurement_can_view_case(auth.uid(), t.case_id)));

DROP POLICY IF EXISTS "The tender desk can manage invitees" ON public.procurement_tender_invitees;
CREATE POLICY "The tender desk can manage invitees" ON public.procurement_tender_invitees
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status IN ('draft', 'ready')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status IN ('draft', 'ready')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

DROP POLICY IF EXISTS "Users can read the published bill on cases in their remit" ON public.procurement_tender_items;
CREATE POLICY "Users can read the published bill on cases in their remit" ON public.procurement_tender_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procurement_tenders t
                  WHERE t.id = tender_id
                    AND public.procurement_can_view_case(auth.uid(), t.case_id)));

-- This is the freeze, and it needs no trigger. Once a tender is floated the
-- published bill is closed to ordinary writes; the only way in is
-- procurement_issue_corrigendum, which is SECURITY DEFINER and so is not
-- subject to this policy at all. Using the mechanism already in the schema
-- beats inventing a second one out of session variables.
DROP POLICY IF EXISTS "The tender desk can edit the bill before it is published" ON public.procurement_tender_items;
CREATE POLICY "The tender desk can edit the bill before it is published" ON public.procurement_tender_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status IN ('draft', 'ready')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status IN ('draft', 'ready')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

DROP POLICY IF EXISTS "Users can read corrigendum notices on cases in their remit" ON public.procurement_corrigendum_notices;
CREATE POLICY "Users can read corrigendum notices on cases in their remit" ON public.procurement_corrigendum_notices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procurement_corrigenda cg
                  WHERE cg.id = corrigendum_id
                    AND public.procurement_can_view_case(auth.uid(), cg.case_id)));

DROP POLICY IF EXISTS "The tender desk can record notifications" ON public.procurement_corrigendum_notices;
CREATE POLICY "The tender desk can record notifications" ON public.procurement_corrigendum_notices
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_corrigenda cg
    JOIN public.procurement_cases c ON c.id = cg.case_id
    WHERE cg.id = corrigendum_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_corrigenda cg
    JOIN public.procurement_cases c ON c.id = cg.case_id
    WHERE cg.id = corrigendum_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

-- The roster closes when bidding does. Same reasoning as the bill: after that
-- point a bidder is evidence, and the only sanctioned change is through a
-- function that leaves a trail.
DROP POLICY IF EXISTS "The tender desk can work the tender" ON public.procurement_bidders;
CREATE POLICY "The tender desk can work the tender" ON public.procurement_bidders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status NOT IN ('bidding_closed', 'evaluation')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.procurement_tenders t
    JOIN public.procurement_cases c ON c.id = t.case_id
    WHERE t.id = tender_id AND c.case_status = 'open'
      AND c.stage = 'tender'::procurement_stage
      AND t.status NOT IN ('bidding_closed', 'evaluation')
      AND (public.has_procurement_permission(auth.uid(), 'tender.create')
           OR public.has_procurement_role(auth.uid(), 'proc_admin'))));

-- ===== Grants =====

GRANT EXECUTE ON FUNCTION public.procurement_tender_boq_total(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_tender_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_build_notice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_publish_boq(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_float_tender(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_close_bidding(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_issue_corrigendum(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_revoke_corrigendum(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_tender_gaps(UUID) TO authenticated;
-- procurement_guard_tender_ready needs no grant: it is reached only through
-- procurement_record_decision, which is SECURITY DEFINER and owned by the
-- migration role. procurement_guard_requisition_ready is granted the same way,
-- which is to say not at all.
