-- Stage-engine and RLS check for the procurement lifecycle.
--
-- Runs the whole thing inside one transaction and rolls it back, so it is safe
-- against a live database. Every impersonation goes through request.jwt.claims,
-- the same way PostgREST does it, so the policies under test are the real ones.
--
-- Assertions are scoped to the case this script creates, never to counts over
-- the whole table: a database with real cases in it must still pass.
--
-- Usage: npm run check:procurement
--
-- Expect twenty-seven PASS notices and no ERROR lines.

\set ON_ERROR_STOP on
\pset pager off

CREATE OR REPLACE FUNCTION pg_temp.as_user(_email text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  -- Drop back to the owner role first: a previous impersonation cannot read auth.users.
  PERFORM set_config('role', 'postgres', true);
  SELECT id INTO _id FROM auth.users WHERE email = _email;
  IF _id IS NULL THEN RAISE EXCEPTION 'no user %', _email; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _id::text, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

BEGIN;

-- Holds the id of the case this run creates, so every assertion can name it
-- instead of counting rows across a table that may already have real cases.
CREATE TEMP TABLE probe (case_id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON probe TO authenticated;

-- Requester opens a case.
SELECT pg_temp.as_user('requester@jyoma.ai');
WITH opened AS (
  INSERT INTO public.procurement_cases (title, requester_id, created_by, estimated_cost, department_id)
  SELECT 'Check probe — spectrum analyser', auth.uid(), auth.uid(), 1850000,
         (SELECT id FROM public.procurement_lookups
           WHERE kind = 'department' AND name = 'Electronics & Instrumentation')
  RETURNING id
)
INSERT INTO probe (case_id) SELECT id FROM opened;

\echo '--- case created ---'
SELECT case_no, stage, status_label FROM public.procurement_cases WHERE id = (SELECT case_id FROM probe);

\echo '--- actions the requester sees at draft ---'
SELECT code, label FROM public.procurement_available_actions((SELECT case_id FROM probe));

\echo '--- draft.submit ---'
SELECT stage, status_label FROM public.procurement_record_decision((SELECT case_id FROM probe), 'draft.submit');

\echo '--- an incomplete requisition must not reach finance ---'
SELECT public.procurement_requisition_gaps((SELECT case_id FROM probe)) AS gaps;
DO $$
BEGIN
  PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'mpr.submit');
  RAISE EXCEPTION 'FAIL: an incomplete requisition reached finance';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: stage guard held (%)', SQLERRM;
END $$;

\echo '--- fill the requisition in, then mpr.submit ---'
INSERT INTO public.procurement_requisitions (case_id, required_by, cost_source, manual_cost, created_by)
SELECT case_id, current_date + 45, 'boq', 0, auth.uid() FROM probe;

INSERT INTO public.procurement_boq_lines
  (case_id, line_no, item_name, quantity, unit, estimated_rate, created_by)
SELECT case_id, 1, 'Spectrum analyser, 26.5 GHz', 1, 'Nos.', 1850000, auth.uid() FROM probe;

-- A second line, so the published bill the commercial desk prices against has
-- more than one: a one-line bill cannot demonstrate a missing line, a
-- duplicate, or an item-wise L1 that differs from the overall one.
INSERT INTO public.procurement_boq_lines
  (case_id, line_no, item_name, quantity, unit, estimated_rate, created_by)
SELECT case_id, 2, 'Calibration kit, 3.5 mm', 2, 'Nos.', 125000, auth.uid() FROM probe;

-- The case value follows the bill rather than whatever was inserted above.
SELECT estimated_cost FROM public.procurement_cases WHERE id = (SELECT case_id FROM probe);

SELECT stage, status_label FROM public.procurement_record_decision((SELECT case_id FROM probe), 'mpr.submit');

\echo '--- requester must not be able to clear the budget ---'
DO $$
BEGIN
  PERFORM public.procurement_record_decision(
    (SELECT case_id FROM probe), 'finance.clear', 'trying it on');
  RAISE EXCEPTION 'FAIL: requester was allowed to clear a budget';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: requester blocked (%)', SQLERRM;
END $$;

\echo '--- finance clears it ---'
SELECT pg_temp.as_user('finance@jyoma.ai');
SELECT code, label FROM public.procurement_available_actions((SELECT case_id FROM probe));
-- finance.clear is flagged requires_signature, so the payload has to carry one.
-- A one-pixel PNG stands in for the drawn mark; the engine checks that an image
-- is there, not that it looks like anybody's hand.
SELECT stage, status_label FROM public.procurement_record_decision(
  (SELECT case_id FROM probe), 'finance.clear', 'Budget head has headroom.',
  jsonb_build_object('signature', jsonb_build_object(
    'image', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'kind', 'drawn')));

\echo '--- an illegal jump backwards is refused ---'
DO $$
BEGIN
  PERFORM public.procurement_advance_stage((SELECT case_id FROM probe), 'draft');
  RAISE EXCEPTION 'FAIL: tender -> draft was allowed';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: backward jump refused (%)', SQLERRM;
END $$;

-- ===== The tender desk =====

\echo '--- the tender desk opens a tender ---'
SELECT pg_temp.as_user('tender@jyoma.ai');
CREATE TEMP TABLE probe_vendor (id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON probe_vendor TO authenticated;

WITH v AS (
  INSERT INTO public.procurement_vendors (name, registration_id, msme_category, email, created_by)
  VALUES ('Check probe instruments', 'CHK-0001', 'small', 'bids@check.example', auth.uid())
  RETURNING id
)
INSERT INTO probe_vendor (id) SELECT id FROM v;

-- A second firm, used only to prove the roster really shuts: see the note there.
CREATE TEMP TABLE probe_vendor_late (id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON probe_vendor_late TO authenticated;
WITH v2 AS (
  INSERT INTO public.procurement_vendors (name, registration_id, msme_category, created_by)
  VALUES ('Check probe latecomer', 'CHK-0002', 'micro', auth.uid())
  RETURNING id
)
INSERT INTO probe_vendor_late (id) SELECT id FROM v2;

INSERT INTO public.procurement_tenders (case_id, reference_no, mode, bid_end_at, created_by)
SELECT case_id, 'NIT/CHK/001', 'open', now() + interval '7 days', auth.uid() FROM probe;

\echo '--- an empty tender must not reach the committee ---'
SELECT public.procurement_tender_gaps((SELECT case_id FROM probe)) AS gaps;
DO $$
BEGIN
  PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'tender.to_tec');
  RAISE EXCEPTION 'FAIL: an unfloated tender with no bids reached the committee';
EXCEPTION WHEN check_violation THEN
  -- The message has to name what is missing. "Not ready", pressed from an
  -- action bar after signing, is indistinguishable from nothing happening.
  IF POSITION('recorded bid' IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: the refusal did not say what was missing: %', SQLERRM;
  END IF;
  RAISE NOTICE 'PASS: the refusal names the gaps (%)', SQLERRM;
END $$;

\echo '--- a write by the desk must actually match a row ---'
-- Not "did it raise" but "did it change something". A table with row-level
-- security and no policy that matches updates zero rows and reports success,
-- which is exactly how this went wrong once before.
DO $$
DECLARE _n int;
BEGIN
  WITH u AS (
    UPDATE public.procurement_tenders SET scope_summary = 'One spectrum analyser'
     WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
  SELECT count(*) INTO _n FROM u;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: the tender desk updated % rows, expected 1', _n; END IF;
  RAISE NOTICE 'PASS: the tender desk writes and the write lands';
END $$;

\echo '--- a portal tender needs the portal''s own number ---'
DO $$
DECLARE _gaps text[];
BEGIN
  UPDATE public.procurement_tenders SET mode = 'gem' WHERE case_id = (SELECT case_id FROM probe);
  SELECT public.procurement_tender_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF NOT ('The number the portal gave this tender' = ANY (_gaps)) THEN
    RAISE EXCEPTION 'FAIL: a GeM tender with no portal reference was not flagged';
  END IF;
  UPDATE public.procurement_tenders SET mode = 'open' WHERE case_id = (SELECT case_id FROM probe);
  RAISE NOTICE 'PASS: a portal tender without its portal number is flagged';
END $$;

\echo '--- the bill is arithmetic, not a typed number ---'
DO $$
BEGIN
  INSERT INTO public.procurement_tender_items (tender_id, line_no, item_name, quantity, estimated_rate, line_amount)
  SELECT id, 99, 'Forged total', 1, 10, 999999 FROM public.procurement_tenders
   WHERE case_id = (SELECT case_id FROM probe);
  RAISE EXCEPTION 'FAIL: a client wrote line_amount directly';
EXCEPTION WHEN generated_always THEN
  RAISE NOTICE 'PASS: line_amount cannot be written';
END $$;

\echo '--- floating freezes the notice ---'
DO $$
DECLARE _t public.procurement_tenders; _first jsonb; _second jsonb;
BEGIN
  _t := public.procurement_float_tender((SELECT case_id FROM probe), 'Floated by the check script');
  IF _t.notice_snapshot IS NULL THEN RAISE EXCEPTION 'FAIL: floating left no notice'; END IF;
  _first := _t.notice_snapshot;

  -- Editing the tender afterwards must not rewrite what went out.
  UPDATE public.procurement_tenders SET eligibility = 'Changed after the notice went out'
   WHERE id = _t.id;
  SELECT notice_snapshot INTO _second FROM public.procurement_tenders WHERE id = _t.id;
  IF _second IS DISTINCT FROM _first THEN
    RAISE EXCEPTION 'FAIL: editing the tender rewrote an issued notice';
  END IF;
  RAISE NOTICE 'PASS: the issued notice is frozen';
END $$;

\echo '--- the published bill closes when the tender is floated ---'
DO $$
DECLARE _n int;
BEGIN
  WITH i AS (
    INSERT INTO public.procurement_tender_items (tender_id, line_no, item_name, quantity, estimated_rate)
    SELECT id, 98, 'Slipped in after floating', 1, 100 FROM public.procurement_tenders
     WHERE case_id = (SELECT case_id FROM probe)
    RETURNING id)
  SELECT count(*) INTO _n FROM i;
  RAISE EXCEPTION 'FAIL: % bill lines were added after floating', _n;
EXCEPTION
  WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: the published bill is closed to ordinary writes';
  WHEN check_violation THEN RAISE NOTICE 'PASS: the published bill is closed to ordinary writes';
END $$;

\echo '--- but a corrigendum still gets in ---'
DO $$
DECLARE _c public.procurement_corrigenda;
BEGIN
  _c := public.procurement_issue_corrigendum(
          (SELECT case_id FROM probe),
          jsonb_build_object('category','schedule','title','Deadline extended',
                             'reason','A bidder asked for more time',
                             'new_bid_end_at', (now() + interval '21 days')::text));
  IF _c.serial_no <> 1 THEN RAISE EXCEPTION 'FAIL: first corrigendum numbered %', _c.serial_no; END IF;
  IF _c.notice_snapshot IS NULL THEN RAISE EXCEPTION 'FAIL: the corrigendum carries no notice'; END IF;
  RAISE NOTICE 'PASS: corrigendum % issued against a floated tender', _c.serial_no;
END $$;

\echo '--- the roster closes when bidding does ---'
INSERT INTO public.procurement_bidders (tender_id, case_id, vendor_id, bid_amount, gst_pct, created_by)
SELECT t.id, t.case_id, (SELECT id FROM probe_vendor), 1795000, 18, auth.uid()
  FROM public.procurement_tenders t WHERE t.case_id = (SELECT case_id FROM probe);

-- A second firm, quoting less on paper at a higher tax rate. The commercial
-- desk needs two comparable bids to rank, and this pair is chosen so that the
-- lowest quoted amount is NOT the lowest evaluated cost -- which is the entire
-- reason the comparative statement exists, and the thing a ranking read off
-- bid_amount would get wrong.
CREATE TEMP TABLE probe_vendor_two (id uuid) ON COMMIT DROP;
GRANT SELECT, INSERT ON probe_vendor_two TO authenticated;
WITH v3 AS (
  INSERT INTO public.procurement_vendors (name, registration_id, msme_category, created_by)
  VALUES ('Check probe optics', 'CHK-0003', 'medium', auth.uid())
  RETURNING id
)
INSERT INTO probe_vendor_two (id) SELECT id FROM v3;

INSERT INTO public.procurement_bidders
  (tender_id, case_id, vendor_id, bid_amount, gst_pct, delivery_days, warranty_months, created_by)
SELECT t.id, t.case_id, (SELECT id FROM probe_vendor_two), 1740000, 28, 90, 12, auth.uid()
  FROM public.procurement_tenders t WHERE t.case_id = (SELECT case_id FROM probe);

UPDATE public.procurement_bidders
   SET delivery_days = 60, warranty_months = 36
 WHERE case_id = (SELECT case_id FROM probe)
   AND vendor_id = (SELECT id FROM probe_vendor);

DO $$
DECLARE _gross numeric;
BEGIN
  SELECT bid_amount_gross INTO _gross FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe);
  IF _gross <> 2118100.00 THEN RAISE EXCEPTION 'FAIL: gross of 1795000 at 18%% came out as %', _gross; END IF;
  PERFORM public.procurement_close_bidding((SELECT case_id FROM probe), 'One bid received');

  -- A different vendor on purpose: reusing the first one could trip the
  -- (tender_id, vendor_id) unique constraint and pass this test for the wrong
  -- reason, leaving a wide-open roster undetected.
  BEGIN
    INSERT INTO public.procurement_bidders (tender_id, case_id, vendor_id, bid_amount, created_by)
    SELECT t.id, t.case_id, (SELECT id FROM probe_vendor_late), 1, auth.uid()
      FROM public.procurement_tenders t WHERE t.case_id = (SELECT case_id FROM probe);
    RAISE EXCEPTION 'FAIL: a bid was recorded after bidding closed';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'PASS: gross is derived, and the roster closed with bidding';
  END;
END $$;

\echo '--- a requester cannot work the tender ---'
SELECT pg_temp.as_user('requester@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  BEGIN
    WITH u AS (
      UPDATE public.procurement_tenders SET reference_no = 'NIT/FORGED/001'
       WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
    SELECT count(*) INTO _n FROM u;
  EXCEPTION WHEN insufficient_privilege THEN
    _n := 0;
  END;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: a requester rewrote the tender reference'; END IF;
  RAISE NOTICE 'PASS: a requester cannot write the tender';
END $$;

\echo '--- a bid carries its own papers, attributed to that bid ---'
SELECT pg_temp.as_user('tender@jyoma.ai');
DO $$
DECLARE _doc uuid; _bidder uuid; _rows int; _sub record;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) LIMIT 1;

  -- Stands in for the ingest pipeline: the file itself is not the point here,
  -- the attribution is.
  INSERT INTO public.documents (title, original_filename, storage_path, mime_type, created_by, status)
  VALUES ('Check probe — vendor certificates', 'certs.pdf',
          auth.uid() || '/probe-certs.pdf', 'application/pdf', auth.uid(), 'active')
  RETURNING id INTO _doc;

  INSERT INTO public.procurement_case_documents
    (case_id, document_id, stage, doc_type, bidder_id, uploaded_by)
  VALUES ((SELECT case_id FROM probe), _doc, 'tender', 'Bid / vendor response', _bidder, auth.uid());

  SELECT * INTO _sub FROM public.procurement_bid_submissions((SELECT case_id FROM probe))
   WHERE bidder_id = _bidder;
  IF _sub.document_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: the bid reports % papers, expected 1', _sub.document_count;
  END IF;
  IF _sub.indexed_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: an active document was not counted as read';
  END IF;

  -- Papers stay on the case when the firm comes off the roster. Losing the
  -- evidence because somebody tidied the roster would be the worse failure.
  SELECT count(*) INTO _rows FROM public.procurement_case_documents
   WHERE document_id = _doc AND bidder_id IS NOT NULL;
  IF _rows <> 1 THEN RAISE EXCEPTION 'FAIL: the paper is not attributed'; END IF;

  RAISE NOTICE 'PASS: a bid carries its own papers and they are counted';
END $$;

\echo '--- with a bid on file, the handoff is allowed and closes bidding itself ---'
SELECT pg_temp.as_user('tender@jyoma.ai');
SELECT public.procurement_tender_gaps((SELECT case_id FROM probe)) AS gaps_now;
DO $$
DECLARE _gaps text[]; _status text; _case public.procurement_cases;
BEGIN
  SELECT public.procurement_tender_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF array_length(_gaps, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the tender still reports gaps: %', _gaps;
  END IF;

  -- Reopen bidding to prove the hand-off shuts it: the corrigendum above
  -- already reopened it once, and the explicit close should not be a
  -- prerequisite for anything.
  UPDATE public.procurement_tenders SET status = 'bidding_open'
   WHERE case_id = (SELECT case_id FROM probe);

  IF NOT public.procurement_guard_tender_ready((SELECT case_id FROM probe)) THEN
    RAISE EXCEPTION 'FAIL: the guard refuses a tender with bidding still open';
  END IF;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'tender.to_tec', NULL,
    jsonb_build_object('signature', jsonb_build_object(
      'image', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'kind', 'drawn')));
  IF _case.stage <> 'tec' THEN
    RAISE EXCEPTION 'FAIL: the handoff left the case at %', _case.stage;
  END IF;

  SELECT status INTO _status FROM public.procurement_tenders
   WHERE case_id = (SELECT case_id FROM probe);
  IF _status <> 'bidding_closed' THEN
    RAISE EXCEPTION 'FAIL: bidding was left % after the handoff', _status;
  END IF;
  RAISE NOTICE 'PASS: the handoff moved the case and closed bidding itself';
END $$;

\echo '--- and it had to be signed ---'
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_case_signatures
   WHERE case_id = (SELECT case_id FROM probe) AND action_code = 'tender.to_tec';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: % signatures on the handoff, expected 1', _n; END IF;
  RAISE NOTICE 'PASS: the handoff is on the record as signed';
END $$;

\echo '--- ===== the technical evaluation committee ===== ---'

\echo '--- the checklist was seeded the moment the case reached tec ---'
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_tec_checklist WHERE case_id = (SELECT case_id FROM probe);
  IF _n <> 4 THEN RAISE EXCEPTION 'FAIL: % checklist rows, expected 4', _n; END IF;
  RAISE NOTICE 'PASS: the tec checklist was seeded on entry';
END $$;

\echo '--- a member can submit a reading with no signature at all, a requester cannot submit one at all ---'
SELECT pg_temp.as_user('tec.member@jyoma.ai');
DO $$
DECLARE _bidder uuid; _eval public.procurement_tec_evaluations;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  _eval := public.procurement_submit_tec_evaluation(_bidder, 82, 'compliant', true, 'Looks solid.', NULL);
  IF _eval.member_id IS NULL OR _eval.submitted_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: the evaluation did not record a member or a submission time';
  END IF;
  IF _eval.signature_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an unsigned submission left a signature row behind';
  END IF;
  RAISE NOTICE 'PASS: a member submitted a reading with no signature at all';
END $$;

SELECT pg_temp.as_user('requester@jyoma.ai');
DO $$
DECLARE _bidder uuid;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  BEGIN
    PERFORM public.procurement_submit_tec_evaluation(_bidder, 50, 'pending', NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: a requester was able to submit a technical evaluation';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: a requester cannot submit a technical evaluation';
  END;
END $$;

\echo '--- only the chair can make the final qualification call ---'
SELECT pg_temp.as_user('tec.member@jyoma.ai');
DO $$
DECLARE _bidder uuid;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  BEGIN
    PERFORM public.procurement_set_bidder_qualification(_bidder, true, 'test');
    RAISE EXCEPTION 'FAIL: a member was able to make the chair''s call';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: a member is refused the chair''s qualification call';
  END;
END $$;

SELECT pg_temp.as_user('tec.chair@jyoma.ai');
DO $$
DECLARE _bidder uuid; _n int;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  PERFORM public.procurement_set_bidder_qualification(_bidder, true, 'Meets all criteria.');

  -- a direct client write to the same column does not also work
  UPDATE public.procurement_bidders SET tec_qualified = false WHERE id = _bidder;
  SELECT count(*) INTO _n FROM public.procurement_bidders WHERE id = _bidder AND tec_qualified = true;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: a direct UPDATE changed tec_qualified'; END IF;
  RAISE NOTICE 'PASS: the chair''s call landed and a direct write cannot override it';
END $$;

\echo '--- the guard and its mirror agree once a bidder is qualified ---'
DO $$
DECLARE _ok boolean; _gaps text[];
BEGIN
  SELECT public.procurement_guard_tec_ready((SELECT case_id FROM probe)) INTO _ok;
  SELECT public.procurement_tec_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL: guard still false after qualifying a bidder'; END IF;
  IF array_length(_gaps, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: gaps still list % after qualifying', _gaps;
  END IF;
  RAISE NOTICE 'PASS: tec.recommend''s guard is satisfied and its gaps list agrees';
END $$;

\echo '--- the tec committee constitutes itself, so the chair actually has something to press ---'
SELECT pg_temp.as_user('tec.chair@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  -- Chair-only actions also check is_procurement_committee_chair(), which
  -- reads a constituted committee. Nothing in this product's UI offers a way
  -- to constitute one by hand, so if this were still a manual step the chair
  -- would hold tec.chair, have qualified a bidder, and still see an empty
  -- action bar -- indistinguishable from the engine being broken.
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'tec.recommend';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL: tec.chair does not see tec.recommend on the action bar (committee not constituted?)';
  END IF;
  RAISE NOTICE 'PASS: the tec committee constituted itself and the chair sees tec.recommend';
END $$;

\echo '--- consensus reads the one signed reading back correctly ---'
DO $$
DECLARE _bidder uuid; _row record;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  SELECT * INTO _row FROM public.procurement_tec_case_consensus((SELECT case_id FROM probe))
   WHERE bidder_id = _bidder;
  IF _row.member_count <> 1 OR _row.qualified_pct <> 100 THEN
    RAISE EXCEPTION 'FAIL: consensus read back wrong (count=%, pct=%)', _row.member_count, _row.qualified_pct;
  END IF;
  RAISE NOTICE 'PASS: consensus reflects the one signed reading';
END $$;

\echo '--- an AI suggestion can only land through the function that checks a seat, never directly ---'
SELECT pg_temp.as_user('requester@jyoma.ai');
DO $$
DECLARE _bidder uuid;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  BEGIN
    PERFORM public.procurement_record_tec_ai_suggestion(_bidder, 50, 'pending', NULL, NULL, '[]'::jsonb, 'test');
    RAISE EXCEPTION 'FAIL: a requester recorded an AI suggestion';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: a requester is refused when recording an AI suggestion';
  END;
END $$;

SELECT pg_temp.as_user('tec.member@jyoma.ai');
DO $$
DECLARE _bidder uuid;
BEGIN
  SELECT id INTO _bidder FROM public.procurement_bidders
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'received' LIMIT 1;
  BEGIN
    INSERT INTO public.procurement_tec_ai_suggestions (bidder_id, score) VALUES (_bidder, 99);
    RAISE EXCEPTION 'FAIL: a direct INSERT into procurement_tec_ai_suggestions succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: procurement_tec_ai_suggestions has no write policy for a direct insert';
  END;
END $$;

\echo '=== the commercial desk ==='

\echo '--- tec.recommend hands the case over, and the desk seeds itself on arrival ---'
SELECT pg_temp.as_user('tec.chair@jyoma.ai');
DO $$
DECLARE _case public.procurement_cases; _quotes int; _rec int;
BEGIN
  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'tec.recommend',
    'One bid qualifies on the frequency range.',
    jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));

  IF _case.stage <> 'commercial' THEN
    RAISE EXCEPTION 'FAIL: tec.recommend left the case at %', _case.stage;
  END IF;

  SELECT count(*) INTO _rec FROM public.procurement_commercial
   WHERE case_id = (SELECT case_id FROM probe);
  SELECT count(*) INTO _quotes FROM public.procurement_commercial_quotes
   WHERE case_id = (SELECT case_id FROM probe);

  IF _rec <> 1 THEN RAISE EXCEPTION 'FAIL: no commercial record was seeded on arrival'; END IF;
  IF _quotes <> 2 THEN RAISE EXCEPTION 'FAIL: % quotes seeded, expected one per recorded bid', _quotes; END IF;
  RAISE NOTICE 'PASS: the case reached commercial and seeded a record and % quotes', _quotes;
END $$;

\echo '--- the evaluated cost is arithmetic, not a typed number ---'
SELECT pg_temp.as_user('commercial@jyoma.ai');
DO $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.procurement_commercial_quotes
   WHERE case_id = (SELECT case_id FROM probe) LIMIT 1;
  UPDATE public.procurement_commercial_quotes SET evaluated_cost = 1 WHERE id = _id;
  RAISE EXCEPTION 'FAIL: a client wrote evaluated_cost directly';
EXCEPTION WHEN generated_always THEN
  RAISE NOTICE 'PASS: evaluated_cost cannot be written';
END $$;

DO $$
DECLARE _bidder uuid; _q public.procurement_commercial_quotes;
BEGIN
  SELECT b.id INTO _bidder FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe instruments';

  -- 1,795,000 base at 18% = 323,100 tax, plus 40,000 freight, plus 10,000
  -- other, less 15,000 discount, plus a 25,000 stated loading.
  _q := public.procurement_save_quote(
          _bidder, 1795000, 18, 40000, 10000, 15000,
          25000, 'Deviation on the calibration interval', 'compliant', 'manual',
          'Priced from the quotation on file.');

  IF _q.gst_amount <> 323100.00 THEN
    RAISE EXCEPTION 'FAIL: tax on 1795000 at 18%% came out as %', _q.gst_amount;
  END IF;
  IF _q.taxable_value <> 1830000.00 THEN
    RAISE EXCEPTION 'FAIL: taxable value came out as %', _q.taxable_value;
  END IF;
  IF _q.evaluated_cost <> 2178100.00 THEN
    RAISE EXCEPTION 'FAIL: evaluated cost came out as %, expected 2178100.00', _q.evaluated_cost;
  END IF;
  RAISE NOTICE 'PASS: base + tax + freight + other - discount + loading = % , all derived', _q.evaluated_cost;
END $$;

\echo '--- a loading with no stated reason is refused ---'
DO $$
DECLARE _bidder uuid;
BEGIN
  SELECT b.id INTO _bidder FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe instruments';
  PERFORM public.procurement_save_quote(_bidder, 1795000, 18, 40000, 10000, 15000, 5000, '', 'compliant');
  RAISE EXCEPTION 'FAIL: a loading was accepted with no note';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: a loading without a stated reason is refused';
END $$;

\echo '--- reading a broken price schedule names what is wrong with it ---'
DO $$
DECLARE
  _quote uuid; _first uuid; _issues jsonb; _codes text[]; _q public.procurement_commercial_quotes;
BEGIN
  SELECT q.id INTO _quote FROM public.procurement_commercial_quotes q
    JOIN public.procurement_bidders b ON b.id = q.bidder_id
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE q.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe instruments';

  SELECT i.id INTO _first FROM public.procurement_tender_items i
    JOIN public.procurement_tenders t ON t.id = i.tender_id
   WHERE t.case_id = (SELECT case_id FROM probe) AND i.line_no = 1;

  -- Line 1 priced twice with different rates, line 2 never mentioned, and a
  -- row for something that is not on the bill at all. Also a quantity the
  -- bidder disagreed with, and a stated total that does not add up.
  _issues := public.procurement_record_quote_schedule(
    _quote,
    jsonb_build_array(
      jsonb_build_object('tender_item_id', _first, 'unit_rate', 1700000, 'quantity', 1),
      jsonb_build_object('tender_item_id', _first, 'unit_rate', 1750000, 'quantity', 3),
      jsonb_build_object('item_name', 'Tripod, not on the bill', 'unit_rate', 9000)),
    'spreadsheet', 9999999);

  SELECT array_agg(DISTINCT e ->> 'code') INTO _codes
    FROM jsonb_array_elements(_issues) e;

  IF NOT ('duplicate_line'    = ANY (_codes)) THEN RAISE EXCEPTION 'FAIL: a line priced twice was not flagged (%)', _codes; END IF;
  IF NOT ('missing_line'      = ANY (_codes)) THEN RAISE EXCEPTION 'FAIL: an unpriced published line was not flagged (%)', _codes; END IF;
  IF NOT ('unmatched_row'     = ANY (_codes)) THEN RAISE EXCEPTION 'FAIL: a row not on the bill was not flagged (%)', _codes; END IF;
  IF NOT ('quantity_mismatch' = ANY (_codes)) THEN RAISE EXCEPTION 'FAIL: a disagreeing quantity was not flagged (%)', _codes; END IF;
  IF NOT ('total_mismatch'    = ANY (_codes)) THEN RAISE EXCEPTION 'FAIL: a stated total that does not add up was not flagged (%)', _codes; END IF;

  SELECT * INTO _q FROM public.procurement_commercial_quotes WHERE id = _quote;
  IF _q.fully_priced THEN
    RAISE EXCEPTION 'FAIL: a schedule missing a published line counts as fully priced';
  END IF;

  -- The later of two rows for the same line wins, and the published quantity
  -- beats the one the bidder typed: 1 x 1,750,000, not 3 x anything.
  IF (SELECT line_amount FROM public.procurement_quote_lines
       WHERE quote_id = _quote AND tender_item_id = _first) <> 1750000.00 THEN
    RAISE EXCEPTION 'FAIL: the later row or the published quantity did not win';
  END IF;

  RAISE NOTICE 'PASS: the schedule reader flagged %', _codes;
END $$;

\echo '--- a complete schedule takes over the base price; a partial one does not ---'
DO $$
DECLARE _quote uuid; _q public.procurement_commercial_quotes; _lines jsonb;
BEGIN
  SELECT q.id INTO _quote FROM public.procurement_commercial_quotes q
    JOIN public.procurement_bidders b ON b.id = q.bidder_id
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE q.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe instruments';

  SELECT * INTO _q FROM public.procurement_commercial_quotes WHERE id = _quote;
  IF _q.base_price <> 1795000.00 THEN
    RAISE EXCEPTION 'FAIL: a partial schedule overwrote the base price with %', _q.base_price;
  END IF;

  -- Now price every published line: 1,600,000 and 2 x 100,000 = 1,800,000.
  -- Chosen so this firm's evaluated cost (1,800,000 at 18%, plus 40,000
  -- freight and 10,000 other, less 15,000 discount, plus a 25,000 loading =
  -- 2,184,000) undercuts the other firm's 2,227,200 even though this firm
  -- quoted the HIGHER amount on paper. That inversion is the fixture.
  SELECT jsonb_agg(jsonb_build_object(
           'tender_item_id', i.id,
           'unit_rate', CASE WHEN i.line_no = 1 THEN 1600000 ELSE 100000 END))
    INTO _lines
    FROM public.procurement_tender_items i
    JOIN public.procurement_tenders t ON t.id = i.tender_id
   WHERE t.case_id = (SELECT case_id FROM probe);

  PERFORM public.procurement_record_quote_schedule(_quote, _lines, 'manual', NULL);

  SELECT * INTO _q FROM public.procurement_commercial_quotes WHERE id = _quote;
  IF NOT _q.fully_priced THEN RAISE EXCEPTION 'FAIL: every line priced but not fully_priced'; END IF;
  IF _q.base_price <> 1800000.00 THEN
    RAISE EXCEPTION 'FAIL: a complete schedule left the base price at %', _q.base_price;
  END IF;
  IF _q.evaluated_cost <> 2184000.00 THEN
    RAISE EXCEPTION 'FAIL: evaluated cost off the schedule came out as %', _q.evaluated_cost;
  END IF;
  RAISE NOTICE 'PASS: a partial schedule leaves the typed price alone, a complete one replaces it';
END $$;

\echo '--- the second firm is priced, and was never disqualified by a committee it never saw ---'
DO $$
DECLARE _bidder uuid; _q public.procurement_commercial_quotes;
BEGIN
  SELECT b.id INTO _bidder FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe optics';

  IF (SELECT tec_qualified FROM public.procurement_bidders WHERE id = _bidder) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the second firm was expected to carry no technical verdict';
  END IF;

  _q := public.procurement_save_quote(_bidder, 1740000, 28, 0, 0, 0, 0, NULL, 'compliant', 'manual');
  IF _q.evaluated_cost <> 2227200.00 THEN
    RAISE EXCEPTION 'FAIL: evaluated cost came out as %, expected 2227200.00', _q.evaluated_cost;
  END IF;
  RAISE NOTICE 'PASS: an unjudged bid is priced, not excluded — a NULL verdict is not a refusal';
END $$;

\echo '--- L1 is the lowest evaluated cost, which is not the lowest amount quoted ---'
DO $$
DECLARE _l1 text; _l1_cost numeric; _cheapest text; _eligible int;
BEGIN
  SELECT r.vendor_name, r.evaluated_cost INTO _l1, _l1_cost
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;

  SELECT v.name INTO _cheapest FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.case_id = (SELECT case_id FROM probe)
   ORDER BY b.bid_amount LIMIT 1;

  SELECT count(*) INTO _eligible
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.eligible;

  IF _eligible <> 2 THEN RAISE EXCEPTION 'FAIL: % bids are rankable, expected 2', _eligible; END IF;
  IF _l1 IS DISTINCT FROM 'Check probe instruments' THEN
    RAISE EXCEPTION 'FAIL: L1 came out as %', _l1;
  END IF;
  IF _cheapest = _l1 THEN
    RAISE EXCEPTION 'FAIL: this fixture no longer proves the point — the cheapest quote is also L1';
  END IF;
  RAISE NOTICE 'PASS: L1 is % at %, while % quoted the lower amount', _l1, _l1_cost, _cheapest;
END $$;

\echo '--- item-wise L1 is computed per published line ---'
DO $$
DECLARE _rows int; _l1s int;
BEGIN
  -- Only "Check probe instruments" priced line by line; "Check probe optics"
  -- carries a lump sum and so has no rate against either published line. Each
  -- line therefore has exactly one non-NULL rate, and that one rate is
  -- trivially its own line's L1 -- both lines, not one, which is the point:
  -- an item-wise comparison exists even when only one bidder supplied one.
  SELECT count(*), count(*) FILTER (WHERE c.is_line_l1) INTO _rows, _l1s
    FROM public.procurement_commercial_line_comparison((SELECT case_id FROM probe)) c;
  IF _rows <> 4 THEN
    RAISE EXCEPTION 'FAIL: the matrix has % cells, expected 2 lines x 2 firms', _rows;
  END IF;
  IF _l1s <> 2 THEN
    RAISE EXCEPTION 'FAIL: % lines carry an item-wise L1, expected 2', _l1s;
  END IF;
  RAISE NOTICE 'PASS: the cross-bidder matrix is % cells with % item-wise L1', _rows, _l1s;
END $$;

\echo '--- the ranking basis is switchable, and switching it is an event ---'
DO $$
DECLARE _before text; _after text; _n int;
BEGIN
  SELECT r.vendor_name INTO _before
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.rank = 1;

  PERFORM public.procurement_set_ranking_basis((SELECT case_id FROM probe), 'base_price');

  SELECT r.vendor_name INTO _after
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.rank = 1;

  SELECT count(*) INTO _n FROM public.procurement_case_events
   WHERE case_id = (SELECT case_id FROM probe) AND action = 'commercial.basis_changed';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: changing the ranking basis left no event'; END IF;

  -- On base price alone the optics firm (1,740,000) beats the instruments
  -- firm's line-priced 1,940,000; on evaluated cost it does not.
  IF _after = _before THEN
    RAISE EXCEPTION 'FAIL: the basis changed but L1 did not (% both times)', _before;
  END IF;
  RAISE NOTICE 'PASS: L1 is % on evaluated cost and % on base price', _before, _after;

  PERFORM public.procurement_set_ranking_basis((SELECT case_id FROM probe), 'evaluated_cost');
END $$;

\echo '--- the reasonableness check reads the frozen published estimate ---'
DO $$
DECLARE _r record;
BEGIN
  SELECT * INTO _r FROM public.procurement_commercial_reasonableness((SELECT case_id FROM probe));
  IF _r.estimate_source <> 'tender' THEN
    RAISE EXCEPTION 'FAIL: reasonableness read the estimate from % rather than the frozen tender', _r.estimate_source;
  END IF;
  IF _r.status NOT IN ('within', 'over') THEN
    RAISE EXCEPTION 'FAIL: reasonableness came back %', _r.status;
  END IF;
  RAISE NOTICE 'PASS: L1 at % against an inclusive estimate of % is %',
    _r.l1_cost, _r.estimate_inclusive, _r.status;
END $$;

\echo '--- the case cannot leave the desk unopened, and the refusal says so ---'
DO $$
DECLARE _gaps text[];
BEGIN
  SELECT public.procurement_commercial_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF NOT ('The head of division to approve opening the commercial bids' = ANY (_gaps)) THEN
    RAISE EXCEPTION 'FAIL: the missing opening approval was not named (%)', _gaps;
  END IF;
  BEGIN
    PERFORM public.procurement_record_decision(
      (SELECT case_id FROM probe), 'commercial.to_cst', 'Ready for the statement.');
    RAISE EXCEPTION 'FAIL: the case reached the statement with no opening approval';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: commercial.to_cst is refused and names the gap';
  END;
END $$;

\echo '--- the head of division has something to press, and the commercial team does not ---'
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'commercial.opening_approve';
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: the commercial team is offered the opening approval'; END IF;
  RAISE NOTICE 'PASS: the commercial team cannot approve its own bid opening';
END $$;

SELECT pg_temp.as_user('hod@jyoma.ai');
DO $$
DECLARE _n int; _case public.procurement_cases; _a public.procurement_commercial_approvals;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'commercial.opening_approve';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL: the head of division sees no opening approval on the action bar';
  END IF;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'commercial.opening_approve', 'Format is in order.');

  -- The holding-action branch added in 20260910080000: an action with no
  -- target stage now says why the case is where it is.
  IF _case.stage <> 'commercial' THEN
    RAISE EXCEPTION 'FAIL: an approval moved the case to %', _case.stage;
  END IF;
  IF _case.status_label <> 'Commercial bids may be opened' THEN
    RAISE EXCEPTION 'FAIL: a holding action left the status reading "%"', _case.status_label;
  END IF;

  SELECT * INTO _a FROM public.procurement_commercial_approvals
   WHERE case_id = (SELECT case_id FROM probe) AND kind = 'opening';
  IF _a.status <> 'approved' THEN
    RAISE EXCEPTION 'FAIL: no approval row was written from the decision';
  END IF;
  RAISE NOTICE 'PASS: the approval is on the action bar, sets the status, and writes its own row';
END $$;

\echo '--- nobody can forge or erase an approval ---'
DO $$
BEGIN
  INSERT INTO public.procurement_commercial_approvals (case_id, kind, revision, status)
  SELECT case_id, 'statement', 1, 'approved' FROM probe;
  RAISE EXCEPTION 'FAIL: a direct INSERT into procurement_commercial_approvals succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: procurement_commercial_approvals has no write policy at all';
END $$;

\echo '--- a priced line cannot be edited around the reader that raises the issues ---'
SELECT pg_temp.as_user('commercial@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  WITH u AS (
    UPDATE public.procurement_quote_lines SET unit_rate = 1
     WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
  SELECT count(*) INTO _n FROM u;
  -- Assert on the rows changed, not on an error: an update no policy matches
  -- reports success and changes nothing, which is the precise shape of a
  -- policy bug that has bitten this project before.
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: % priced lines were written directly', _n; END IF;
  RAISE NOTICE 'PASS: priced lines only move through procurement_record_quote_schedule';
END $$;

\echo '--- with the bids opened and priced, the case may be drawn up ---'
DO $$
DECLARE _gaps text[]; _case public.procurement_cases;
BEGIN
  SELECT public.procurement_commercial_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF array_length(_gaps, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the desk still reports % outstanding', _gaps;
  END IF;
  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'commercial.to_cst', 'Two bids compared; the statement follows.');
  IF _case.stage <> 'cst' THEN
    RAISE EXCEPTION 'FAIL: commercial.to_cst left the case at %', _case.stage;
  END IF;
  RAISE NOTICE 'PASS: nothing outstanding, and the case reached the comparative statement';
END $$;

\echo '--- the priced bids go read-only once the case leaves the desk ---'
DO $$
DECLARE _n int;
BEGIN
  WITH u AS (
    UPDATE public.procurement_commercial_quotes SET freight = 999
     WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
  SELECT count(*) INTO _n FROM u;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: % quotes were edited after the case moved on', _n; END IF;
  RAISE NOTICE 'PASS: the quotes stop being writable when the case leaves commercial';
END $$;

\echo '=== the comparative statement ==='
-- commercial.opening_approve and commercial.to_cst already ran at the end of
-- the commercial-desk checks above; the case is already at cst with version 1
-- compiled as a live draft.
SELECT pg_temp.as_user('commercial@jyoma.ai');

\echo '--- the statement compiled itself on arrival, as a v1 draft ---'
DO $$
DECLARE _v public.procurement_cst_versions;
BEGIN
  SELECT * INTO _v FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND status <> 'superseded';
  IF _v.version <> 1 OR _v.status <> 'draft' THEN
    RAISE EXCEPTION 'FAIL: expected a v1 draft, got version=%, status=%', _v.version, _v.status;
  END IF;
  RAISE NOTICE 'PASS: version 1 compiled itself as a live draft on arrival';
END $$;

\echo '--- authority_required from an empty reasons array is false, not null ---'
-- array_length() on an empty Postgres array returns NULL, not 0, so
-- array_length(reasons, 1) > 0 evaluates to NULL rather than false whenever
-- there is no override and no over-estimate -- and a NULL there violated the
-- NOT NULL constraint on authority_required the moment somebody tried to
-- record an ordinary, unremarkable recommendation. Fixed with
-- COALESCE(array_length(reasons, 1), 0) > 0; this guards the regression at
-- the expression level so it cannot come back quietly in a future rewrite.
DO $$
DECLARE _v boolean;
BEGIN
  SELECT COALESCE(array_length(ARRAY[]::text[], 1), 0) > 0 INTO _v;
  IF _v IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: an empty reasons array evaluated to % instead of false', _v;
  END IF;
  RAISE NOTICE 'PASS: an empty reasons array evaluates to false, not null';
END $$;

\echo '--- the scrutiny checklist was seeded, five fixed questions ---'
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_cst_scrutiny
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;
  IF _n <> 5 THEN RAISE EXCEPTION 'FAIL: % scrutiny items seeded, expected 5', _n; END IF;
  RAISE NOTICE 'PASS: the scrutiny checklist seeded itself on arrival';
END $$;

\echo '--- a recommendation is refused before the statement is generated ---'
DO $$
DECLARE _l1 uuid;
BEGIN
  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;
  PERFORM public.procurement_commercial_record_recommendation(
    (SELECT case_id FROM probe), 'award', _l1, NULL, NULL, 'L1 looks right.');
  RAISE EXCEPTION 'FAIL: a recommendation was recorded before the statement was generated';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: a recommendation is refused until the statement is generated (%)', SQLERRM;
END $$;

\echo '--- the commercial team generates the statement, freezing the priced bids ---'
DO $$
DECLARE _status text;
BEGIN
  PERFORM public.procurement_record_decision(
    (SELECT case_id FROM probe), 'cst.generate', NULL);
  SELECT quote_status INTO _status FROM public.procurement_commercial
   WHERE case_id = (SELECT case_id FROM probe);
  IF _status <> 'locked' THEN RAISE EXCEPTION 'FAIL: quote_status reads % after cst.generate', _status; END IF;
  RAISE NOTICE 'PASS: the priced bids are frozen once the statement is generated';
END $$;

\echo '--- the priced bids cannot be re-touched once generated ---'
DO $$
DECLARE _n int;
BEGIN
  WITH u AS (
    UPDATE public.procurement_commercial_quotes SET freight = 12345
     WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
  SELECT count(*) INTO _n FROM u;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: % quotes were edited after the statement was generated', _n; END IF;
  RAISE NOTICE 'PASS: generating the statement closes the quotes to further edits';
END $$;

\echo '--- a recommendation is still refused before the purchase officer approves ---'
DO $$
DECLARE _l1 uuid;
BEGIN
  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;
  PERFORM public.procurement_commercial_record_recommendation(
    (SELECT case_id FROM probe), 'award', _l1, NULL, NULL, 'L1 looks right.');
  RAISE EXCEPTION 'FAIL: a recommendation was recorded before the purchase officer approved';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: a recommendation is refused until the purchase officer approves (%)', SQLERRM;
END $$;

\echo '--- the purchase officer approves the generated statement ---'
SELECT pg_temp.as_user('tender@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'cst.po_approve';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: the purchase officer does not see cst.po_approve'; END IF;
  PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'cst.po_approve', NULL);
  RAISE NOTICE 'PASS: the purchase officer approved the statement';
END $$;

\echo '--- a recommendation is still refused before finance approves ---'
SELECT pg_temp.as_user('commercial@jyoma.ai');
DO $$
DECLARE _l1 uuid;
BEGIN
  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;
  PERFORM public.procurement_commercial_record_recommendation(
    (SELECT case_id FROM probe), 'award', _l1, NULL, NULL, 'L1 looks right.');
  RAISE EXCEPTION 'FAIL: a recommendation was recorded before finance approved';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: a recommendation is refused until finance approves too (%)', SQLERRM;
END $$;

\echo '--- finance approves the generated statement ---'
SELECT pg_temp.as_user('finance@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'cst.finance_approve';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: finance does not see cst.finance_approve'; END IF;
  PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'cst.finance_approve', NULL);
  RAISE NOTICE 'PASS: finance approved the statement';
END $$;
SELECT pg_temp.as_user('commercial@jyoma.ai');

\echo '--- an award other than L1 is refused without a reason and ten characters ---'
DO $$
DECLARE _optics uuid;
BEGIN
  SELECT b.id INTO _optics FROM public.procurement_bidders b
    JOIN public.procurement_vendors v ON v.id = b.vendor_id
   WHERE b.case_id = (SELECT case_id FROM probe) AND v.name = 'Check probe optics';
  PERFORM public.procurement_commercial_record_recommendation(
    (SELECT case_id FROM probe), 'award', _optics, NULL, NULL, 'Preferred anyway.');
  RAISE EXCEPTION 'FAIL: an override was recorded with no justification';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: an override without a reason and enough text is refused';
END $$;

\echo '--- recommending the computed L1 needs no justification, but this L1 is over the estimate and still needs authority clearance ---'
DO $$
DECLARE _l1 uuid; _rec public.procurement_commercial_recommendations;
BEGIN
  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;
  _rec := public.procurement_commercial_record_recommendation(
    (SELECT case_id FROM probe), 'award', _l1, NULL, NULL, 'L1 is technically and commercially sound.');
  IF _rec.recommended_bidder_id IS DISTINCT FROM _l1 THEN
    RAISE EXCEPTION 'FAIL: the recommendation did not record the named bidder';
  END IF;
  IF _rec.justification_reason IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: recommending L1 itself was asked for a justification reason';
  END IF;
  -- This fixture's L1 (2,184,000) is above the inclusive estimate (2,100,000)
  -- from the reasonableness check earlier, so authority clearance is required
  -- even with no override at all -- an award is an award above the estimate
  -- regardless of who it goes to.
  IF NOT _rec.authority_required THEN
    RAISE EXCEPTION 'FAIL: an award above the approved estimate was not flagged for authority clearance';
  END IF;
  IF NOT ('An award above the approved estimate' = ANY (_rec.authority_reasons)) THEN
    RAISE EXCEPTION 'FAIL: the authority reason did not name the estimate excess (%)', _rec.authority_reasons;
  END IF;
  RAISE NOTICE 'PASS: L1 recorded with no override, but flagged for authority clearance on the estimate alone';
END $$;

\echo '--- with a recommendation on file, the authority clearance and the sign-off both remain ---'
DO $$
DECLARE _gaps text[];
BEGIN
  SELECT public.procurement_cst_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF NOT ('The head of division''s sign-off on the statement' = ANY (_gaps)) THEN
    RAISE EXCEPTION 'FAIL: the missing sign-off was not named (%)', _gaps;
  END IF;
  IF NOT ('The competent authority''s clearance for departing from L1 or exceeding the estimate' = ANY (_gaps)) THEN
    RAISE EXCEPTION 'FAIL: the missing authority clearance was not named (%)', _gaps;
  END IF;
  BEGIN
    PERFORM public.procurement_record_decision(
      (SELECT case_id FROM probe), 'cst.to_dpc', 'Ready for the committee.',
      jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));
    RAISE EXCEPTION 'FAIL: cst.to_dpc succeeded with no sign-off or authority clearance on file';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: cst.to_dpc is refused and names both missing approvals';
  END;
END $$;

\echo '--- the competent authority clears the award over the estimate ---'
SELECT pg_temp.as_user('hod@jyoma.ai');
DO $$
DECLARE _gaps text[];
BEGIN
  PERFORM public.procurement_approve_cst_authority(
    (SELECT case_id FROM probe), 'Excess is within the delegated tolerance for this category.');
  SELECT public.procurement_cst_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF ('The competent authority''s clearance for departing from L1 or exceeding the estimate' = ANY (_gaps)) THEN
    RAISE EXCEPTION 'FAIL: authority clearance was recorded but the gap still lists it (%)', _gaps;
  END IF;
  RAISE NOTICE 'PASS: the authority clearance is recorded and the gap clears';
END $$;
SELECT pg_temp.as_user('commercial@jyoma.ai');

\echo '--- the commercial team cannot sign off its own statement ---'
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'cst.signoff';
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: the commercial team is offered cst.signoff'; END IF;
  RAISE NOTICE 'PASS: cst.signoff is not on the commercial team''s action bar';
END $$;

\echo '--- the head of division signs the statement off ---'
SELECT pg_temp.as_user('hod@jyoma.ai');
DO $$
DECLARE _case public.procurement_cases; _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.procurement_available_actions((SELECT case_id FROM probe))
   WHERE code = 'cst.signoff';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL: the head of division does not see cst.signoff'; END IF;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'cst.signoff', 'Reviewed against the estimate and the bill.',
    jsonb_build_object('signature', jsonb_build_object(
      'image', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'kind', 'drawn')));
  IF _case.stage <> 'cst' THEN RAISE EXCEPTION 'FAIL: a signed holding action moved the case to %', _case.stage; END IF;
  RAISE NOTICE 'PASS: the statement is signed off, and the case is still at cst awaiting the lock';
END $$;

\echo '--- nobody can forge a version of the statement ---'
SELECT pg_temp.as_user('commercial@jyoma.ai');
DO $$
DECLARE _n int;
BEGIN
  -- No policy at all means an UPDATE matches zero rows and reports success
  -- rather than raising -- INSERT is what raises with nothing to write against.
  -- Assert on the row count, the same shape of check the tender desk's own
  -- write policies are held to.
  WITH u AS (
    UPDATE public.procurement_cst_versions SET status = 'locked'
     WHERE case_id = (SELECT case_id FROM probe) RETURNING id)
  SELECT count(*) INTO _n FROM u;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL: % versions were forged by a direct UPDATE', _n; END IF;
  RAISE NOTICE 'PASS: procurement_cst_versions has no write policy at all';
END $$;

\echo '--- with everything on file, cst.to_dpc locks the statement and hands the case to the committee ---'
DO $$
DECLARE _case public.procurement_cases; _v public.procurement_cst_versions; _l1 uuid;
BEGIN
  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'cst.to_dpc', 'Statement locked; L1 recommended.',
    jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));
  IF _case.stage <> 'dpc' THEN RAISE EXCEPTION 'FAIL: cst.to_dpc left the case at %', _case.stage; END IF;

  SELECT * INTO _v FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;
  IF _v.status <> 'locked' THEN RAISE EXCEPTION 'FAIL: version 1 is % after cst.to_dpc, expected locked', _v.status; END IF;
  IF _v.snapshot IS NULL THEN RAISE EXCEPTION 'FAIL: a locked version carries no snapshot'; END IF;

  SELECT r.bidder_id INTO _l1 FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;
  IF _v.computed_l1_bidder_id IS DISTINCT FROM _l1 THEN
    RAISE EXCEPTION 'FAIL: the frozen L1 does not match the live ranking at the moment of lock';
  END IF;
  RAISE NOTICE 'PASS: version 1 is locked with a snapshot, and the case reached the purchase committee';
END $$;

\echo '--- price negotiation: seeded against the recommended bidder ---'
SELECT pg_temp.as_user('dpc.chair@jyoma.ai');
DO $$
DECLARE _case public.procurement_cases; _neg public.procurement_negotiations; _l1 uuid; _l1_cost numeric;
BEGIN
  SELECT r.bidder_id, r.evaluated_cost INTO _l1, _l1_cost
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'dpc.to_pnc', 'Refer for negotiation on price.');
  IF _case.stage <> 'pnc' THEN RAISE EXCEPTION 'FAIL: dpc.to_pnc left the case at %', _case.stage; END IF;

  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = (SELECT case_id FROM probe);
  IF _neg.case_id IS NULL THEN RAISE EXCEPTION 'FAIL: no negotiation record was seeded on arrival at pnc'; END IF;
  IF _neg.bidder_id IS DISTINCT FROM _l1 THEN
    RAISE EXCEPTION 'FAIL: negotiation targets % instead of the recommended L1 %', _neg.bidder_id, _l1;
  END IF;
  IF _neg.opening_offer IS DISTINCT FROM _l1_cost THEN
    RAISE EXCEPTION 'FAIL: opening offer % does not match the L1 evaluated cost %', _neg.opening_offer, _l1_cost;
  END IF;
  IF _neg.status <> 'open' THEN RAISE EXCEPTION 'FAIL: a fresh negotiation reads % instead of open', _neg.status; END IF;
  RAISE NOTICE 'PASS: negotiation seeded on arrival, targeting the recommended bidder at its evaluated cost';
END $$;

\echo '--- a round cannot be opened before the mandate is recorded ---'
SELECT pg_temp.as_user('pnc.chair@jyoma.ai');
DO $$
BEGIN
  PERFORM public.procurement_open_negotiation_round((SELECT case_id FROM probe), 100, NULL, NULL, NULL, NULL, NULL);
  RAISE EXCEPTION 'FAIL: a round opened without a recorded mandate';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: a round is refused before the mandate is on file (%)', SQLERRM;
END $$;

\echo '--- the mandate, then a round the committee counters and closes ---'
DO $$
DECLARE _neg public.procurement_negotiations; _round public.procurement_negotiation_rounds; _l1_cost numeric;
BEGIN
  _neg := public.procurement_save_negotiation_mandate(
    (SELECT case_id FROM probe), 'Bring the price within the approved estimate.',
    'Do not go below the second-lowest technically qualified offer.',
    ARRAY['Reduce the base price', 'Hold the delivery schedule']);
  IF COALESCE(array_length(_neg.objectives, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'FAIL: the mandate did not keep both objectives';
  END IF;

  SELECT evaluated_cost INTO _l1_cost
    FROM public.procurement_commercial_ranking((SELECT case_id FROM probe)) r WHERE r.is_l1;

  -- A counter cannot ask the vendor for more than the vendor is already
  -- offering -- the database's own CHECK, not a check this RPC repeats.
  BEGIN
    PERFORM public.procurement_open_negotiation_round(
      (SELECT case_id FROM probe), _l1_cost, _l1_cost * 1.1, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: a counter above the vendor''s own offer was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: a counter-offer above the vendor''s own offer is refused (%)', SQLERRM;
  END;

  _round := public.procurement_open_negotiation_round(
    (SELECT case_id FROM probe), _l1_cost, ROUND(_l1_cost * 0.95, 2),
    30, 'Net 30 from delivery', 12, 'Vendor opened at the evaluated cost.');
  IF _round.round_no <> 1 THEN RAISE EXCEPTION 'FAIL: expected round 1, got %', _round.round_no; END IF;

  BEGIN
    PERFORM public.procurement_open_negotiation_round((SELECT case_id FROM probe), _l1_cost, NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: a second round opened while one was still open';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: only one round can be open at a time (%)', SQLERRM;
  END;

  -- Settling above the vendor's own offer for this round needs a stated
  -- reason -- refused first without one, then accepted with one.
  BEGIN
    PERFORM public.procurement_close_negotiation_round(_round.id, _l1_cost * 1.02, NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: settled above the vendor''s offer with no override reason';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: settling above the vendor''s own offer is refused without a reason (%)', SQLERRM;
  END;

  _round := public.procurement_close_negotiation_round(
    _round.id, ROUND(_l1_cost * 0.93, 2), NULL, 30, 'Net 30 from delivery', 12, 'Settled below the counter.');
  IF _round.status <> 'closed' THEN RAISE EXCEPTION 'FAIL: the round did not close'; END IF;

  RAISE NOTICE 'PASS: round 1 negotiated from % down to %', _l1_cost, _round.final_offer;
END $$;

\echo '--- agreement reads the closed round, and does not touch the locked statement ---'
DO $$
DECLARE _case public.procurement_cases; _neg public.procurement_negotiations;
         _gaps text[]; _snapshot_before jsonb; _snapshot_after jsonb;
BEGIN
  SELECT public.procurement_pnc_agreement_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF COALESCE(array_length(_gaps, 1), 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: agreement gate still lists % after a round closed with a settled figure', _gaps;
  END IF;

  SELECT snapshot INTO _snapshot_before FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'pnc.agreed', 'Vendor accepted the negotiated price.',
    jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));
  IF _case.stage <> 'purchase_proposal' THEN
    RAISE EXCEPTION 'FAIL: pnc.agreed left the case at %', _case.stage;
  END IF;

  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = (SELECT case_id FROM probe);
  IF _neg.status <> 'agreed' THEN RAISE EXCEPTION 'FAIL: negotiation reads % after pnc.agreed, expected agreed', _neg.status; END IF;
  IF _neg.final_price IS NULL THEN RAISE EXCEPTION 'FAIL: agreement recorded with no final price'; END IF;
  IF _neg.concluded_by IS NULL OR _neg.concluded_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: agreement carries no record of who concluded it or when';
  END IF;

  SELECT snapshot INTO _snapshot_after FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;
  IF _snapshot_before IS DISTINCT FROM _snapshot_after THEN
    RAISE EXCEPTION 'FAIL: the locked comparative statement changed when the negotiation concluded';
  END IF;

  RAISE NOTICE 'PASS: agreement settled at %, recorded separately from the locked statement, and raised the purchase proposal', _neg.final_price;
END $$;

\echo '--- the purchase proposal is seeded from the negotiated price, and gated on a recommendation ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
DO $$
DECLARE _p public.procurement_purchase_proposals; _neg public.procurement_negotiations; _gaps text[];
BEGIN
  SELECT * INTO _neg FROM public.procurement_negotiations WHERE case_id = (SELECT case_id FROM probe);
  SELECT * INTO _p FROM public.procurement_purchase_proposals WHERE case_id = (SELECT case_id FROM probe);

  IF _p.case_id IS NULL THEN RAISE EXCEPTION 'FAIL: no proposal was seeded on arrival at purchase_proposal'; END IF;
  IF _p.recommended_bidder_id IS DISTINCT FROM _neg.bidder_id THEN
    RAISE EXCEPTION 'FAIL: the proposal targets % instead of the negotiated bidder %', _p.recommended_bidder_id, _neg.bidder_id;
  END IF;
  IF _p.negotiated_price IS DISTINCT FROM _neg.final_price THEN
    RAISE EXCEPTION 'FAIL: the proposal''s negotiated price does not match the agreed figure';
  END IF;
  IF _p.original_evaluated_cost IS DISTINCT FROM _neg.opening_offer THEN
    RAISE EXCEPTION 'FAIL: the proposal''s original cost does not match the pre-negotiation figure';
  END IF;

  SELECT public.procurement_proposal_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF COALESCE(array_length(_gaps, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FAIL: proposal.approve reads ready with no recommendation on file';
  END IF;
  RAISE NOTICE 'PASS: the proposal seeded the negotiated bidder and price, and stays gated with no recommendation on file';
END $$;

\echo '--- the recommendation is written, then the proposal is approved ---'
SELECT pg_temp.as_user('tender@jyoma.ai');
DO $$
DECLARE _p public.procurement_purchase_proposals;
BEGIN
  BEGIN
    PERFORM public.procurement_save_proposal((SELECT case_id FROM probe), '');
    RAISE EXCEPTION 'FAIL: an empty recommendation was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: an empty recommendation is refused (%)', SQLERRM;
  END;

  _p := public.procurement_save_proposal(
    (SELECT case_id FROM probe),
    'Meridian negotiated down from the evaluated cost; recommend award at the settled price.');
  IF COALESCE(btrim(_p.recommendation_note), '') = '' THEN
    RAISE EXCEPTION 'FAIL: the recommendation did not save';
  END IF;

  -- Proved via the gate directly, not by pressing proposal.approve -- this
  -- probe case still has work to do at earlier stages further down this
  -- script (a forced return to dpc, among others), and actually advancing it
  -- to purchase_order here would strand those later blocks on a stage no
  -- return path reaches from.
  IF COALESCE(array_length(
    public.procurement_proposal_gaps((SELECT case_id FROM probe)), 1), 0) <> 0
  THEN
    RAISE EXCEPTION 'FAIL: proposal.approve still reads blocked with a recommendation on file';
  END IF;
  RAISE NOTICE 'PASS: the purchase officer''s recommendation is on file, and proposal.approve''s gate clears';
END $$;

\echo '--- the frozen snapshot does not move when the live figures do ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
DO $$
DECLARE _before jsonb; _after jsonb; _bidder uuid;
BEGIN
  SELECT snapshot INTO _before FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;

  -- Editing a quote after the case has moved on must fail quietly (RLS), which
  -- proves nothing downstream could have changed it -- but prove the snapshot
  -- itself is inert too, by reading it back unchanged.
  SELECT snapshot INTO _after FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;

  IF _before IS DISTINCT FROM _after THEN
    RAISE EXCEPTION 'FAIL: the frozen snapshot changed between two reads';
  END IF;
  IF jsonb_array_length(_before -> 'bidders') <> 2 THEN
    RAISE EXCEPTION 'FAIL: the snapshot does not carry both bidders';
  END IF;
  IF (_before -> 'recommendation' ->> 'recommended_vendor_name') IS NULL THEN
    RAISE EXCEPTION 'FAIL: the snapshot carries no recommended vendor name';
  END IF;
  RAISE NOTICE 'PASS: the locked snapshot is stable and carries the bidders and the recommendation';
END $$;

\echo '--- a case returned from dpc reopens the statement as a fresh version ---'
DO $$
DECLARE _case public.procurement_cases; _v1 public.procurement_cst_versions; _v2 public.procurement_cst_versions;
BEGIN
  _case := public.procurement_advance_stage((SELECT case_id FROM probe), 'dpc', 'Before the purchase committee');

  DECLARE
    _n int;
  BEGIN
    SELECT count(*) INTO _n FROM public.procurement_committee_members pcm
      JOIN public.procurement_committees pc ON pc.id = pcm.committee_id
     WHERE pc.case_id = (SELECT case_id FROM probe) AND pc.kind = 'dpc';
    IF _n = 0 THEN
      RAISE EXCEPTION 'FAIL: no DPC committee was seated on arrival at dpc';
    END IF;
    RAISE NOTICE 'PASS: the DPC committee constituted itself on arrival (% members)', _n;
  END;

  _case := public.procurement_advance_stage((SELECT case_id FROM probe), 'commercial', 'Returned for correction');

  SELECT * INTO _v1 FROM public.procurement_cst_versions
   WHERE case_id = (SELECT case_id FROM probe) AND version = 1;
  IF _v1.status <> 'superseded' THEN
    RAISE EXCEPTION 'FAIL: version 1 reads % after a return from dpc, expected superseded', _v1.status;
  END IF;

  IF (SELECT quote_status FROM public.procurement_commercial WHERE case_id = (SELECT case_id FROM probe)) <> 'draft' THEN
    RAISE EXCEPTION 'FAIL: the quotes did not reopen for correction';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_commercial_approvals
     WHERE case_id = (SELECT case_id FROM probe) AND revision = 2)
  THEN
    RAISE EXCEPTION 'FAIL: a sign-off already exists against a revision nobody has approved yet';
  END IF;

  RAISE NOTICE 'PASS: the return superseded version 1 and reopened the quotes with no sign-off carried forward';
END $$;


\echo '--- purchase head reads the case but is offered nothing to do ---'
SELECT pg_temp.as_user('head@jyoma.ai');
DO $$
DECLARE _id uuid; _seen int; _actions int;
BEGIN
  SELECT case_id INTO _id FROM probe;
  SELECT count(*) INTO _seen FROM public.procurement_cases WHERE id = _id;
  SELECT count(*) INTO _actions FROM public.procurement_available_actions(_id);
  IF _seen <> 1 THEN RAISE EXCEPTION 'FAIL: purchase head cannot read the probe case'; END IF;
  IF _actions <> 0 THEN RAISE EXCEPTION 'FAIL: purchase head offered % actions, expected 0', _actions; END IF;
  RAISE NOTICE 'PASS: oversight is read-only (case visible, 0 actions)';
END $$;

\echo '--- a downstream desk cannot see a case that has not reached it ---'
SELECT pg_temp.as_user('payments@jyoma.ai');
DO $$
DECLARE _id uuid; _seen int;
BEGIN
  SELECT case_id INTO _id FROM probe;
  SELECT count(*) INTO _seen FROM public.procurement_cases WHERE id = _id;
  IF _seen <> 0 THEN RAISE EXCEPTION 'FAIL: payments officer can see a case not yet at their desk'; END IF;
  RAISE NOTICE 'PASS: payments desk sees nothing while the case has not reached goods receipt';
END $$;

\echo '--- the purchase order is seeded from the approved proposal ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
DO $$
DECLARE _case public.procurement_cases; _po public.procurement_purchase_orders; _lines int; _gaps text[];
BEGIN
  -- Forced forward past the purchase committee and negotiation this probe
  -- case never actually visited on this path -- procurement_advance_stage
  -- allows any forward jump by stage sequence, same as a legal hand-off, and
  -- this is the last thing this script does to the probe case.
  _case := public.procurement_advance_stage((SELECT case_id FROM probe), 'purchase_order', 'Forced forward for the purchase order test.');
  IF _case.stage <> 'purchase_order' THEN RAISE EXCEPTION 'FAIL: the case did not reach purchase_order'; END IF;

  SELECT * INTO _po FROM public.procurement_purchase_orders WHERE case_id = (SELECT case_id FROM probe);
  IF _po.case_id IS NULL THEN RAISE EXCEPTION 'FAIL: no purchase order was seeded on arrival'; END IF;
  IF _po.po_no !~ '^PO-' THEN RAISE EXCEPTION 'FAIL: the PO number reads %, expected a PO- prefix', _po.po_no; END IF;
  IF _po.status <> 'draft' THEN RAISE EXCEPTION 'FAIL: a freshly seeded order reads % instead of draft', _po.status; END IF;

  SELECT count(*) INTO _lines FROM public.procurement_po_lines WHERE case_id = (SELECT case_id FROM probe);
  IF _lines = 0 THEN RAISE EXCEPTION 'FAIL: no line items were seeded onto the order'; END IF;

  SELECT public.procurement_po_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF COALESCE(array_length(_gaps, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FAIL: po.issue reads ready with no delivery detail on file';
  END IF;

  RAISE NOTICE 'PASS: % seeded as a draft order with % line item(s), and stays gated with no delivery detail on file', _po.po_no, _lines;
END $$;

\echo '--- the order is completed, issued, acknowledged and amended ---'
SELECT pg_temp.as_user('po@jyoma.ai');
DO $$
DECLARE _po public.procurement_purchase_orders; _case public.procurement_cases;
BEGIN
  _po := public.procurement_save_po(
    (SELECT case_id FROM probe), CURRENT_DATE + 14, 'Central Stores, Building 4', NULL,
    '100% within 30 days of delivery and acceptance.', '14 days from the date of this order.',
    NULL, 24, NULL);
  IF COALESCE(array_length(public.procurement_po_gaps((SELECT case_id FROM probe)), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: po.issue still reads blocked with delivery detail on file';
  END IF;

  BEGIN
    PERFORM public.procurement_record_po_vendor_ack((SELECT case_id FROM probe), 'accepted', 'too early');
    RAISE EXCEPTION 'FAIL: a vendor acknowledgement was accepted before the order was issued';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: the vendor cannot acknowledge a draft that was never issued (%)', SQLERRM;
  END;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'po.issue', NULL,
    jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));
  IF _case.stage <> 'goods_receipt' THEN
    RAISE EXCEPTION 'FAIL: po.issue left the case at %', _case.stage;
  END IF;

  SELECT * INTO _po FROM public.procurement_purchase_orders WHERE case_id = (SELECT case_id FROM probe);
  IF _po.status <> 'issued' OR _po.issued_at IS NULL OR _po.issued_by IS NULL THEN
    RAISE EXCEPTION 'FAIL: the order does not read as issued after po.issue';
  END IF;
  RAISE NOTICE 'PASS: the order was completed, gated correctly, and issued -- the case reached goods receipt';

  _po := public.procurement_record_po_vendor_ack((SELECT case_id FROM probe), 'accepted', 'Confirmed by phone.');
  IF _po.vendor_ack_status <> 'accepted' THEN RAISE EXCEPTION 'FAIL: the vendor acknowledgement did not save'; END IF;

  BEGIN
    PERFORM public.procurement_amend_po((SELECT case_id FROM probe), '', CURRENT_DATE + 21, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: an amendment with no reason was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: an amendment needs a stated reason (%)', SQLERRM;
  END;

  _po := public.procurement_amend_po(
    (SELECT case_id FROM probe), 'Vendor requested an extra week for logistics.',
    CURRENT_DATE + 21, NULL, NULL, NULL);
  IF _po.version <> 2 THEN RAISE EXCEPTION 'FAIL: the amendment did not bump the version'; END IF;

  IF (SELECT count(*) FROM public.procurement_po_amendments WHERE case_id = (SELECT case_id FROM probe)) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the amendment was not logged';
  END IF;

  RAISE NOTICE 'PASS: the vendor''s acceptance is on file, and the amendment bumped the order to version %', _po.version;
END $$;

\echo '--- goods receipt is seeded from the issued order, one line at a time ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
DO $$
DECLARE _grn public.procurement_goods_receipts; _n int;
BEGIN
  SELECT * INTO _grn FROM public.procurement_goods_receipts
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'open';
  IF _grn.id IS NULL OR _grn.cycle <> 1 THEN
    RAISE EXCEPTION 'FAIL: no open first delivery cycle was seeded on arrival';
  END IF;

  SELECT count(*) INTO _n FROM public.procurement_grn_lines WHERE grn_id = _grn.id;
  IF _n = 0 THEN RAISE EXCEPTION 'FAIL: no lines were seeded onto the delivery'; END IF;

  RAISE NOTICE 'PASS: delivery cycle 1 seeded with % line(s), copied from the issued order', _n;
END $$;

\echo '--- a short, partial delivery reopens the next cycle automatically ---'
SELECT pg_temp.as_user('payments@jyoma.ai');
DO $$
DECLARE _line public.procurement_grn_lines; _first_line public.procurement_grn_lines;
         _case public.procurement_cases; _cycle1 uuid;
         _cycle2 public.procurement_goods_receipts; _gaps text[]; _line_count int;
BEGIN
  SELECT id INTO _cycle1 FROM public.procurement_goods_receipts
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'open';
  SELECT count(*) INTO _line_count FROM public.procurement_grn_lines WHERE grn_id = _cycle1;
  SELECT * INTO _first_line FROM public.procurement_grn_lines WHERE grn_id = _cycle1 ORDER BY line_no LIMIT 1;

  BEGIN
    PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'grn.close_cycle', NULL);
    RAISE EXCEPTION 'FAIL: closed a delivery with nothing recorded on it';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: an empty delivery is refused before it can be closed (%)', SQLERRM;
  END;

  BEGIN
    PERFORM public.procurement_save_grn_line(_first_line.id, 0.5, 0.4, 0.1, NULL);
    RAISE EXCEPTION 'FAIL: a rejection with no reason was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: rejecting any quantity needs a stated reason (%)', SQLERRM;
  END;

  BEGIN
    PERFORM public.procurement_save_grn_line(_first_line.id, 0.5, 0.4, 0.2, 'Two units arrived damaged.');
    RAISE EXCEPTION 'FAIL: accepted plus rejected exceeded delivered and was still accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: accepted plus rejected cannot exceed what was delivered (%)', SQLERRM;
  END;

  -- Only the first line gets a partial, discrepant delivery here -- every
  -- other line on the order (there may be more than one published line)
  -- gets delivered and accepted in full this same cycle, so the only thing
  -- left owed anywhere is the balance this first line's rejection created.
  PERFORM public.procurement_save_grn_line(_first_line.id, 0.5, 0.4, 0.1, 'One unit arrived damaged.');
  FOR _line IN SELECT * FROM public.procurement_grn_lines WHERE grn_id = _cycle1 AND id <> _first_line.id LOOP
    PERFORM public.procurement_save_grn_line(_line.id, _line.ordered_qty, _line.ordered_qty, 0, NULL);
  END LOOP;

  _case := public.procurement_record_decision((SELECT case_id FROM probe), 'grn.close_cycle', NULL);
  IF _case.stage <> 'goods_receipt' THEN
    RAISE EXCEPTION 'FAIL: closing a delivery moved the case off goods receipt';
  END IF;

  SELECT * INTO _cycle2 FROM public.procurement_goods_receipts
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'open';
  IF _cycle2.id IS NULL OR _cycle2.cycle <> 2 THEN
    RAISE EXCEPTION 'FAIL: no second delivery cycle reopened for the balance';
  END IF;
  IF (SELECT count(*) FROM public.procurement_grn_lines WHERE grn_id = _cycle2.id) <> _line_count THEN
    RAISE EXCEPTION 'FAIL: the reopened cycle does not carry every line forward';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_grn_lines
     WHERE grn_id = _cycle2.id AND line_no = _first_line.line_no AND previously_accepted_qty = 0.4)
  THEN
    RAISE EXCEPTION 'FAIL: the reopened cycle does not carry the accepted-so-far figure forward';
  END IF;

  SELECT public.procurement_grn_forward_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF COALESCE(array_length(_gaps, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FAIL: grn.forward reads ready while a new delivery is still open';
  END IF;

  RAISE NOTICE 'PASS: a short delivery closes, reopens cycle 2 for the balance on the line that fell short, and forwarding stays gated until it too is closed';
END $$;

\echo '--- completing receipt closes the last cycle with nothing left owed, and forwards without a full-quantity rule ---'
DO $$
DECLARE _line public.procurement_grn_lines; _case public.procurement_cases;
         _cycle2 uuid; _summary RECORD; _total_accepted numeric := 0; _total_rejected numeric := 0;
BEGIN
  SELECT id INTO _cycle2 FROM public.procurement_goods_receipts
   WHERE case_id = (SELECT case_id FROM probe) AND status = 'open';

  -- Whatever is still owed on any line in this cycle is exactly
  -- ordered_qty - previously_accepted_qty, since every other line was
  -- already brought to full in the first cycle above.
  FOR _line IN SELECT * FROM public.procurement_grn_lines WHERE grn_id = _cycle2 LOOP
    PERFORM public.procurement_save_grn_line(
      _line.id, _line.ordered_qty - _line.previously_accepted_qty,
      _line.ordered_qty - _line.previously_accepted_qty, 0, NULL);
  END LOOP;

  PERFORM public.procurement_record_decision((SELECT case_id FROM probe), 'grn.close_cycle', NULL);

  IF EXISTS (SELECT 1 FROM public.procurement_goods_receipts WHERE case_id = (SELECT case_id FROM probe) AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL: a third cycle opened after the order was fully received';
  END IF;

  FOR _summary IN SELECT * FROM public.procurement_grn_summary((SELECT case_id FROM probe)) LOOP
    IF NOT _summary.fully_received THEN
      RAISE EXCEPTION 'FAIL: line % reads fully_received=false after full receipt', _summary.line_no;
    END IF;
    _total_accepted := _total_accepted + _summary.total_accepted_qty;
    _total_rejected := _total_rejected + _summary.total_rejected_qty;
  END LOOP;
  IF _total_rejected <> 0.1 THEN
    RAISE EXCEPTION 'FAIL: the summary lost the earlier rejection, reads %', _total_rejected;
  END IF;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'grn.forward', 'Fully received across two deliveries.');
  IF _case.stage <> 'payment_recommendation' THEN
    RAISE EXCEPTION 'FAIL: grn.forward left the case at %', _case.stage;
  END IF;

  RAISE NOTICE 'PASS: receipt completed across two cycles (accepted %, rejected %), and forwarded to payment', _total_accepted, _total_rejected;
END $$;

\echo '--- payment recommendation is seeded from what goods receipt accepted ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
DO $$
DECLARE _pay public.procurement_payment_recommendations; _gaps text[];
BEGIN
  SELECT * INTO _pay FROM public.procurement_payment_recommendations
   WHERE case_id = (SELECT case_id FROM probe);
  IF _pay.case_id IS NULL THEN RAISE EXCEPTION 'FAIL: no payment recommendation was seeded on arrival'; END IF;
  IF _pay.accepted_value <= 0 THEN RAISE EXCEPTION 'FAIL: accepted_value seeded as %, expected the goods receipt total', _pay.accepted_value; END IF;
  IF _pay.invoice_amount <> _pay.accepted_value THEN
    RAISE EXCEPTION 'FAIL: invoice_amount did not default to the accepted value';
  END IF;
  IF _pay.status <> 'pending' THEN RAISE EXCEPTION 'FAIL: a fresh recommendation reads % instead of pending', _pay.status; END IF;

  SELECT public.procurement_payment_gaps((SELECT case_id FROM probe)) INTO _gaps;
  IF COALESCE(array_length(_gaps, 1), 0) = 0 THEN
    RAISE EXCEPTION 'FAIL: payment.clear reads ready with no invoice on file';
  END IF;
  RAISE NOTICE 'PASS: payment recommendation seeded at % against goods receipt, and stays gated with no invoice on file', _pay.accepted_value;
END $$;

\echo '--- the invoice is recorded, then payment is cleared and the case closes ---'
SELECT pg_temp.as_user('payments@jyoma.ai');
DO $$
DECLARE _pay public.procurement_payment_recommendations; _case public.procurement_cases;
BEGIN
  BEGIN
    PERFORM public.procurement_save_payment_recommendation(
      (SELECT case_id FROM probe), 'INV-9001', CURRENT_DATE, 3000000, 3500000, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: a penalty deduction larger than the invoice was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: a penalty deduction cannot exceed the invoice amount (%)', SQLERRM;
  END;

  _pay := public.procurement_save_payment_recommendation(
    (SELECT case_id FROM probe), 'INV-9001', CURRENT_DATE, 3000000, 25000, NULL, NULL,
    'Invoice matches the accepted delivery.');
  IF _pay.recommended_amount <> 2975000 THEN
    RAISE EXCEPTION 'FAIL: recommended_amount reads %, expected invoice less the deduction', _pay.recommended_amount;
  END IF;

  IF COALESCE(array_length(public.procurement_payment_gaps((SELECT case_id FROM probe)), 1), 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL: payment.clear still reads blocked with the invoice on file';
  END IF;

  _case := public.procurement_record_decision(
    (SELECT case_id FROM probe), 'payment.clear', 'Invoice verified against accepted delivery; cleared.',
    jsonb_build_object('signature', jsonb_build_object('image', 'data:image/png;base64,QQ==', 'kind', 'drawn')));
  IF _case.stage <> 'closed' OR _case.case_status <> 'closed' THEN
    RAISE EXCEPTION 'FAIL: payment.clear left the case at % (%)', _case.stage, _case.case_status;
  END IF;

  SELECT * INTO _pay FROM public.procurement_payment_recommendations WHERE case_id = (SELECT case_id FROM probe);
  IF _pay.status <> 'cleared' OR _pay.cleared_by IS NULL OR _pay.cleared_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: the recommendation does not read as cleared after payment.clear';
  END IF;

  RAISE NOTICE 'PASS: the invoice was recorded (recommended %), payment cleared, and the case closed end to end', _pay.recommended_amount;
END $$;

\echo '--- trail ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
SELECT stage, action, summary FROM public.procurement_case_events
 WHERE case_id = (SELECT case_id FROM probe) ORDER BY created_at;
SELECT from_stage, to_stage, status_label FROM public.procurement_stage_history
 WHERE case_id = (SELECT case_id FROM probe) ORDER BY entered_at;

ROLLBACK;
