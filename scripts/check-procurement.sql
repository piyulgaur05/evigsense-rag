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
  IF _seen <> 0 THEN RAISE EXCEPTION 'FAIL: payments officer can see a case still at tender'; END IF;
  RAISE NOTICE 'PASS: payments desk sees nothing while the case is at tender';
END $$;

\echo '--- trail ---'
SELECT pg_temp.as_user('admin@jyoma.ai');
SELECT stage, action, summary FROM public.procurement_case_events
 WHERE case_id = (SELECT case_id FROM probe) ORDER BY created_at;
SELECT from_stage, to_stage, status_label FROM public.procurement_stage_history
 WHERE case_id = (SELECT case_id FROM probe) ORDER BY entered_at;

ROLLBACK;
