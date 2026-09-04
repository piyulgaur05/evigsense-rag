-- Give case_no a column default as well as the trigger.
--
-- The trigger alone left case_no looking required to the generated TypeScript
-- types, so every client insert had to invent a number the database was about
-- to replace. The default settles that; the trigger stays as the guard for an
-- explicit NULL, which a default does not cover.
ALTER TABLE public.procurement_cases
  ALTER COLUMN case_no SET DEFAULT public.procurement_next_ref('PC');
