-- ===== Case paperwork is readable by the case, not only by its uploader =====
--
-- documents' own policy is "the person who uploaded it, or somebody with
-- folder access". That is right for a personal archive and wrong for a case
-- file: finance opening a requisition sees a row it cannot read, so the case
-- documents panel showed "Missing file" for paperwork somebody else attached.
-- This adds one more way in, and only that: read access to a document
-- attached to a case the reader is already allowed to see.
DROP POLICY IF EXISTS "Users can view documents attached to their procurement cases" ON public.documents;
CREATE POLICY "Users can view documents attached to their procurement cases" ON public.documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procurement_case_documents cd
    WHERE cd.document_id = documents.id
      AND public.procurement_can_view_case(auth.uid(), cd.case_id)
  ));
