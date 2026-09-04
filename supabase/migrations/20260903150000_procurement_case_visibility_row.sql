-- Make the case read policy judge the row in front of it.
--
-- procurement_can_view_case() took a case id and looked the row up again. That
-- is fine from a child table, but on procurement_cases itself it broke
-- INSERT ... RETURNING: the row being inserted is not visible to a sub-select
-- in the same statement, so the lookup found nothing, the SELECT policy came
-- back false, and every insert that asked for its own row back was refused.
--
-- The predicate now takes the row's own columns. The id-taking wrapper stays
-- for the child tables and is defined in terms of the same rule, so the two
-- cannot drift apart.

-- Does any role this user holds sit at or before the stage the case has reached?
CREATE OR REPLACE FUNCTION public.procurement_role_reaches_stage(
  _user_id UUID, _stage procurement_stage
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_user_roles ur
    JOIN public.procurement_role_stages rs ON rs.role = ur.role
    JOIN public.procurement_stage_config sc_role ON sc_role.stage = rs.stage
    JOIN public.procurement_stage_config sc_case ON sc_case.stage = _stage
    WHERE ur.user_id = _user_id AND sc_case.sequence >= sc_role.sequence
  )
$$;

CREATE OR REPLACE FUNCTION public.procurement_can_view_case_row(
  _user_id UUID,
  _case_id UUID,
  _requester_id UUID,
  _created_by UUID,
  _stage procurement_stage
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _requester_id = _user_id
    OR _created_by = _user_id
    OR public.has_role(_user_id, 'admin')
    OR public.has_procurement_role(_user_id, 'proc_admin')
    OR public.has_procurement_permission(_user_id, 'oversight.view')
    OR public.procurement_role_reaches_stage(_user_id, _stage)
    OR public.is_procurement_committee_member(_user_id, _case_id, NULL)
$$;

CREATE OR REPLACE FUNCTION public.procurement_can_view_case(_user_id UUID, _case_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT public.procurement_can_view_case_row(
              _user_id, c.id, c.requester_id, c.created_by, c.stage)
       FROM public.procurement_cases c
      WHERE c.id = _case_id),
    false)
$$;

DROP POLICY IF EXISTS "Users can read procurement cases in their remit" ON public.procurement_cases;
CREATE POLICY "Users can read procurement cases in their remit" ON public.procurement_cases
  FOR SELECT TO authenticated
  USING (public.procurement_can_view_case_row(auth.uid(), id, requester_id, created_by, stage));
