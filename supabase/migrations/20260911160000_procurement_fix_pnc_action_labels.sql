-- Every em dash seeded by the foundation migration came out as a literal '?'
-- (ascii 63, confirmed by inspecting the stored character directly rather
-- than just how it renders) in this database: pnc.agreed and pnc.failed's
-- labels, pnc.failed's entry_status, and the three cost-centre lookup names.
-- The source file's own INSERT statements already carry a proper em dash
-- (20260903120000_procurement_foundation.sql:964,968,969,1012-1014), so
-- nothing here was ever a typo in that file. The actual cause: bootstrap.ps1
-- piped every migration's text down a PowerShell pipeline into `docker exec
-- -i`'s stdin, and Windows PowerShell 5.1 re-encodes anything sent down a
-- pipeline using the console's own output encoding rather than UTF-8 --
-- silently mangling any non-ASCII character in the process. Fixed at the
-- root in bootstrap.ps1 (migrations now go in via `docker cp`, not a pipe);
-- this migration repairs the rows it already damaged.

UPDATE public.procurement_stage_actions
   SET label = 'Conclude — agreement reached'
 WHERE code = 'pnc.agreed' AND label <> 'Conclude — agreement reached';

UPDATE public.procurement_stage_actions
   SET label = 'Close — negotiation failed'
 WHERE code = 'pnc.failed' AND label <> 'Close — negotiation failed';

UPDATE public.procurement_stage_actions
   SET entry_status = 'Closed — negotiation failed'
 WHERE code = 'pnc.failed' AND entry_status <> 'Closed — negotiation failed';

UPDATE public.procurement_lookups
   SET name = 'CC-1001 — Laboratory'
 WHERE kind = 'cost_centre' AND name <> 'CC-1001 — Laboratory' AND name LIKE 'CC-1001%';

UPDATE public.procurement_lookups
   SET name = 'CC-1002 — Workshop'
 WHERE kind = 'cost_centre' AND name <> 'CC-1002 — Workshop' AND name LIKE 'CC-1002%';

UPDATE public.procurement_lookups
   SET name = 'CC-1003 — Site Office'
 WHERE kind = 'cost_centre' AND name <> 'CC-1003 — Site Office' AND name LIKE 'CC-1003%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.procurement_stage_actions
     WHERE code IN ('pnc.agreed', 'pnc.failed')
       AND (label LIKE '%?%' OR entry_status LIKE '%?%'))
     OR EXISTS (
    SELECT 1 FROM public.procurement_lookups
     WHERE kind = 'cost_centre' AND name LIKE '%?%')
  THEN
    RAISE EXCEPTION 'a corrupted character survives the fix';
  END IF;
END $$;
