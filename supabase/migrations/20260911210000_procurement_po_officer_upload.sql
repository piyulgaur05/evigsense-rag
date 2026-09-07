-- Every other stage-owning role that produces paperwork of its own --
-- the requester, the tender/tec/tec-member trio, receipt and payment --
-- holds upload_docs/docs.upload. po_officer was the one left out, which
-- meant the purchase order desk could not file anything on the case at
-- all, generated or manually scanned, until this. Surfaced by the signed
-- order PDF's own "file this on the case" step failing with a plain 403.

INSERT INTO public.procurement_role_permissions (role, permission) VALUES
  ('po_officer', 'upload_docs'),
  ('po_officer', 'docs.upload')
ON CONFLICT DO NOTHING;
