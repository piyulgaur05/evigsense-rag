-- Finance can already write procurement_budget_heads/commitments at the RLS
-- layer (via finance.approve), but the only UI screen that edits budget heads
-- lives behind master_data.manage, a bundle that also covers vendors, lookups
-- and committees. Give finance a narrower permission scoped to budget heads
-- only, instead of the broader bundle.

INSERT INTO public.procurement_permissions (key, label, stage) VALUES
  ('budget.manage', 'Manage budget heads', 'Administration')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, stage = EXCLUDED.stage;

-- proc_admin's blanket grant in the foundation migration ran once, against
-- the permission catalogue as it existed then, so it will not retroactively
-- pick up a permission created here.
INSERT INTO public.procurement_role_permissions (role, permission) VALUES
  ('finance_user','budget.manage'),
  ('proc_admin','budget.manage')
ON CONFLICT DO NOTHING;

-- Make the grant explicit in the budget RLS policies rather than relying on
-- the coincidental overlap with finance.approve.
DROP POLICY IF EXISTS "Finance and admins can manage budget heads" ON public.procurement_budget_heads;
CREATE POLICY "Finance and admins can manage budget heads" ON public.procurement_budget_heads
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'finance.approve')
         OR public.has_procurement_permission(auth.uid(), 'master_data.manage')
         OR public.has_procurement_permission(auth.uid(), 'budget.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'finance.approve')
              OR public.has_procurement_permission(auth.uid(), 'master_data.manage')
              OR public.has_procurement_permission(auth.uid(), 'budget.manage'));

DROP POLICY IF EXISTS "Finance and admins can manage budget commitments" ON public.procurement_budget_commitments;
CREATE POLICY "Finance and admins can manage budget commitments" ON public.procurement_budget_commitments
  FOR ALL TO authenticated
  USING (public.has_procurement_permission(auth.uid(), 'finance.approve')
         OR public.has_procurement_permission(auth.uid(), 'master_data.manage')
         OR public.has_procurement_permission(auth.uid(), 'budget.manage'))
  WITH CHECK (public.has_procurement_permission(auth.uid(), 'finance.approve')
              OR public.has_procurement_permission(auth.uid(), 'master_data.manage')
              OR public.has_procurement_permission(auth.uid(), 'budget.manage'));
