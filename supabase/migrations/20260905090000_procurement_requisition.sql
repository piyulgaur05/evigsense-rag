-- Procurement, slice 2: the requisition itself.
--
-- The foundation moved a case through fourteen stages but carried almost
-- nothing about what was being bought. This slice gives the requisition stage
-- its own record: the detail a buyer actually fills in, an itemised bill of
-- quantities, the budget head the spend is charged to, and the reporting the
-- portal needs to draw a picture of the pipeline.
--
-- Two rules the rest of the schema depends on:
--   * procurement_cases.estimated_cost is derived, never typed twice. A
--     trigger keeps it equal to whichever cost source the requisition names.
--   * mpr.submit now carries a guard, so an incomplete requisition cannot be
--     put in front of finance. This is the first use of the guard_function
--     column the engine already honoured.

-- ===== Budget heads and what has been committed against them =====

CREATE TABLE IF NOT EXISTS public.procurement_budget_heads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT,
  fiscal_year   TEXT NOT NULL,
  department_id UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  category_id   UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  allocated     NUMERIC(16,2) NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, fiscal_year)
);
ALTER TABLE public.procurement_budget_heads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_budget_heads_department_id
  ON public.procurement_budget_heads(department_id);

-- One row per claim on a budget head. A requisition commits; a payment spends;
-- a rejected or closed case releases. Available headroom is the arithmetic.
CREATE TABLE IF NOT EXISTS public.procurement_budget_commitments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_head_id UUID NOT NULL REFERENCES public.procurement_budget_heads(id) ON DELETE CASCADE,
  case_id        UUID REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'commitment'
                 CHECK (kind IN ('commitment', 'spend', 'release')),
  amount         NUMERIC(16,2) NOT NULL DEFAULT 0,
  note           TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_budget_commitments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_budget_commitments_head
  ON public.procurement_budget_commitments(budget_head_id);
CREATE INDEX IF NOT EXISTS idx_procurement_budget_commitments_case
  ON public.procurement_budget_commitments(case_id);

-- ===== The requisition =====

CREATE TABLE IF NOT EXISTS public.procurement_requisitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL UNIQUE REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  justification       TEXT,
  required_by         DATE,
  priority_id         UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  category_id         UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  procurement_type_id UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  cost_centre_id      UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  warehouse_id        UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  budget_head_id      UUID REFERENCES public.procurement_budget_heads(id) ON DELETE SET NULL,
  -- 'boq' totals the priced lines; 'manual' uses the figure the requester typed.
  cost_source         TEXT NOT NULL DEFAULT 'manual' CHECK (cost_source IN ('boq', 'manual')),
  manual_cost         NUMERIC(16,2) NOT NULL DEFAULT 0,
  delivery_note       TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_requisitions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_requisitions_case_id
  ON public.procurement_requisitions(case_id);
CREATE INDEX IF NOT EXISTS idx_procurement_requisitions_budget_head
  ON public.procurement_requisitions(budget_head_id);

-- What is being bought, line by line. line_amount is derived so no client can
-- disagree with the arithmetic.
CREATE TABLE IF NOT EXISTS public.procurement_boq_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL,
  item_name      TEXT NOT NULL,
  specification  TEXT,
  quantity       NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit           TEXT,
  hsn_code       TEXT,
  delivery_note  TEXT,
  estimated_rate NUMERIC(16,2),
  line_amount    NUMERIC(18,2) GENERATED ALWAYS AS
                   (ROUND(quantity * COALESCE(estimated_rate, 0), 2)) STORED,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, line_no)
);
ALTER TABLE public.procurement_boq_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_boq_lines_case_id
  ON public.procurement_boq_lines(case_id, line_no);

-- ===== updated_at =====
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_budget_heads','procurement_budget_commitments',
    'procurement_requisitions','procurement_boq_lines'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ===== Money =====

CREATE OR REPLACE FUNCTION public.procurement_boq_total(_case_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(line_amount), 0) FROM public.procurement_boq_lines WHERE case_id = _case_id
$$;

-- Headroom left on a budget head: what was allocated, less what is committed
-- or spent, plus anything released back.
CREATE OR REPLACE FUNCTION public.procurement_budget_committed(_budget_head_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  -- A live case charged to this head commits its estimated value from the
  -- moment it is raised; a draft has not asked for the money yet, and a
  -- rejected case has given it back. Anything else -- a revision, a write-off
  -- -- is an explicit ledger row.
  SELECT COALESCE((
    SELECT SUM(c.estimated_cost)
    FROM public.procurement_requisitions r
    JOIN public.procurement_cases c ON c.id = r.case_id
    WHERE r.budget_head_id = _budget_head_id
      AND c.case_status <> 'rejected'
      AND c.stage <> 'draft'
  ), 0) + COALESCE((
    SELECT SUM(CASE WHEN b.kind = 'release' THEN -b.amount ELSE b.amount END)
    FROM public.procurement_budget_commitments b
    WHERE b.budget_head_id = _budget_head_id
  ), 0)
$$;

CREATE OR REPLACE FUNCTION public.procurement_budget_available(_budget_head_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(h.allocated, 0) - public.procurement_budget_committed(_budget_head_id)
  FROM public.procurement_budget_heads h
  WHERE h.id = _budget_head_id
$$;

-- The budget ledger, as the requisition form and the insights page want it.
CREATE OR REPLACE FUNCTION public.procurement_budget_ledger()
RETURNS TABLE (
  id UUID, name TEXT, code TEXT, fiscal_year TEXT, department TEXT,
  allocated NUMERIC, committed NUMERIC, available NUMERIC, active BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.name, h.code, h.fiscal_year, d.name,
         h.allocated,
         public.procurement_budget_committed(h.id),
         public.procurement_budget_available(h.id),
         h.active
  FROM public.procurement_budget_heads h
  LEFT JOIN public.procurement_lookups d ON d.id = h.department_id
  ORDER BY h.active DESC, h.name
$$;

-- The case value follows the requisition rather than being typed twice.
CREATE OR REPLACE FUNCTION public.procurement_sync_case_cost(_case_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _req  public.procurement_requisitions;
  _cost NUMERIC;
BEGIN
  SELECT * INTO _req FROM public.procurement_requisitions WHERE case_id = _case_id;
  IF NOT FOUND THEN RETURN; END IF;

  _cost := CASE WHEN _req.cost_source = 'boq'
                THEN public.procurement_boq_total(_case_id)
                ELSE _req.manual_cost END;

  UPDATE public.procurement_cases
     SET estimated_cost = COALESCE(_cost, 0), updated_at = now()
   WHERE id = _case_id AND estimated_cost IS DISTINCT FROM COALESCE(_cost, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_sync_case_cost_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.procurement_sync_case_cost(COALESCE(NEW.case_id, OLD.case_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_boq_lines_cost ON public.procurement_boq_lines;
CREATE TRIGGER trg_procurement_boq_lines_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.procurement_boq_lines
  FOR EACH ROW EXECUTE FUNCTION public.procurement_sync_case_cost_trigger();

DROP TRIGGER IF EXISTS trg_procurement_requisitions_cost ON public.procurement_requisitions;
CREATE TRIGGER trg_procurement_requisitions_cost
  AFTER INSERT OR UPDATE ON public.procurement_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.procurement_sync_case_cost_trigger();

-- ===== The gate in front of finance =====

-- A requisition may only be put to finance when it says what is wanted, when
-- it is wanted, what it is expected to cost, and which department is asking.
-- Documents are gated in the portal rather than here, the same way the paper
-- process treats them: the checklist is advisory, the essentials are not.
CREATE OR REPLACE FUNCTION public.procurement_guard_requisition_ready(
  _case_id UUID, _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_cases c
    JOIN public.procurement_requisitions r ON r.case_id = c.id
    WHERE c.id = _case_id
      AND c.department_id IS NOT NULL
      AND btrim(COALESCE(c.title, '')) <> ''
      AND r.required_by IS NOT NULL
      AND c.estimated_cost > 0
  )
$$;

UPDATE public.procurement_stage_actions
   SET guard_function = 'public.procurement_guard_requisition_ready'
 WHERE code = 'mpr.submit';

-- What is still missing, so the portal can say so before the button is pressed.
CREATE OR REPLACE FUNCTION public.procurement_requisition_gaps(_case_id UUID)
RETURNS TEXT[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN btrim(COALESCE(c.title, '')) = '' THEN 'A title' END,
    CASE WHEN c.department_id IS NULL THEN 'The department it is for' END,
    CASE WHEN r.id IS NULL OR r.required_by IS NULL THEN 'The date it is needed by' END,
    CASE WHEN COALESCE(c.estimated_cost, 0) <= 0 THEN 'An estimated cost above zero' END,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.procurement_case_documents d WHERE d.case_id = c.id
    ) THEN 'At least one supporting document' END
  ], NULL)
  FROM public.procurement_cases c
  LEFT JOIN public.procurement_requisitions r ON r.case_id = c.id
  WHERE c.id = _case_id
$$;

-- ===== The case timeline =====

-- One reverse-chronological trail per case, merging every kind of thing that
-- happened to it: decisions, stage movements, questions and send-backs, and
-- paperwork arriving. The portal draws this as the activity timeline, and it
-- reads the same at every stage, which is why it is one function and not one
-- per stage.
CREATE OR REPLACE FUNCTION public.procurement_case_activity(_case_id UUID)
RETURNS TABLE (
  kind TEXT, happened_at TIMESTAMPTZ, stage procurement_stage, to_stage procurement_stage,
  title TEXT, detail TEXT, actor_id UUID, actor_name TEXT, actor_role TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH visible AS (
    SELECT c.id FROM public.procurement_cases c
    WHERE c.id = _case_id
      AND public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  ),
  named AS (
    SELECT p.id, COALESCE(NULLIF(btrim(p.display_name), ''), p.email) AS name FROM public.profiles p
  )
  SELECT 'decision', e.created_at, e.stage, NULL::procurement_stage,
         e.summary,
         NULLIF(btrim(COALESCE(e.details->>'remarks', '')), ''),
         e.actor_id, n.name, e.actor_role::TEXT
    FROM public.procurement_case_events e
    JOIN visible v ON v.id = e.case_id
    LEFT JOIN named n ON n.id = e.actor_id
   WHERE e.action <> 'case.opened'

  UNION ALL
  SELECT 'movement', h.entered_at, h.from_stage, h.to_stage,
         h.status_label, h.remarks, h.actor_id, n.name, NULL
    FROM public.procurement_stage_history h
    JOIN visible v ON v.id = h.case_id
    LEFT JOIN named n ON n.id = h.actor_id

  UNION ALL
  SELECT CASE WHEN cl.kind = 'send_back' THEN 'send_back' ELSE 'question' END,
         cl.created_at, cl.from_stage, cl.to_stage,
         CASE WHEN cl.kind = 'send_back' THEN 'Sent back' ELSE 'Clarification raised' END,
         cl.body, cl.author_id, n.name, NULL
    FROM public.procurement_clarifications cl
    JOIN visible v ON v.id = cl.case_id
    LEFT JOIN named n ON n.id = cl.author_id

  UNION ALL
  SELECT 'document', cd.created_at, cd.stage, NULL::procurement_stage,
         COALESCE(d.title, d.original_filename, 'Document attached'),
         cd.doc_type, cd.uploaded_by, n.name, NULL
    FROM public.procurement_case_documents cd
    JOIN visible v ON v.id = cd.case_id
    LEFT JOIN public.documents d ON d.id = cd.document_id
    LEFT JOIN named n ON n.id = cd.uploaded_by

  ORDER BY 2 DESC
$$;

-- ===== Reporting =====

-- How long each open case has sat where it is, against that stage's timer.
CREATE OR REPLACE FUNCTION public.procurement_stage_aging()
RETURNS TABLE (
  case_id UUID, case_no TEXT, title TEXT, stage procurement_stage, stage_label TEXT,
  entered_at TIMESTAMPTZ, hours_in_stage NUMERIC, sla_hours INTEGER,
  breached BOOLEAN, estimated_cost NUMERIC
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.case_no, c.title, c.stage, sc.label,
         COALESCE(h.entered_at, c.created_at),
         ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(h.entered_at, c.created_at))) / 3600.0, 1),
         sc.sla_hours,
         sc.sla_hours IS NOT NULL
           AND EXTRACT(EPOCH FROM (now() - COALESCE(h.entered_at, c.created_at))) / 3600.0 > sc.sla_hours,
         c.estimated_cost
  FROM public.procurement_cases c
  JOIN public.procurement_stage_config sc ON sc.stage = c.stage
  LEFT JOIN LATERAL (
    SELECT sh.entered_at FROM public.procurement_stage_history sh
    WHERE sh.case_id = c.id AND sh.to_stage = c.stage
    ORDER BY sh.entered_at DESC LIMIT 1
  ) h ON true
  WHERE c.case_status = 'open'
    AND c.stage <> 'closed'
    AND public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  ORDER BY 7 DESC
$$;

-- Cases opened and closed per month, with the value they carried.
CREATE OR REPLACE FUNCTION public.procurement_monthly_flow(_months INTEGER DEFAULT 12)
RETURNS TABLE (month DATE, opened BIGINT, closed BIGINT, opened_value NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - ((GREATEST(_months, 1) - 1) || ' months')::INTERVAL,
      date_trunc('month', now()),
      '1 month'::INTERVAL
    )::DATE AS month
  ),
  mine AS (
    SELECT c.* FROM public.procurement_cases c
    WHERE public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  )
  SELECT m.month,
         (SELECT COUNT(*) FROM mine o
           WHERE date_trunc('month', o.created_at)::DATE = m.month),
         (SELECT COUNT(*) FROM mine cl
           WHERE cl.closed_at IS NOT NULL AND date_trunc('month', cl.closed_at)::DATE = m.month),
         (SELECT COALESCE(SUM(o.estimated_cost), 0) FROM mine o
           WHERE date_trunc('month', o.created_at)::DATE = m.month)
  FROM months m
  ORDER BY m.month
$$;

-- Where the money is going, by department.
CREATE OR REPLACE FUNCTION public.procurement_department_spend()
RETURNS TABLE (department TEXT, cases BIGINT, open_cases BIGINT, total_value NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(d.name, 'Not stated'),
         COUNT(c.id),
         COUNT(c.id) FILTER (WHERE c.case_status = 'open'),
         COALESCE(SUM(c.estimated_cost), 0)
  FROM public.procurement_cases c
  LEFT JOIN public.procurement_lookups d ON d.id = c.department_id
  WHERE public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  GROUP BY 1
  ORDER BY 4 DESC
$$;

-- How long a case actually spends at each desk, measured from the stage
-- history rather than from anybody's estimate.
CREATE OR REPLACE FUNCTION public.procurement_cycle_time()
RETURNS TABLE (stage procurement_stage, stage_label TEXT, moves BIGINT, avg_hours NUMERIC, sla_hours INTEGER)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT c.id FROM public.procurement_cases c
    WHERE public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  ),
  spans AS (
    SELECT h.to_stage AS stage,
           LEAD(h.entered_at) OVER (PARTITION BY h.case_id ORDER BY h.entered_at) - h.entered_at AS span
    FROM public.procurement_stage_history h
    JOIN mine m ON m.id = h.case_id
  )
  SELECT sc.stage, sc.label,
         COUNT(s.span),
         ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM s.span)), 0) / 3600.0, 1),
         sc.sla_hours
  FROM public.procurement_stage_config sc
  LEFT JOIN spans s ON s.stage = sc.stage AND s.span IS NOT NULL
  GROUP BY sc.stage, sc.label, sc.sla_hours, sc.sequence
  ORDER BY sc.sequence
$$;

-- Headline numbers for the top of the insights page.
CREATE OR REPLACE FUNCTION public.procurement_headline_metrics()
RETURNS TABLE (
  open_cases BIGINT, closed_cases BIGINT, rejected_cases BIGINT,
  open_value NUMERIC, awarded_value NUMERIC,
  avg_cycle_days NUMERIC, breaching_cases BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT c.* FROM public.procurement_cases c
    WHERE public.procurement_can_view_case_row(auth.uid(), c.id, c.requester_id, c.created_by, c.stage)
  )
  SELECT COUNT(*) FILTER (WHERE case_status = 'open'),
         COUNT(*) FILTER (WHERE case_status = 'closed'),
         COUNT(*) FILTER (WHERE case_status = 'rejected'),
         COALESCE(SUM(estimated_cost) FILTER (WHERE case_status = 'open'), 0),
         COALESCE(SUM(estimated_cost) FILTER (WHERE case_status = 'closed'), 0),
         ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))
                        FILTER (WHERE closed_at IS NOT NULL), 0) / 86400.0, 1),
         (SELECT COUNT(*) FROM public.procurement_stage_aging() a WHERE a.breached)
  FROM mine
$$;

-- ===== Row level security =====

-- Budget heads: everyone signed in can read the ledger (a requester has to
-- pick one), only finance and the administrator can change it.
DROP POLICY IF EXISTS "Signed-in users can read budget heads" ON public.procurement_budget_heads;
CREATE POLICY "Signed-in users can read budget heads" ON public.procurement_budget_heads
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Finance and admins can manage budget heads" ON public.procurement_budget_heads;
CREATE POLICY "Finance and admins can manage budget heads" ON public.procurement_budget_heads
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'finance.approve')
         OR public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'finance.approve')
              OR public.has_procurement_permission(auth.uid(), 'master_data.manage'));

DROP POLICY IF EXISTS "Signed-in users can read budget commitments" ON public.procurement_budget_commitments;
CREATE POLICY "Signed-in users can read budget commitments" ON public.procurement_budget_commitments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Finance and admins can manage budget commitments" ON public.procurement_budget_commitments;
CREATE POLICY "Finance and admins can manage budget commitments" ON public.procurement_budget_commitments
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'finance.approve')
         OR public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'finance.approve')
              OR public.has_procurement_permission(auth.uid(), 'master_data.manage'));

-- The requisition and its lines follow the case: readable by anyone who can
-- see the case, writable while it is still the requester's to change.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['procurement_requisitions','procurement_boq_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can read requisition detail on cases in their remit" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can read requisition detail on cases in their remit" ON public.%I
         FOR SELECT TO authenticated
         USING (public.procurement_can_view_case(auth.uid(), case_id))', t);

    -- Editable up to the point the case leaves the requester: at draft or
    -- requisition, by the person who raised it or the procurement admin.
    EXECUTE format('DROP POLICY IF EXISTS "Requesters can edit their own requisition" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Requesters can edit their own requisition" ON public.%I
         FOR ALL TO authenticated
         USING (EXISTS (
           SELECT 1 FROM public.procurement_cases c
           WHERE c.id = case_id
             AND c.case_status = ''open''
             AND (c.stage = ''draft''::procurement_stage OR c.stage = ''mpr''::procurement_stage)
             AND (c.requester_id = auth.uid() OR c.created_by = auth.uid()
                  OR public.has_procurement_role(auth.uid(), ''proc_admin''))
         ))
         WITH CHECK (EXISTS (
           SELECT 1 FROM public.procurement_cases c
           WHERE c.id = case_id
             AND c.case_status = ''open''
             AND (c.stage = ''draft''::procurement_stage OR c.stage = ''mpr''::procurement_stage)
             AND (c.requester_id = auth.uid() OR c.created_by = auth.uid()
                  OR public.has_procurement_role(auth.uid(), ''proc_admin''))
         ))', t);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.procurement_boq_total(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_budget_available(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_budget_committed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_budget_ledger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_requisition_gaps(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_case_activity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_stage_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_monthly_flow(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_department_spend() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_cycle_time() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_headline_metrics() TO authenticated;
