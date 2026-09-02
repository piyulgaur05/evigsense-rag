-- Legacy single-user admin grant, kept for existing installs.
--
-- Originally a bare INSERT ... VALUES with no ON CONFLICT. Because
-- scripts/apply-migrations.sh keeps no ledger and re-applies every file on
-- every run, that aborted the whole run (ON_ERROR_STOP=1) on the second
-- invocation via UNIQUE(user_id, role) -- and on a fresh DB it granted admin to
-- a UUID that does not exist, since user_roles has no FK on user_id.
--
-- Now guarded on the user actually existing, and idempotent.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE u.id = '573cc3c7-0744-41ec-ae00-a9003848e2cb'
ON CONFLICT (user_id, role) DO NOTHING;
