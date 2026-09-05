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
-- Expect four PASS notices and no ERROR lines.

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
SELECT stage, status_label FROM public.procurement_record_decision(
  (SELECT case_id FROM probe), 'finance.clear', 'Budget head has headroom.');

\echo '--- an illegal jump backwards is refused ---'
DO $$
BEGIN
  PERFORM public.procurement_advance_stage((SELECT case_id FROM probe), 'draft');
  RAISE EXCEPTION 'FAIL: tender -> draft was allowed';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS: backward jump refused (%)', SQLERRM;
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
