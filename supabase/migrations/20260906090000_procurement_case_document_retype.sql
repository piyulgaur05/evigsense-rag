-- ===== A document on a case can be relabelled after it is attached =====
--
-- procurement_case_documents had policies for INSERT, SELECT and DELETE but
-- none for UPDATE, so with RLS on, every update matched zero rows and returned
-- success. Nothing had exercised that until now: the type was chosen from a
-- dropdown *before* the file could be attached, and never changed afterwards.
--
-- Making the type a decision in front of the attach button was the wrong shape.
-- A requester with an estimate in hand had to answer a twenty-two-item taxonomy
-- question before the file would go on the case, and the answer mattered to
-- nobody at that moment. Attaching now guesses the type from the stage the case
-- is at, and the row can be corrected afterwards by whoever put it there —
-- which needs this policy to exist.
--
-- Scoped exactly like DELETE is: the uploader, or the procurement
-- administrator. Deliberately NOT everyone who can see the case — relabelling
-- somebody else's paperwork on a file that carries legal weight is not a
-- courtesy, and the audit trail does not record it.
--
-- doc_type is the only column the client updates. The WITH CHECK does not
-- freeze the other columns — Postgres has no per-column UPDATE policy here —
-- but it does re-apply both tests to the row as it would be after the write, so
-- an uploader cannot hand their row to somebody else or move it onto a case
-- they cannot see.
DROP POLICY IF EXISTS "Uploaders can relabel their own case documents" ON public.procurement_case_documents;
CREATE POLICY "Uploaders can relabel their own case documents" ON public.procurement_case_documents
  FOR UPDATE TO authenticated
  USING (
    (uploaded_by = auth.uid() OR public.has_procurement_role(auth.uid(), 'proc_admin'))
    AND public.procurement_can_view_case(auth.uid(), case_id)
  )
  WITH CHECK (
    (uploaded_by = auth.uid() OR public.has_procurement_role(auth.uid(), 'proc_admin'))
    AND public.procurement_can_view_case(auth.uid(), case_id)
  );
