-- =========================================================================
-- Collabora Online (WOPI) support for translated documents.
--
-- Once a translation is opened in Collabora it is converted to .docx and the
-- .docx becomes the source of truth; `translated_markdown` is retained as the
-- pre-edit source but is no longer authoritative.
-- =========================================================================

-- ---------- docx artifact tracking on document_markdown --------------------
ALTER TABLE public.document_markdown
  ADD COLUMN IF NOT EXISTS docx_storage_path      TEXT,
  ADD COLUMN IF NOT EXISTS docx_updated_at        TIMESTAMPTZ,
  -- Bumped on every PutFile. Surfaced to Collabora as WOPI `Version`, which it
  -- caches on — it MUST change whenever the bytes change.
  ADD COLUMN IF NOT EXISTS docx_version           BIGINT NOT NULL DEFAULT 0,
  -- WOPI lock (X-WOPI-Lock). Single-writer guard against two tabs racing saves.
  ADD COLUMN IF NOT EXISTS wopi_lock              TEXT,
  ADD COLUMN IF NOT EXISTS wopi_lock_expires_at   TIMESTAMPTZ;

-- ---------- wopi_tokens ----------------------------------------------------
-- Collabora cannot set custom headers, so WOPI callbacks authenticate with an
-- `?access_token=` query param. We mint scoped, revocable, per-document tokens
-- rather than handing out the user's Supabase JWT: JWT_EXP is 3600s and would
-- expire mid-edit, and the token is visible in Collabora's URLs and access logs.
CREATE TABLE IF NOT EXISTS public.wopi_tokens (
  token       TEXT PRIMARY KEY DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '12 hours',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with NO policies: reachable only via the service role (the edge
-- function). No client may read or forge tokens.
ALTER TABLE public.wopi_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wopi_tokens_document_id ON public.wopi_tokens(document_id);
CREATE INDEX IF NOT EXISTS idx_wopi_tokens_expires_at  ON public.wopi_tokens(expires_at);

-- Housekeeping for expired tokens; safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.cleanup_expired_wopi_tokens()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.wopi_tokens WHERE expires_at < now();
$$;
