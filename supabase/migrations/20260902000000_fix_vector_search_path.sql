-- search_documents_by_embedding's SECURITY DEFINER search_path was locked to
-- 'public' only (20260524000000). This self-hosted stack installs pgvector
-- into the `extensions` schema on purpose (see
-- docker/volumes/db/init/z0-extensions.sql), so the <=> operator was
-- unresolvable *inside* the function's restricted execution context:
--   operator does not exist: extensions.vector <=> extensions.vector
-- The type itself still resolved (the session/database search_path includes
-- extensions), which is why this only broke at query time, not at CREATE
-- FUNCTION time -- and why it went unnoticed until the first real search
-- against a real embedding.
CREATE OR REPLACE FUNCTION public.search_documents_by_embedding(
  query_embedding vector(1024),
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5,
  filter_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  document_id uuid,
  document_title text,
  chunk_text text,
  similarity double precision,
  page_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.title AS document_title,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity,
    de.page_number
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE
    (filter_user_id IS NULL OR d.created_by = filter_user_id)
    AND d.status = 'active'
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
