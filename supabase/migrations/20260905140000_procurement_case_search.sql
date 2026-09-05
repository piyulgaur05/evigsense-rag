-- Two changes the requisition needed once people started using it.
--
-- 1. Supporting documents are no longer listed as a gap. The database never
--    required one -- procurement_guard_requisition_ready checks the title,
--    the department, the needed-by date and the cost -- but the portal read
--    the gap list as a blocker, so a requisition for a service with nothing to
--    attach could not be raised. The checklist now lists only what actually
--    stops the case, and the portal suggests paperwork rather than demanding
--    it.
--
-- 2. Case-scoped retrieval, so the assistant can answer questions about a
--    case rather than about one document at a time.

-- ===== The gate, without the document line =====
CREATE OR REPLACE FUNCTION public.procurement_requisition_gaps(_case_id UUID)
RETURNS TEXT[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN btrim(COALESCE(c.title, '')) = '' THEN 'A title' END,
    CASE WHEN c.department_id IS NULL THEN 'The department it is for' END,
    CASE WHEN r.id IS NULL OR r.required_by IS NULL THEN 'The date it is needed by' END,
    CASE WHEN COALESCE(c.estimated_cost, 0) <= 0 THEN 'An estimated cost above zero' END
  ], NULL)
  FROM public.procurement_cases c
  LEFT JOIN public.procurement_requisitions r ON r.case_id = c.id
  WHERE c.id = _case_id
$$;

-- ===== Case-scoped retrieval =====

-- search_documents_by_embedding scopes to the chunks the asker uploaded, which
-- is right for a personal archive and wrong for a case file: a finance officer
-- asking about a requisition is asking about paperwork the requester uploaded.
--
-- This searches the documents attached to one case, for anyone allowed to see
-- that case, and returns nothing to anyone who is not. The user id is passed
-- in rather than read from auth.uid() because the edge function calls it with
-- the service role after validating the caller's token itself.
CREATE OR REPLACE FUNCTION public.procurement_search_case_chunks(
  _case_id UUID,
  _user_id UUID,
  query_embedding vector(1024),
  match_threshold DOUBLE PRECISION DEFAULT 0.0,
  match_count INTEGER DEFAULT 12
)
RETURNS TABLE(
  document_id UUID,
  document_title TEXT,
  chunk_text TEXT,
  similarity DOUBLE PRECISION,
  page_number INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  IF NOT public.procurement_can_view_case(_user_id, _case_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    de.document_id,
    d.title AS document_title,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity,
    de.page_number
  FROM public.document_embeddings de
  JOIN public.documents d ON d.id = de.document_id
  JOIN public.procurement_case_documents cd ON cd.document_id = de.document_id
  WHERE cd.case_id = _case_id
    AND d.status = 'active'
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- How much of a case's paperwork is ready to be asked about. Drives the
-- assistant panel's "3 of 4 documents indexed" line, so nobody wonders why an
-- answer is thin thirty seconds after uploading a file.
CREATE OR REPLACE FUNCTION public.procurement_case_document_readiness(_case_id UUID)
RETURNS TABLE(total BIGINT, indexed BIGINT, still_reading BIGINT, failed BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*),
         count(*) FILTER (WHERE d.status = 'active'),
         count(*) FILTER (WHERE d.status IN ('queued', 'processing')),
         count(*) FILTER (WHERE d.status = 'failed')
  FROM public.procurement_case_documents cd
  JOIN public.documents d ON d.id = cd.document_id
  WHERE cd.case_id = _case_id
    AND public.procurement_can_view_case(auth.uid(), _case_id)
$$;

GRANT EXECUTE ON FUNCTION public.procurement_search_case_chunks(UUID, UUID, vector, DOUBLE PRECISION, INTEGER)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procurement_case_document_readiness(UUID) TO authenticated;
