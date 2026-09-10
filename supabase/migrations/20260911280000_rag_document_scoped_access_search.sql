-- Document Chat at /document-chat/:id can be opened by anyone the "documents"
-- RLS SELECT policies let read the row -- the owner, a folder viewer, an
-- admin, a signer, or (the common case for procurement) anyone who can view
-- the case the file is attached to via procurement_can_view_case. But
-- rag-assistant's per-document search ran through search_documents_by_embedding,
-- whose WHERE clause only ever matched "filter_user_id IS NULL OR
-- d.created_by = filter_user_id" -- so a finance officer or admin opening a
-- requester's BOQ got zero chunks back every time, and the model answered
-- as if no document existed at all, even though the viewer could see the
-- file and its content_text just fine.
--
-- can_view_document() mirrors the OR of every "documents" SELECT policy so
-- there is one place that answers "can this user see this document", reused
-- by the new document-scoped search below instead of re-deriving it.
CREATE OR REPLACE FUNCTION public.can_view_document(_user_id uuid, _document_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  doc RECORD;
  signer_email text;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN
    RETURN TRUE;
  END IF;

  SELECT created_by, folder_id INTO doc FROM public.documents WHERE id = _document_id;
  IF doc IS NULL THEN
    RETURN FALSE;
  END IF;

  IF doc.created_by = _user_id THEN
    RETURN TRUE;
  END IF;

  IF doc.folder_id IS NOT NULL AND public.has_folder_access(_user_id, doc.folder_id, 'view') THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.procurement_case_documents cd
    WHERE cd.document_id = _document_id
      AND public.procurement_can_view_case(_user_id, cd.case_id)
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT email INTO signer_email FROM auth.users WHERE id = _user_id;
  IF EXISTS (
    SELECT 1 FROM public.signature_requests sr
    JOIN public.document_signers ds ON ds.signature_request_id = sr.id
    WHERE sr.document_id = _document_id
      AND (ds.signer_user_id = _user_id OR ds.signer_email = signer_email)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Same shape as search_documents_by_embedding / procurement_search_case_chunks,
-- but scoped to one document and gated by can_view_document() instead of
-- ownership -- rag-assistant calls this whenever a documentId is given.
CREATE OR REPLACE FUNCTION public.search_document_chunks_for_user(
  _document_id uuid,
  _user_id uuid,
  query_embedding vector,
  match_threshold double precision DEFAULT 0.0,
  match_count integer DEFAULT 50
)
RETURNS TABLE(document_id uuid, document_title text, chunk_text text, similarity double precision, page_number integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.can_view_document(_user_id, _document_id) THEN
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
  WHERE de.document_id = _document_id
    AND d.status = 'active'
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
