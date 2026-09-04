-- "Waiting on you" — the one worklist that replaces a queue screen per stage.
--
-- Also folds the stage -> committee-kind mapping into a helper, which the
-- chair-only check needed in three separate places.

CREATE OR REPLACE FUNCTION public.procurement_committee_kind_for_stage(_stage procurement_stage)
RETURNS procurement_committee_kind LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
  SELECT CASE _stage
           WHEN 'tec' THEN 'tec'::procurement_committee_kind
           WHEN 'dpc' THEN 'dpc'::procurement_committee_kind
           WHEN 'pnc' THEN 'pnc'::procurement_committee_kind
         END
$$;

-- True when this user may take this action on this case: holds the permission,
-- and is the chairperson where the action is reserved to the chair.
CREATE OR REPLACE FUNCTION public.procurement_may_take_action(
  _user_id UUID, _case_id UUID, _stage procurement_stage, _action public.procurement_stage_actions
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_procurement_permission(_user_id, _action.permission)
     AND (
       NOT _action.chair_only
       OR public.has_procurement_role(_user_id, 'proc_admin')
       OR public.is_procurement_committee_chair(
            _user_id, _case_id, public.procurement_committee_kind_for_stage(_stage))
     )
$$;

CREATE OR REPLACE FUNCTION public.procurement_available_actions(_case_id UUID)
RETURNS SETOF public.procurement_stage_actions
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.*
  FROM public.procurement_stage_actions a
  JOIN public.procurement_cases c ON c.stage = a.stage
  WHERE c.id = _case_id
    AND c.case_status = 'open'
    AND public.procurement_may_take_action(auth.uid(), _case_id, c.stage, a.*)
  ORDER BY a.sort_order, a.label
$$;

-- Open cases sitting at a stage this user can act on, oldest first: the ones
-- holding up somebody else are the ones worth showing at the top.
CREATE OR REPLACE FUNCTION public.procurement_my_worklist()
RETURNS SETOF public.procurement_cases
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.*
  FROM public.procurement_cases c
  WHERE c.case_status = 'open'
    AND public.procurement_can_view_case(auth.uid(), c.id)
    AND EXISTS (
      SELECT 1
      FROM public.procurement_stage_actions a
      WHERE a.stage = c.stage
        AND public.procurement_may_take_action(auth.uid(), c.id, c.stage, a.*)
    )
  ORDER BY c.updated_at ASC
$$;
