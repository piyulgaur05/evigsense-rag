-- Procurement lifecycle — foundation slice.
--
-- One procurement_cases row is the spine of a purchase, from requisition to
-- payment. Every stage keeps its own record keyed by case_id (added in later
-- migrations); this file lands the spine, the RBAC layer, and the stage engine.
--
-- The stage engine is data-driven on purpose: the legal moves live in
-- procurement_stage_actions / procurement_return_paths rather than in a switch
-- statement, so the same rows drive the SQL guards and the buttons the UI
-- renders. Adding a stage action is a seed row, not a code change.

-- ===== Enums =====
DO $$ BEGIN CREATE TYPE public.procurement_stage AS ENUM (
  'draft','mpr','finance','tender','tec','commercial','cst','dpc','pnc',
  'purchase_proposal','purchase_order','goods_receipt','payment_recommendation','closed'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.procurement_role AS ENUM (
  'proc_admin','purchase_head','requester','finance_user','purchase_officer',
  'tec_chairman','tec_member','head_of_division','commercial_team',
  'dpc_chairman','dpc_member','pnc_chairman','pnc_member',
  'management_approver','po_officer','receipt_payment_officer'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.procurement_action AS ENUM (
  'submit','approve','forward','send_back','request_clarification','reject'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.procurement_committee_kind AS ENUM ('tec','dpc','pnc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.procurement_clarification_kind AS ENUM ('question','send_back');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.procurement_case_status AS ENUM ('open','rejected','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Reference data: stages, return paths, actions, permissions =====

CREATE TABLE IF NOT EXISTS public.procurement_stage_config (
  stage            procurement_stage PRIMARY KEY,
  sequence         INTEGER NOT NULL UNIQUE,
  label            TEXT NOT NULL,
  entry_status     TEXT NOT NULL,
  mandatory        BOOLEAN NOT NULL DEFAULT true,
  sla_hours        INTEGER,
  escalation_role  procurement_role,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_stage_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.procurement_return_paths (
  from_stage procurement_stage NOT NULL,
  to_stage   procurement_stage NOT NULL,
  PRIMARY KEY (from_stage, to_stage)
);
ALTER TABLE public.procurement_return_paths ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.procurement_permissions (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  stage TEXT NOT NULL
);
ALTER TABLE public.procurement_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.procurement_role_permissions (
  role       procurement_role NOT NULL,
  permission TEXT NOT NULL REFERENCES public.procurement_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);
ALTER TABLE public.procurement_role_permissions ENABLE ROW LEVEL SECURITY;

-- Which stage a role owns. Drives "cases that have reached my desk" visibility.
CREATE TABLE IF NOT EXISTS public.procurement_role_stages (
  role  procurement_role NOT NULL,
  stage procurement_stage NOT NULL REFERENCES public.procurement_stage_config(stage) ON DELETE CASCADE,
  PRIMARY KEY (role, stage)
);
ALTER TABLE public.procurement_role_stages ENABLE ROW LEVEL SECURITY;

-- The legal moves out of a stage. One row per button the case file offers.
CREATE TABLE IF NOT EXISTS public.procurement_stage_actions (
  code              TEXT PRIMARY KEY,
  stage             procurement_stage NOT NULL REFERENCES public.procurement_stage_config(stage) ON DELETE CASCADE,
  action            procurement_action NOT NULL,
  label             TEXT NOT NULL,
  description       TEXT,
  permission        TEXT NOT NULL REFERENCES public.procurement_permissions(key),
  target_stage      procurement_stage,
  entry_status      TEXT,
  requires_remarks  BOOLEAN NOT NULL DEFAULT true,
  requires_signature BOOLEAN NOT NULL DEFAULT false,
  chair_only        BOOLEAN NOT NULL DEFAULT false,
  guard_function    TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.procurement_stage_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_stage_actions_stage ON public.procurement_stage_actions(stage);

-- ===== Lookups (departments, categories, cost centres, ...) =====
CREATE TABLE IF NOT EXISTS public.procurement_lookups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  code       TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);
ALTER TABLE public.procurement_lookups ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_lookups_kind ON public.procurement_lookups(kind);

-- ===== Role assignment =====
-- Separate from public.user_roles on purpose: the app_role enum governs the
-- document product, this one governs procurement, and neither is stored on the
-- profile row (same anti-privilege-escalation shape as user_roles).
CREATE TABLE IF NOT EXISTS public.procurement_user_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  role          procurement_role NOT NULL,
  department_id UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  designation   TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.procurement_user_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_user_roles_user_id ON public.procurement_user_roles(user_id);

-- ===== Reference counters =====
CREATE TABLE IF NOT EXISTS public.procurement_ref_counters (
  prefix  TEXT NOT NULL,
  year    INTEGER NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);
ALTER TABLE public.procurement_ref_counters ENABLE ROW LEVEL SECURITY;

-- ===== The case spine =====
CREATE TABLE IF NOT EXISTS public.procurement_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no           TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  stage             procurement_stage NOT NULL DEFAULT 'draft',
  status_label      TEXT NOT NULL DEFAULT 'Draft',
  case_status       procurement_case_status NOT NULL DEFAULT 'open',
  department_id     UUID REFERENCES public.procurement_lookups(id) ON DELETE SET NULL,
  requester_id      UUID NOT NULL,
  estimated_cost    NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',
  awarded_vendor_id UUID,
  rejection         JSONB,
  closed_at         TIMESTAMPTZ,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_cases_stage ON public.procurement_cases(stage);
CREATE INDEX IF NOT EXISTS idx_procurement_cases_requester_id ON public.procurement_cases(requester_id);
CREATE INDEX IF NOT EXISTS idx_procurement_cases_department_id ON public.procurement_cases(department_id);

-- Append-only trail. Written by the stage engine, never by the client.
CREATE TABLE IF NOT EXISTS public.procurement_case_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  stage      procurement_stage NOT NULL,
  action     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  details    JSONB,
  actor_id   UUID,
  actor_role procurement_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_case_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_case_events_case_id ON public.procurement_case_events(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.procurement_stage_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  from_stage   procurement_stage,
  to_stage     procurement_stage NOT NULL,
  status_label TEXT NOT NULL,
  remarks      TEXT,
  actor_id     UUID,
  entered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_stage_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_stage_history_case_id ON public.procurement_stage_history(case_id, entered_at DESC);

CREATE TABLE IF NOT EXISTS public.procurement_clarifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  kind        procurement_clarification_kind NOT NULL DEFAULT 'question',
  from_stage  procurement_stage NOT NULL,
  to_stage    procurement_stage,
  body        TEXT NOT NULL,
  parent_id   UUID REFERENCES public.procurement_clarifications(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procurement_clarifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_clarifications_case_id ON public.procurement_clarifications(case_id, created_at);

-- Case documents ride the existing ingest pipeline: the file lands in
-- public.documents and goes through the queue like any other upload, and this
-- table only records what role that document plays in the case.
CREATE TABLE IF NOT EXISTS public.procurement_case_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  stage        procurement_stage NOT NULL,
  doc_type     TEXT NOT NULL DEFAULT 'Other',
  is_generated BOOLEAN NOT NULL DEFAULT false,
  version      INTEGER NOT NULL DEFAULT 1,
  uploaded_by  UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, document_id)
);
ALTER TABLE public.procurement_case_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_case_documents_case_id ON public.procurement_case_documents(case_id);

-- ===== Committees (TEC / DPC / PNC) =====
-- Landed here rather than with their stages because case visibility depends on
-- committee membership.
CREATE TABLE IF NOT EXISTS public.procurement_committees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES public.procurement_cases(id) ON DELETE CASCADE,
  kind           procurement_committee_kind NOT NULL,
  cycle          INTEGER NOT NULL DEFAULT 1,
  name           TEXT,
  constituted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, kind, cycle)
);
ALTER TABLE public.procurement_committees ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.procurement_committee_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id   UUID NOT NULL REFERENCES public.procurement_committees(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  designation    TEXT,
  is_chair       BOOLEAN NOT NULL DEFAULT false,
  voting_rights  BOOLEAN NOT NULL DEFAULT true,
  attended       BOOLEAN NOT NULL DEFAULT false,
  review_status  TEXT NOT NULL DEFAULT 'pending',
  findings       TEXT,
  has_conflict   BOOLEAN NOT NULL DEFAULT false,
  conflict_reason TEXT,
  signed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (committee_id, user_id)
);
ALTER TABLE public.procurement_committee_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_procurement_committee_members_user_id ON public.procurement_committee_members(user_id);

-- ===== RBAC helpers =====

CREATE OR REPLACE FUNCTION public.has_procurement_role(_user_id UUID, _role procurement_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.procurement_user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_procurement_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_user_roles ur
    JOIN public.procurement_role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission = _permission
  )
$$;

-- Everything the signed-in user may do, for the UI to gate on without a
-- round trip per button.
CREATE OR REPLACE FUNCTION public.procurement_my_permissions()
RETURNS TABLE (permission TEXT) LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT rp.permission
  FROM public.procurement_user_roles ur
  JOIN public.procurement_role_permissions rp ON rp.role = ur.role
  WHERE ur.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_procurement_committee_member(
  _user_id UUID, _case_id UUID, _kind procurement_committee_kind DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_committee_members m
    JOIN public.procurement_committees c ON c.id = m.committee_id
    WHERE m.user_id = _user_id
      AND c.case_id = _case_id
      AND (_kind IS NULL OR c.kind = _kind)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_procurement_committee_chair(
  _user_id UUID, _case_id UUID, _kind procurement_committee_kind
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.procurement_committee_members m
    JOIN public.procurement_committees c ON c.id = m.committee_id
    WHERE m.user_id = _user_id AND c.case_id = _case_id AND c.kind = _kind AND m.is_chair
  )
$$;

-- The single predicate every case-scoped read policy calls.
--   platform admin / procurement admin / oversight -> every case
--   requester                                      -> their own cases
--   a stage-owning role                            -> cases that reached that stage
--   committee member                               -> cases they sit on
CREATE OR REPLACE FUNCTION public.procurement_can_view_case(_user_id UUID, _case_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_procurement_role(_user_id, 'proc_admin')
    OR public.has_procurement_permission(_user_id, 'oversight.view')
    OR EXISTS (
      SELECT 1 FROM public.procurement_cases c
      WHERE c.id = _case_id AND (c.requester_id = _user_id OR c.created_by = _user_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.procurement_cases c
      JOIN public.procurement_stage_config sc_case ON sc_case.stage = c.stage
      JOIN public.procurement_user_roles ur ON ur.user_id = _user_id
      JOIN public.procurement_role_stages rs ON rs.role = ur.role
      JOIN public.procurement_stage_config sc_role ON sc_role.stage = rs.stage
      WHERE c.id = _case_id AND sc_case.sequence >= sc_role.sequence
    )
    OR public.is_procurement_committee_member(_user_id, _case_id, NULL)
$$;

-- ===== Reference numbers: {PREFIX}-{YYYY}-{NNNN} =====
CREATE OR REPLACE FUNCTION public.procurement_next_ref(_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  _next INTEGER;
BEGIN
  INSERT INTO public.procurement_ref_counters (prefix, year, last_no)
  VALUES (_prefix, _year, 1)
  ON CONFLICT (prefix, year) DO UPDATE SET last_no = public.procurement_ref_counters.last_no + 1
  RETURNING last_no INTO _next;

  RETURN _prefix || '-' || _year::TEXT || '-' || lpad(_next::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_set_case_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.case_no IS NULL OR NEW.case_no = '' THEN
    NEW.case_no := public.procurement_next_ref('PC');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_cases_case_no ON public.procurement_cases;
CREATE TRIGGER trg_procurement_cases_case_no
  BEFORE INSERT ON public.procurement_cases
  FOR EACH ROW EXECUTE FUNCTION public.procurement_set_case_no();

-- ===== Audit helper =====
CREATE OR REPLACE FUNCTION public.procurement_log_event(
  _case_id UUID, _stage procurement_stage, _action TEXT, _summary TEXT, _details JSONB DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
  _role procurement_role;
BEGIN
  SELECT role INTO _role FROM public.procurement_user_roles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.procurement_case_events (case_id, stage, action, summary, details, actor_id, actor_role)
  VALUES (_case_id, _stage, _action, _summary, _details, auth.uid(), _role)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- ===== Stage engine =====

CREATE OR REPLACE FUNCTION public.procurement_transition_allowed(
  _from procurement_stage, _to procurement_stage
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _to = 'closed' THEN true
    WHEN _from = _to THEN true
    WHEN (SELECT sequence FROM public.procurement_stage_config WHERE stage = _to)
       > (SELECT sequence FROM public.procurement_stage_config WHERE stage = _from) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.procurement_return_paths
      WHERE from_stage = _from AND to_stage = _to
    )
  END
$$;

-- All stage movement goes through here. The client never writes cases.stage.
CREATE OR REPLACE FUNCTION public.procurement_advance_stage(
  _case_id UUID,
  _to_stage procurement_stage,
  _status_label TEXT DEFAULT NULL,
  _remarks TEXT DEFAULT NULL
)
RETURNS public.procurement_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case   public.procurement_cases;
  _from   procurement_stage;
  _status TEXT;
BEGIN
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement case % not found', _case_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.procurement_can_view_case(auth.uid(), _case_id) THEN
    RAISE EXCEPTION 'Not permitted to act on this case' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _from := _case.stage;

  IF NOT public.procurement_transition_allowed(_from, _to_stage) THEN
    RAISE EXCEPTION 'Cannot move a case from % to %', _from, _to_stage
      USING ERRCODE = 'check_violation';
  END IF;

  _status := COALESCE(
    NULLIF(_status_label, ''),
    (SELECT entry_status FROM public.procurement_stage_config WHERE stage = _to_stage)
  );

  UPDATE public.procurement_cases
     SET stage        = _to_stage,
         status_label = _status,
         case_status  = CASE WHEN _to_stage = 'closed' THEN 'closed'::procurement_case_status
                             ELSE case_status END,
         closed_at    = CASE WHEN _to_stage = 'closed' THEN now() ELSE closed_at END,
         updated_at   = now()
   WHERE id = _case_id
   RETURNING * INTO _case;

  INSERT INTO public.procurement_stage_history (case_id, from_stage, to_stage, status_label, remarks, actor_id)
  VALUES (_case_id, _from, _to_stage, _status, _remarks, auth.uid());

  RETURN _case;
END;
$$;

-- Terminal rejection. Parks the case at the requisition stage so the requester
-- sees why, and marks it rejected so no queue picks it up again.
CREATE OR REPLACE FUNCTION public.procurement_reject_case(
  _case_id UUID, _remarks TEXT
)
RETURNS public.procurement_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case public.procurement_cases;
  _at   procurement_stage;
BEGIN
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement case % not found', _case_id USING ERRCODE = 'no_data_found';
  END IF;

  _at := _case.stage;

  UPDATE public.procurement_cases
     SET stage        = 'mpr',
         status_label = 'Rejected',
         case_status  = 'rejected',
         rejection    = jsonb_build_object(
                          'rejected_by', auth.uid(),
                          'rejected_at', now(),
                          'rejected_at_stage', _at::TEXT,
                          'remarks', _remarks
                        ),
         updated_at   = now()
   WHERE id = _case_id
   RETURNING * INTO _case;

  INSERT INTO public.procurement_stage_history (case_id, from_stage, to_stage, status_label, remarks, actor_id)
  VALUES (_case_id, _at, 'mpr', 'Rejected', _remarks, auth.uid());

  RETURN _case;
END;
$$;

-- The one entry point for a stage decision. Looks the move up in
-- procurement_stage_actions, checks the permission and any stage guard, then
-- moves the case and writes the trail.
CREATE OR REPLACE FUNCTION public.procurement_record_decision(
  _case_id UUID,
  _action_code TEXT,
  _remarks TEXT DEFAULT NULL,
  _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS public.procurement_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _case   public.procurement_cases;
  _act    public.procurement_stage_actions;
  _from   procurement_stage;
  _guard  TEXT;
  _ok     BOOLEAN;
BEGIN
  SELECT * INTO _case FROM public.procurement_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Procurement case % not found', _case_id USING ERRCODE = 'no_data_found';
  END IF;

  _from := _case.stage;

  SELECT * INTO _act FROM public.procurement_stage_actions
   WHERE code = _action_code AND stage = _from;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% is not available while the case is at %', _action_code, _from
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.has_procurement_permission(auth.uid(), _act.permission) THEN
    RAISE EXCEPTION 'You do not hold %', _act.permission USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _act.requires_remarks AND COALESCE(btrim(_remarks), '') = '' THEN
    RAISE EXCEPTION 'Remarks are required for "%"', _act.label USING ERRCODE = 'check_violation';
  END IF;

  -- Committee stages let only the chairperson move the case on.
  IF _act.chair_only THEN
    IF NOT (
      public.has_procurement_role(auth.uid(), 'proc_admin')
      OR public.is_procurement_committee_chair(
           auth.uid(), _case_id,
           CASE _from WHEN 'tec' THEN 'tec'::procurement_committee_kind
                      WHEN 'dpc' THEN 'dpc'::procurement_committee_kind
                      ELSE 'pnc'::procurement_committee_kind END)
    ) THEN
      RAISE EXCEPTION 'Only the chairperson can take this decision'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Stage-specific preconditions arrive with the later slices; each one is a
  -- boolean function taking (case_id, payload).
  _guard := _act.guard_function;
  IF _guard IS NOT NULL AND to_regprocedure(_guard || '(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE format('SELECT %s($1, $2)', _guard) INTO _ok USING _case_id, _payload;
    IF NOT COALESCE(_ok, false) THEN
      RAISE EXCEPTION 'This case is not ready for "%"', _act.label USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF _act.action = 'reject' THEN
    _case := public.procurement_reject_case(_case_id, _remarks);
  ELSIF _act.target_stage IS NOT NULL THEN
    _case := public.procurement_advance_stage(_case_id, _act.target_stage, _act.entry_status, _remarks);
  END IF;

  IF _act.action IN ('send_back', 'request_clarification') THEN
    INSERT INTO public.procurement_clarifications (case_id, kind, from_stage, to_stage, body, author_id)
    VALUES (
      _case_id,
      CASE WHEN _act.action = 'send_back' THEN 'send_back'::procurement_clarification_kind
           ELSE 'question'::procurement_clarification_kind END,
      _from,
      _act.target_stage,
      COALESCE(_remarks, _act.label),
      auth.uid()
    );
  END IF;

  PERFORM public.procurement_log_event(
    _case_id, _from, _act.code, _act.label,
    jsonb_build_object('remarks', _remarks, 'payload', _payload)
  );

  RETURN _case;
END;
$$;

-- What the signed-in user may do on a case right now — drives the action bar.
CREATE OR REPLACE FUNCTION public.procurement_available_actions(_case_id UUID)
RETURNS SETOF public.procurement_stage_actions
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.*
  FROM public.procurement_stage_actions a
  JOIN public.procurement_cases c ON c.stage = a.stage
  WHERE c.id = _case_id
    AND c.case_status = 'open'
    AND public.has_procurement_permission(auth.uid(), a.permission)
    AND (
      NOT a.chair_only
      OR public.has_procurement_role(auth.uid(), 'proc_admin')
      OR public.is_procurement_committee_chair(
           auth.uid(), _case_id,
           CASE c.stage WHEN 'tec' THEN 'tec'::procurement_committee_kind
                        WHEN 'dpc' THEN 'dpc'::procurement_committee_kind
                        ELSE 'pnc'::procurement_committee_kind END)
    )
  ORDER BY a.sort_order, a.label
$$;

-- ===== Row level security =====

-- Reference data: readable by anyone signed in, editable by the procurement admin.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_stage_config','procurement_return_paths','procurement_permissions',
    'procurement_role_permissions','procurement_role_stages','procurement_stage_actions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Signed-in users can read procurement reference data" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Signed-in users can read procurement reference data" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Procurement admins can manage reference data" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Procurement admins can manage reference data" ON public.%I FOR ALL TO authenticated USING (public.has_procurement_role(auth.uid(), ''proc_admin'') OR public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_procurement_role(auth.uid(), ''proc_admin'') OR public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- Lookups
DROP POLICY IF EXISTS "Signed-in users can read procurement lookups" ON public.procurement_lookups;
CREATE POLICY "Signed-in users can read procurement lookups" ON public.procurement_lookups
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Master data managers can change procurement lookups" ON public.procurement_lookups;
CREATE POLICY "Master data managers can change procurement lookups" ON public.procurement_lookups
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'master_data.manage'));

-- Role assignment
DROP POLICY IF EXISTS "Users can read their own procurement roles" ON public.procurement_user_roles;
CREATE POLICY "Users can read their own procurement roles" ON public.procurement_user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Procurement admins can read all role assignments" ON public.procurement_user_roles;
CREATE POLICY "Procurement admins can read all role assignments" ON public.procurement_user_roles
  FOR SELECT TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'manage_users') OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Procurement admins can change role assignments" ON public.procurement_user_roles;
CREATE POLICY "Procurement admins can change role assignments" ON public.procurement_user_roles
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'manage_users') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'manage_users') OR public.has_role(auth.uid(), 'admin'));

-- Cases
DROP POLICY IF EXISTS "Users can read procurement cases in their remit" ON public.procurement_cases;
CREATE POLICY "Users can read procurement cases in their remit" ON public.procurement_cases
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), id));
DROP POLICY IF EXISTS "Requesters can open procurement cases" ON public.procurement_cases;
CREATE POLICY "Requesters can open procurement cases" ON public.procurement_cases
  FOR INSERT TO authenticated
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'mpr.create') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Requesters can edit their own draft cases" ON public.procurement_cases;
CREATE POLICY "Requesters can edit their own draft cases" ON public.procurement_cases
  FOR UPDATE TO authenticated
  USING (
    (requester_id = auth.uid() AND stage IN ('draft','mpr'))
    OR public.has_procurement_role(auth.uid(), 'proc_admin')
  )
  WITH CHECK (
    (requester_id = auth.uid() AND stage IN ('draft','mpr'))
    OR public.has_procurement_role(auth.uid(), 'proc_admin')
  );
DROP POLICY IF EXISTS "Procurement admins can delete cases" ON public.procurement_cases;
CREATE POLICY "Procurement admins can delete cases" ON public.procurement_cases
  FOR DELETE TO authenticated USING (public.has_procurement_role(auth.uid(), 'proc_admin'));

-- Trail tables are append-only from the engine; users only read them.
DROP POLICY IF EXISTS "Users can read the trail of cases they can see" ON public.procurement_case_events;
CREATE POLICY "Users can read the trail of cases they can see" ON public.procurement_case_events
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), case_id));

DROP POLICY IF EXISTS "Users can read stage history of cases they can see" ON public.procurement_stage_history;
CREATE POLICY "Users can read stage history of cases they can see" ON public.procurement_stage_history
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), case_id));

-- Clarifications
DROP POLICY IF EXISTS "Users can read clarifications on cases they can see" ON public.procurement_clarifications;
CREATE POLICY "Users can read clarifications on cases they can see" ON public.procurement_clarifications
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), case_id));
DROP POLICY IF EXISTS "Users can post clarifications on cases they can see" ON public.procurement_clarifications;
CREATE POLICY "Users can post clarifications on cases they can see" ON public.procurement_clarifications
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.procurement_can_view_case(auth.uid(), case_id));
DROP POLICY IF EXISTS "Authors can edit their own clarifications" ON public.procurement_clarifications;
CREATE POLICY "Authors can edit their own clarifications" ON public.procurement_clarifications
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_procurement_role(auth.uid(), 'proc_admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_procurement_role(auth.uid(), 'proc_admin'));

-- Case documents
DROP POLICY IF EXISTS "Users can read documents on cases they can see" ON public.procurement_case_documents;
CREATE POLICY "Users can read documents on cases they can see" ON public.procurement_case_documents
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), case_id));
DROP POLICY IF EXISTS "Users can attach documents to cases they can see" ON public.procurement_case_documents;
CREATE POLICY "Users can attach documents to cases they can see" ON public.procurement_case_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.procurement_can_view_case(auth.uid(), case_id)
    AND public.has_procurement_permission(auth.uid(), 'upload_docs')
  );
DROP POLICY IF EXISTS "Uploaders can detach their own case documents" ON public.procurement_case_documents;
CREATE POLICY "Uploaders can detach their own case documents" ON public.procurement_case_documents
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_procurement_role(auth.uid(), 'proc_admin'));

-- Committees
DROP POLICY IF EXISTS "Users can read committees on cases they can see" ON public.procurement_committees;
CREATE POLICY "Users can read committees on cases they can see" ON public.procurement_committees
  FOR SELECT TO authenticated USING (public.procurement_can_view_case(auth.uid(), case_id));
DROP POLICY IF EXISTS "Committee constitution is an admin action" ON public.procurement_committees;
CREATE POLICY "Committee constitution is an admin action" ON public.procurement_committees
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'master_data.manage'));

DROP POLICY IF EXISTS "Users can read committee members on cases they can see" ON public.procurement_committee_members;
CREATE POLICY "Users can read committee members on cases they can see" ON public.procurement_committee_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_committees c
    WHERE c.id = committee_id AND public.procurement_can_view_case(auth.uid(), c.case_id)
  ));
DROP POLICY IF EXISTS "Members can record their own committee entry" ON public.procurement_committee_members;
CREATE POLICY "Members can record their own committee entry" ON public.procurement_committee_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_procurement_permission(auth.uid(), 'master_data.manage'))
  WITH CHECK (user_id = auth.uid() OR public.has_procurement_permission(auth.uid(), 'master_data.manage'));
DROP POLICY IF EXISTS "Committee rosters are an admin action" ON public.procurement_committee_members;
CREATE POLICY "Committee rosters are an admin action" ON public.procurement_committee_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'master_data.manage'));
DROP POLICY IF EXISTS "Committee members can be removed by an admin" ON public.procurement_committee_members;
CREATE POLICY "Committee members can be removed by an admin" ON public.procurement_committee_members
  FOR DELETE TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'master_data.manage'));

-- procurement_ref_counters carries no policy on purpose: only the SECURITY
-- DEFINER reference-number function touches it.

-- ===== updated_at triggers =====
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'procurement_stage_config','procurement_lookups','procurement_user_roles','procurement_cases',
    'procurement_clarifications','procurement_case_documents','procurement_committees',
    'procurement_committee_members'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ===== Seed: stages =====
INSERT INTO public.procurement_stage_config (stage, sequence, label, entry_status, mandatory, sla_hours, escalation_role) VALUES
  ('draft',                  0,  'Draft',                  'Draft',                              true,  NULL, NULL),
  ('mpr',                    1,  'Requisition',            'Requisition raised',                 true,  72,   'purchase_head'),
  ('finance',                2,  'Finance',                'Awaiting finance clearance',         true,  72,   'purchase_head'),
  ('tender',                 3,  'Tender',                 'Tender in preparation',              true,  168,  'purchase_head'),
  ('tec',                    4,  'Technical evaluation',   'Technical evaluation underway',      true,  120,  'tec_chairman'),
  ('commercial',             5,  'Commercial evaluation',  'Commercial evaluation underway',     true,  120,  'head_of_division'),
  ('cst',                    6,  'Comparative statement',  'Comparative statement under scrutiny', true, 72,  'head_of_division'),
  ('dpc',                    7,  'Purchase committee',     'Before the purchase committee',      true,  168,  'dpc_chairman'),
  ('pnc',                    8,  'Negotiation',            'In negotiation',                     false, 168,  'pnc_chairman'),
  ('purchase_proposal',      9,  'Purchase proposal',      'Proposal under review',              true,  120,  'management_approver'),
  ('purchase_order',         10, 'Purchase order',         'Purchase order in preparation',      true,  72,   'po_officer'),
  ('goods_receipt',          11, 'Goods receipt',          'Awaiting delivery',                  true,  NULL, 'receipt_payment_officer'),
  ('payment_recommendation', 12, 'Payment',                'Payment being processed',            true,  120,  'receipt_payment_officer'),
  ('closed',                 13, 'Closed',                 'Closed',                             true,  NULL, NULL)
ON CONFLICT (stage) DO UPDATE
  SET sequence = EXCLUDED.sequence, label = EXCLUDED.label, entry_status = EXCLUDED.entry_status,
      mandatory = EXCLUDED.mandatory, sla_hours = EXCLUDED.sla_hours, escalation_role = EXCLUDED.escalation_role;

-- ===== Seed: the only legal backward moves =====
INSERT INTO public.procurement_return_paths (from_stage, to_stage) VALUES
  ('mpr','draft'),
  ('finance','mpr'),
  ('tec','tender'),
  ('commercial','tec'),
  ('commercial','tender'),
  ('cst','commercial'),
  ('cst','tec'),
  ('cst','tender'),
  ('dpc','commercial'),
  ('pnc','dpc'),
  ('purchase_proposal','dpc'),
  ('purchase_proposal','pnc'),
  ('payment_recommendation','goods_receipt')
ON CONFLICT DO NOTHING;

-- ===== Seed: permissions =====
INSERT INTO public.procurement_permissions (key, label, stage) VALUES
  ('view_self',                  'View own profile',                        'Administration'),
  ('mpr.create',                 'Raise a requisition',                     'Requisition'),
  ('mpr.view',                   'View requisitions',                       'Requisition'),
  ('oversight.view',             'Organisation-wide read-only oversight',   'Administration'),
  ('finance.approve',            'Clear a budget',                          'Finance'),
  ('finance.reject',             'Refuse a budget',                         'Finance'),
  ('tender.create',              'Create and publish a tender',             'Tender'),
  ('tec.evaluate',               'Technical evaluation',                    'Technical evaluation'),
  ('tec.chair',                  'Chair the technical evaluation committee','Technical evaluation'),
  ('commercial.evaluate',        'Commercial evaluation',                   'Commercial evaluation'),
  ('commercial.opening.approve', 'Approve opening of commercial bids',      'Commercial evaluation'),
  ('dpc.approve',                'Vote to approve at the purchase committee','Purchase committee'),
  ('dpc.reject',                 'Vote to reject at the purchase committee','Purchase committee'),
  ('dpc.chair',                  'Chair the purchase committee',            'Purchase committee'),
  ('pnc.negotiate',              'Sit in price negotiation',                'Negotiation'),
  ('pnc.chair',                  'Chair price negotiation',                 'Negotiation'),
  ('proposal.draft',             'Draft a purchase proposal',               'Purchase proposal'),
  ('proposal.approve',           'Approve a purchase proposal',             'Purchase proposal'),
  ('po.issue',                   'Issue a purchase order',                  'Purchase order'),
  ('grn.create',                 'Record a goods receipt',                  'Goods receipt'),
  ('payment.process',            'Process a payment recommendation',        'Payment'),
  ('master_data.manage',         'Manage lookups and committees',           'Administration'),
  ('manage_users',               'Assign procurement roles',                'Administration'),
  ('upload_docs',                'Attach documents to a case',              'Documents'),
  ('docs.upload',                'Attach documents to a case (alias)',      'Documents')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, stage = EXCLUDED.stage;

-- ===== Seed: role -> permission matrix =====
DELETE FROM public.procurement_role_permissions;

-- The platform administrator holds everything.
INSERT INTO public.procurement_role_permissions (role, permission)
SELECT 'proc_admin'::procurement_role, key FROM public.procurement_permissions;

INSERT INTO public.procurement_role_permissions (role, permission) VALUES
  ('purchase_head','view_self'), ('purchase_head','mpr.view'), ('purchase_head','oversight.view'),

  ('requester','view_self'), ('requester','mpr.create'), ('requester','mpr.view'),
  ('requester','upload_docs'), ('requester','docs.upload'),

  ('finance_user','view_self'), ('finance_user','mpr.view'),
  ('finance_user','finance.approve'), ('finance_user','finance.reject'),

  ('purchase_officer','view_self'), ('purchase_officer','mpr.view'),
  ('purchase_officer','tender.create'), ('purchase_officer','proposal.draft'),
  ('purchase_officer','upload_docs'), ('purchase_officer','docs.upload'),

  ('tec_chairman','view_self'), ('tec_chairman','mpr.view'), ('tec_chairman','tec.evaluate'),
  ('tec_chairman','tec.chair'), ('tec_chairman','upload_docs'), ('tec_chairman','docs.upload'),

  ('tec_member','view_self'), ('tec_member','mpr.view'), ('tec_member','tec.evaluate'),
  ('tec_member','upload_docs'), ('tec_member','docs.upload'),

  ('head_of_division','view_self'), ('head_of_division','mpr.view'),
  ('head_of_division','commercial.opening.approve'),

  ('commercial_team','view_self'), ('commercial_team','mpr.view'), ('commercial_team','commercial.evaluate'),

  ('dpc_chairman','view_self'), ('dpc_chairman','mpr.view'), ('dpc_chairman','dpc.approve'),
  ('dpc_chairman','dpc.reject'), ('dpc_chairman','dpc.chair'),

  ('dpc_member','view_self'), ('dpc_member','mpr.view'), ('dpc_member','dpc.approve'), ('dpc_member','dpc.reject'),

  ('pnc_chairman','view_self'), ('pnc_chairman','mpr.view'), ('pnc_chairman','pnc.negotiate'), ('pnc_chairman','pnc.chair'),

  ('pnc_member','view_self'), ('pnc_member','mpr.view'), ('pnc_member','pnc.negotiate'),

  ('management_approver','view_self'), ('management_approver','mpr.view'), ('management_approver','proposal.approve'),

  ('po_officer','view_self'), ('po_officer','mpr.view'), ('po_officer','po.issue'),

  ('receipt_payment_officer','view_self'), ('receipt_payment_officer','mpr.view'),
  ('receipt_payment_officer','grn.create'), ('receipt_payment_officer','payment.process'),
  ('receipt_payment_officer','upload_docs'), ('receipt_payment_officer','docs.upload')
ON CONFLICT DO NOTHING;

-- ===== Seed: which desk a role sits at =====
-- The requester is absent on purpose: they see their own cases, not everyone's.
DELETE FROM public.procurement_role_stages;
INSERT INTO public.procurement_role_stages (role, stage) VALUES
  ('finance_user','finance'),
  ('purchase_officer','tender'),
  ('tec_chairman','tec'),
  ('tec_member','tec'),
  ('head_of_division','commercial'),
  ('commercial_team','commercial'),
  ('dpc_chairman','dpc'),
  ('dpc_member','dpc'),
  ('pnc_chairman','pnc'),
  ('pnc_member','pnc'),
  ('management_approver','purchase_proposal'),
  ('po_officer','purchase_order'),
  ('receipt_payment_officer','goods_receipt')
ON CONFLICT DO NOTHING;

-- ===== Seed: stage actions =====
INSERT INTO public.procurement_stage_actions
  (code, stage, action, label, description, permission, target_stage, entry_status, requires_remarks, requires_signature, chair_only, sort_order) VALUES

  ('draft.submit','draft','submit','Raise requisition',
   'Opens the requisition and puts it in front of finance.','mpr.create','mpr',NULL,false,false,false,10),

  ('mpr.submit','mpr','submit','Send for finance clearance',
   'Hands the requisition to the finance desk.','mpr.create','finance',NULL,false,false,false,10),

  ('finance.clear','finance','approve','Clear the budget',
   'Confirms funds are available and releases the case for tendering.','finance.approve','tender',NULL,true,true,false,10),
  ('finance.query','finance','request_clarification','Ask the requester a question',
   'Keeps the case at finance and opens a thread with the requester.','finance.approve',NULL,'Awaiting a reply from the requester',true,false,false,20),
  ('finance.return','finance','send_back','Return to the requester',
   'Sends the requisition back for correction.','finance.reject','mpr','Returned for correction',true,false,false,30),
  ('finance.refuse','finance','reject','Refuse the budget',
   'Ends the case.','finance.reject',NULL,NULL,true,true,false,40),

  ('tender.to_tec','tender','forward','Hand off for technical evaluation',
   'Closes bidding and constitutes the technical evaluation committee.','tender.create','tec',NULL,false,false,false,10),
  ('tender.to_commercial','tender','forward','Open commercially without evaluation',
   'Skips technical evaluation where the purchase does not warrant it.','tender.create','commercial',NULL,true,false,false,20),

  ('tec.recommend','tec','approve','Recommend for commercial evaluation',
   'Records the committee finding and releases qualified bids to commercial.','tec.chair','commercial',NULL,true,true,true,10),
  ('tec.query','tec','request_clarification','Seek clarification from a bidder',
   'Holds the case at technical evaluation.','tec.chair',NULL,'Awaiting a bidder clarification',true,false,true,20),
  ('tec.return','tec','send_back','Return to the tender desk',
   'Sends the case back for a tender correction.','tec.chair','tender','Returned to the tender desk',true,false,true,30),
  ('tec.refuse','tec','reject','Reject all bids on technical grounds',
   'Ends the case.','tec.chair',NULL,NULL,true,true,true,40),

  ('commercial.to_cst','commercial','forward','Draw up the comparative statement',
   'Ranks the priced bids and moves to comparative statement.','commercial.evaluate','cst',NULL,false,false,false,10),
  ('commercial.query','commercial','request_clarification','Seek a commercial clarification',
   'Holds the case at commercial evaluation.','commercial.evaluate',NULL,'Awaiting a commercial clarification',true,false,false,20),
  ('commercial.return','commercial','send_back','Return to technical evaluation',
   'Sends the case back to the technical committee.','commercial.evaluate','tec','Returned to technical evaluation',true,false,false,30),
  ('commercial.refuse','commercial','reject','Reject all bids',
   'Ends the case.','commercial.evaluate',NULL,NULL,true,true,false,40),

  ('cst.to_dpc','cst','forward','Place before the purchase committee',
   'Locks the comparative statement and lists the case for the committee.','commercial.evaluate','dpc',NULL,false,false,false,10),
  ('cst.return','cst','send_back','Reopen commercial evaluation',
   'Unlocks the statement for correction.','commercial.evaluate','commercial','Reopened for correction',true,false,false,20),

  ('dpc.to_pnc','dpc','forward','Refer for price negotiation',
   'Adopts the resolution and hands the case to the negotiation committee.','dpc.chair','pnc',NULL,true,false,true,10),
  ('dpc.to_proposal','dpc','forward','Approve and raise a purchase proposal',
   'Adopts the resolution and sends the case for management approval.','dpc.chair','purchase_proposal',NULL,true,true,true,20),
  ('dpc.query','dpc','request_clarification','Seek clarification before deciding',
   'Holds the case before the committee.','dpc.chair',NULL,'Awaiting clarification for the committee',true,false,true,30),
  ('dpc.return','dpc','send_back','Return to commercial evaluation',
   'Sends the case back for rework.','dpc.chair','commercial','Returned to commercial evaluation',true,false,true,40),
  ('dpc.refuse','dpc','reject','Reject the procurement',
   'Ends the case.','dpc.reject',NULL,NULL,true,true,true,50),

  ('pnc.agreed','pnc','forward','Conclude — agreement reached',
   'Records the negotiated price and raises the purchase proposal.','pnc.chair','purchase_proposal',NULL,true,true,true,10),
  ('pnc.return','pnc','send_back','Refer back to the purchase committee',
   'Returns the case with the negotiation summary.','pnc.chair','dpc','Returned from negotiation',true,false,true,20),
  ('pnc.failed','pnc','forward','Close — negotiation failed',
   'Ends the case without an award.','pnc.chair','closed','Closed — negotiation failed',true,true,true,30),

  ('proposal.approve','purchase_proposal','approve','Approve and raise the purchase order',
   'Clears the proposal and moves to purchase order.','proposal.approve','purchase_order',NULL,true,true,false,10),
  ('proposal.revise','purchase_proposal','request_clarification','Return for revision',
   'Holds the proposal for redrafting.','proposal.approve',NULL,'Returned for revision',true,false,false,20),
  ('proposal.refuse','purchase_proposal','reject','Reject the proposal',
   'Ends the case.','proposal.approve',NULL,NULL,true,true,false,30),

  ('po.issue','purchase_order','forward','Issue the purchase order',
   'Releases the order to the vendor and opens the goods receipt.','po.issue','goods_receipt',NULL,false,true,false,10),

  ('grn.forward','goods_receipt','forward','Forward for payment',
   'Sends the accepted quantities to the payment desk.','grn.create','payment_recommendation',NULL,false,false,false,10),

  ('payment.clear','payment_recommendation','approve','Approve payment and close',
   'Clears the payment and closes the case.','payment.process','closed',NULL,true,true,false,10),
  ('payment.hold','payment_recommendation','request_clarification','Hold the payment',
   'Keeps the case at the payment desk pending a query.','payment.process',NULL,'Payment on hold',true,false,false,20),
  ('payment.return','payment_recommendation','send_back','Return to stores',
   'Sends the case back for a goods receipt correction.','payment.process','goods_receipt','Returned to stores',true,false,false,30),
  ('payment.refuse','payment_recommendation','reject','Refuse the payment',
   'Ends the case.','payment.process',NULL,NULL,true,true,false,40)

ON CONFLICT (code) DO UPDATE SET
  stage = EXCLUDED.stage, action = EXCLUDED.action, label = EXCLUDED.label,
  description = EXCLUDED.description, permission = EXCLUDED.permission,
  target_stage = EXCLUDED.target_stage, entry_status = EXCLUDED.entry_status,
  requires_remarks = EXCLUDED.requires_remarks, requires_signature = EXCLUDED.requires_signature,
  chair_only = EXCLUDED.chair_only, sort_order = EXCLUDED.sort_order;

-- ===== Seed: starter lookups =====
INSERT INTO public.procurement_lookups (kind, name, code, sort_order) VALUES
  ('department','Electronics & Instrumentation','EI',10),
  ('department','Mechanical Engineering','ME',20),
  ('department','Civil & Infrastructure','CI',30),
  ('department','Information Technology','IT',40),
  ('department','Stores & Materials','SM',50),
  ('category','Capital Equipment',NULL,10),
  ('category','Consumables',NULL,20),
  ('category','Spares',NULL,30),
  ('category','Services',NULL,40),
  ('category','Civil Works',NULL,50),
  ('cost_centre','CC-1001 — Laboratory',NULL,10),
  ('cost_centre','CC-1002 — Workshop',NULL,20),
  ('cost_centre','CC-1003 — Site Office',NULL,30),
  ('procurement_type','Goods',NULL,10),
  ('procurement_type','Services',NULL,20),
  ('procurement_type','Works',NULL,30),
  ('priority','High',NULL,10),
  ('priority','Medium',NULL,20),
  ('priority','Low',NULL,30),
  ('unit','Nos.',NULL,10),
  ('unit','Set',NULL,20),
  ('unit','Metre',NULL,30),
  ('unit','Kilogram',NULL,40),
  ('unit','Litre',NULL,50),
  ('unit','Lot',NULL,60),
  ('warehouse','Central Stores',NULL,10),
  ('warehouse','Site Stores',NULL,20)
ON CONFLICT (kind, name) DO NOTHING;
