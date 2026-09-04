-- Counts for the portal dashboard, under the caller's own visibility.
--
-- The dashboard wants a number per stage. Pulling every visible case to the
-- browser and counting there would work today and stop working at scale, so
-- the count is done where the rows are.
CREATE OR REPLACE FUNCTION public.procurement_stage_counts()
RETURNS TABLE (stage procurement_stage, open_cases BIGINT, total_value NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sc.stage,
         count(c.id) FILTER (WHERE c.case_status = 'open'),
         COALESCE(sum(c.estimated_cost) FILTER (WHERE c.case_status = 'open'), 0)
  FROM public.procurement_stage_config sc
  LEFT JOIN public.procurement_cases c
    ON c.stage = sc.stage
   AND public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  GROUP BY sc.stage, sc.sequence
  ORDER BY sc.sequence
$$;
