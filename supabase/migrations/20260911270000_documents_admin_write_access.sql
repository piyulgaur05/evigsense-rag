-- File Management now lists every document an admin can SELECT (see the
-- "Admins can view all documents" policy below), including ones another user
-- created — e.g. procurement case files owned by a requester account. But
-- UPDATE/DELETE on public.documents only ever allowed the owner or a folder
-- manager, so an admin deleting one of those rows got a silent 0-row RLS
-- no-op: the client's delete().in(...) call still returned no error, so the
-- UI reported success while the row (and the ones still referencing it)
-- stayed put. Mirror the existing admin SELECT bypass for UPDATE and DELETE.
CREATE POLICY "Admins can update all documents"
  ON public.documents
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all documents"
  ON public.documents
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
