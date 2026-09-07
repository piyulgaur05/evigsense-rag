-- The same problem TEC had before 20260909090000, now hit at the purchase
-- committee: dpc.chair holds the dpc.chair permission, presses nothing wrong,
-- and sees an empty action bar anyway, because chair-only actions also check
-- is_procurement_committee_chair() -- which reads an actual
-- procurement_committees row, and nothing has ever created one outside a
-- manual psql step (PROCUREMENT.md §10.4). A held permission and an empty
-- action bar are indistinguishable from a broken engine.
--
-- TEC stopped depending on that manual step once it became the first
-- committee stage this product drove entirely through its own screens. DPC
-- and PNC are now the same kind of stage -- a case reaches them and a human
-- is expected to act from the portal alone -- so they get the identical
-- treatment: a one-cycle committee seeded the moment a case arrives, from
-- whoever holds the chair and member roles org-wide. Case-specific
-- committee rostering is still not built (the same real limit TEC's own
-- migration named), but a chair who cannot press a button because nobody
-- ran SQL for them is a worse failure than a committee slightly too broad.

-- ===== DPC =====

CREATE OR REPLACE FUNCTION public.procurement_dpc_constitute_committee(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _committee_id UUID;
BEGIN
  INSERT INTO public.procurement_committees (case_id, kind, cycle, name)
  VALUES (_case_id, 'dpc', 1, 'Divisional Purchase Committee')
  ON CONFLICT (case_id, kind, cycle) DO NOTHING;

  SELECT id INTO _committee_id
    FROM public.procurement_committees
   WHERE case_id = _case_id AND kind = 'dpc' AND cycle = 1;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, true
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'dpc_chairman'
  ON CONFLICT (committee_id, user_id) DO NOTHING;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, false
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'dpc_member'
  ON CONFLICT (committee_id, user_id) DO NOTHING;
END;
$$;

-- ===== PNC =====

CREATE OR REPLACE FUNCTION public.procurement_pnc_constitute_committee(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _committee_id UUID;
BEGIN
  INSERT INTO public.procurement_committees (case_id, kind, cycle, name)
  VALUES (_case_id, 'pnc', 1, 'Price Negotiation Committee')
  ON CONFLICT (case_id, kind, cycle) DO NOTHING;

  SELECT id INTO _committee_id
    FROM public.procurement_committees
   WHERE case_id = _case_id AND kind = 'pnc' AND cycle = 1;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, true
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'pnc_chairman'
  ON CONFLICT (committee_id, user_id) DO NOTHING;

  INSERT INTO public.procurement_committee_members (committee_id, user_id, is_chair)
  SELECT _committee_id, ur.user_id, false
    FROM public.procurement_user_roles ur
   WHERE ur.role = 'pnc_member'
  ON CONFLICT (committee_id, user_id) DO NOTHING;
END;
$$;

-- ===== One trigger, both stages =====
--
-- AFTER UPDATE OF stage on the case, same as every other seed-on-entry
-- trigger in this schema, because procurement_advance_stage is the only
-- thing that writes cases.stage -- so this catches every route in, including
-- dpc.to_pnc, pnc.return, and an administrator moving a case by hand.
CREATE OR REPLACE FUNCTION public.procurement_committee_seed_on_entry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage = 'dpc' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    PERFORM public.procurement_dpc_constitute_committee(NEW.id);
  ELSIF NEW.stage = 'pnc' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    PERFORM public.procurement_pnc_constitute_committee(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_committee_seed ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_committee_seed
  AFTER UPDATE OF stage ON public.procurement_cases
  FOR EACH ROW EXECUTE FUNCTION public.procurement_committee_seed_on_entry();

-- Backfill: a case already sitting at dpc or pnc did not fire the trigger
-- above and should not have to bounce out and back in to get a committee.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'dpc'::procurement_stage LOOP
    PERFORM public.procurement_dpc_constitute_committee(c.id);
  END LOOP;
  FOR c IN SELECT id FROM public.procurement_cases WHERE stage = 'pnc'::procurement_stage LOOP
    PERFORM public.procurement_pnc_constitute_committee(c.id);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.procurement_dpc_constitute_committee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_pnc_constitute_committee(UUID) TO authenticated;
