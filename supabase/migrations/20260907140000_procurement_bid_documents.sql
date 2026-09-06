-- Procurement, slice 4b: a bid's own paperwork, and a signature on the way out.
--
-- Two things the tender slice left undone.
--
-- **The papers arrive with the bid.** A bid is a claim — this firm can do the
-- work, holds these registrations, has done it before — and the certificates
-- backing that claim arrive in the same envelope. Until now a bidder was a row
-- of numbers and the certificates, if they were filed at all, were loose case
-- documents attributed to nobody. Attributing them at the moment they arrive is
-- what lets the technical evaluation ask "what did *this* firm actually send?"
-- three stages later, instead of a reader opening eleven PDFs to find out.
--
-- The mechanism is deliberately the one already here: a bid document is an
-- ordinary case document, so it rides the same ingest, OCR and embedding
-- pipeline as everything else and is answerable by the case assistant the
-- moment it finishes processing. All this migration adds is who it belongs to.
--
-- **Signing the hand-off.** Every other desk in the workflow signs the decision
-- that commits the organisation — finance clearing a budget, the committee
-- recommending, the authority approving, the officer issuing an order. The
-- tender desk was the one exception, and there is no principle behind that:
-- closing bidding and putting a set of bids in front of a committee is exactly
-- the kind of act the signature slice exists for.

-- ===== Whose bid a document belongs to =====

-- Nullable, because most case paperwork belongs to the case rather than to any
-- one firm — a requisition, a budget sanction, the notice itself.
--
-- ON DELETE SET NULL rather than CASCADE: removing a bidder from the roster
-- must not destroy the paper they sent. The document stays on the case,
-- attributed to nobody, which is the honest record of what happened.
ALTER TABLE public.procurement_case_documents
  ADD COLUMN IF NOT EXISTS bidder_id UUID
    REFERENCES public.procurement_bidders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_case_documents_bidder
  ON public.procurement_case_documents(bidder_id)
  WHERE bidder_id IS NOT NULL;

-- ===== Asking about one firm's papers =====

-- The old five-argument version has to go rather than sit alongside this one:
-- a call passing exactly the five named arguments would match both (this one
-- through its default) and Postgres would refuse it as ambiguous.
DROP FUNCTION IF EXISTS public.procurement_search_case_chunks(
  UUID, UUID, vector, DOUBLE PRECISION, INTEGER);

-- Retrieval over a case's paperwork, optionally narrowed to one bidder.
--
-- The narrowing matters more than it looks. Asked across a whole case, "does
-- this firm hold a valid electrical licence?" retrieves the licence *another*
-- bidder sent, and the answer is confidently wrong. Scoping to the bidder makes
-- an absent certificate look absent, which is the finding the evaluation
-- actually needs.
CREATE OR REPLACE FUNCTION public.procurement_search_case_chunks(
  _case_id UUID,
  _user_id UUID,
  query_embedding vector(1024),
  match_threshold DOUBLE PRECISION DEFAULT 0.0,
  match_count INTEGER DEFAULT 12,
  _bidder_id UUID DEFAULT NULL
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
    AND (_bidder_id IS NULL OR cd.bidder_id = _bidder_id)
    AND d.status = 'active'
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- How much of each bidder's submission has been read, so the roster can say so
-- rather than leaving somebody to wonder why an answer is thin thirty seconds
-- after the upload.
CREATE OR REPLACE FUNCTION public.procurement_bid_document_readiness(_case_id UUID)
RETURNS TABLE(
  bidder_id UUID, total BIGINT, indexed BIGINT, still_reading BIGINT, failed BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cd.bidder_id,
         count(*),
         count(*) FILTER (WHERE d.status = 'active'),
         count(*) FILTER (WHERE d.status IN ('queued', 'processing')),
         count(*) FILTER (WHERE d.status = 'failed')
  FROM public.procurement_case_documents cd
  JOIN public.documents d ON d.id = cd.document_id
  WHERE cd.case_id = _case_id
    AND cd.bidder_id IS NOT NULL
    AND public.procurement_can_view_case(auth.uid(), _case_id)
  GROUP BY cd.bidder_id
$$;

-- What the technical evaluation is judging each bid against.
--
-- Not an evaluation, and deliberately not a score: it assembles the tender's
-- own stated requirements — the eligibility text and each line of the published
-- bill — beside every bidder and what they sent, so the committee's questions
-- have somewhere to point. Turning that into a per-requirement verdict is the
-- technical evaluation slice's job, and it will read this.
CREATE OR REPLACE FUNCTION public.procurement_bid_submissions(_case_id UUID)
RETURNS TABLE(
  bidder_id UUID, vendor_id UUID, vendor_name TEXT, bid_status TEXT,
  document_count BIGINT, indexed_count BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.vendor_id, v.name, b.status,
         COALESCE(r.total, 0), COALESCE(r.indexed, 0)
  FROM public.procurement_bidders b
  JOIN public.procurement_vendors v ON v.id = b.vendor_id
  LEFT JOIN public.procurement_bid_document_readiness(_case_id) r ON r.bidder_id = b.id
  WHERE b.case_id = _case_id
    AND public.procurement_can_view_case(auth.uid(), _case_id)
  ORDER BY v.name
$$;

-- ===== The tender desk signs its hand-off =====

-- Both ways out, for the same reason: whichever one is taken, a set of bids
-- stops being the purchase officer's working list and becomes the record a
-- committee decides on. `tender.return` stays unsigned — sending a requisition
-- back for correction commits nobody to anything.
UPDATE public.procurement_stage_actions
   SET requires_signature = true
 WHERE code IN ('tender.to_tec', 'tender.to_commercial');

GRANT EXECUTE ON FUNCTION public.procurement_search_case_chunks(
  UUID, UUID, vector, DOUBLE PRECISION, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.procurement_bid_document_readiness(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_bid_submissions(UUID) TO authenticated;
