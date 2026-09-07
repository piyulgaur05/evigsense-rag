-- Generating the order as a PDF needs to say who signed it, not just show the
-- ink. procurement_case_signatures carries the mark and the signer's id;
-- resolving that id to a name is exactly the join procurement_case_activity
-- already does for the timeline, and the role each signer held is already
-- sitting on the matching procurement_case_events row (procurement_log_event
-- snapshots the actor's role at the moment they acted) -- more honest than
-- re-reading their current role, which can have changed since.

CREATE OR REPLACE FUNCTION public.procurement_case_signatures_named(_case_id UUID)
RETURNS TABLE (
  id          UUID,
  action_code TEXT,
  stage       procurement_stage,
  signer_id   UUID,
  signer_name TEXT,
  signer_role TEXT,
  image       TEXT,
  kind        TEXT,
  signed_at   TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH named AS (
    SELECT p.id, COALESCE(NULLIF(btrim(p.display_name), ''), p.email) AS name
      FROM public.profiles p
  )
  SELECT s.id, s.action_code, s.stage, s.signer_id,
         COALESCE(n.name, 'Name not recorded'),
         e.actor_role::TEXT,
         s.image, s.kind, s.signed_at
    FROM public.procurement_case_signatures s
    LEFT JOIN named n ON n.id = s.signer_id
    LEFT JOIN public.procurement_case_events e
           ON e.case_id = s.case_id AND (e.details ->> 'signature_id')::uuid = s.id
   WHERE s.case_id = _case_id
     AND public.procurement_can_view_case(auth.uid(), _case_id)
   ORDER BY s.signed_at;
$$;

GRANT EXECUTE ON FUNCTION public.procurement_case_signatures_named(UUID) TO authenticated;
