-- Clean up orphaned role grants.
--
-- public.user_roles has no FK on user_id, and 20260302040030 inserted a
-- hardcoded UUID unconditionally. On any DB where that user never existed the
-- result is an admin row pointing at nothing -- which also makes
-- prevent_last_admin_removal() (20260825170000) count a phantom admin, so the
-- guard stops protecting the only real one.
--
-- Idempotent: a no-op once there is nothing orphaned.
DELETE FROM public.user_roles ur
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = ur.user_id
);
