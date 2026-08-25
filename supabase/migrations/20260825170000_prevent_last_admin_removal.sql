-- Prevent deleting the last remaining admin role row, whether via the
-- Admin UI, direct REST call, or SQL. A UI-only guard was bypassable and
-- had already caused a full self-lockout once.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'admin' AND (
    SELECT count(*) FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id
  ) = 0 THEN
    RAISE EXCEPTION 'Cannot remove the last remaining admin role';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin_removal
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();
