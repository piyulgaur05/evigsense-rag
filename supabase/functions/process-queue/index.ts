import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Accept either internal secret OR valid JWT for authenticated users
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let isAuthorized = false;
    
    // Check internal secret first (for function-to-function calls)
    if (expectedSecret && internalSecret === expectedSecret) {
      isAuthorized = true;
      console.log('[QUEUE] Authorized via internal secret');
    }
    
    // If no secret, check for valid JWT (for client calls)
    if (!isAuthorized && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (user && !authError) {
        isAuthorized = true;
        console.log(`[QUEUE] Authorized via JWT for user: ${user.id}`);
      }
    }
    
    if (!isAuthorized) {
      console.error('[QUEUE] Unauthorized: Invalid or missing credentials');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[QUEUE] Starting queue processor...');

    // A large scan is processed one page range per invocation so no single call
    // outlives the edge runtime's wall-clock limit. Such an item stays in
    // 'processing' between ranges, carrying its progress in metadata, so
    // in-flight work is resumed before a new document is started.
    const { data: resumeItem, error: resumeError } = await supabase
      .from('document_processing_queue')
      .select('*, documents(*)')
      .eq('status', 'processing')
      .eq('metadata->>phase', 'extracting')
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (resumeError) {
      console.error('[QUEUE] Error fetching resumable items:', resumeError);
      throw resumeError;
    }

    let queueItem = resumeItem;

    if (queueItem) {
      console.log(`[QUEUE] Resuming in-flight document ${queueItem.document_id}`);
    } else {
      // Get next pending item from queue
      const { data: pendingItem, error: queueError } = await supabase
        .from('document_processing_queue')
        .select('*, documents(*)')
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (queueError) {
        console.error('[QUEUE] Error fetching queue:', queueError);
        throw queueError;
      }

      queueItem = pendingItem;
    }

    if (!queueItem) {
      console.log('[QUEUE] No pending items in queue');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending items' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[QUEUE] Processing document ${queueItem.document_id}`);

    // Check if document still exists
    const document = queueItem.documents;
    if (!document) {
      console.log(`[QUEUE] Document ${queueItem.document_id} no longer exists, removing from queue`);
      await supabase
        .from('document_processing_queue')
        .delete()
        .eq('document_id', queueItem.document_id);
      
      // Continue processing next item (internal call with secret)
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecret || '' }
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'Document no longer exists, removed from queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as processing
    await supabase
      .from('document_processing_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);

    // Update document status
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', queueItem.document_id);

    try {
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      // Get file size to determine if we need chunking
      const storagePath = document.storage_path.split('/');
      const { data: fileList } = await supabase.storage
        .from('documents')
        .list(storagePath[0], {
          search: storagePath[1]
        });
      
      const fileSize = fileList?.[0]?.metadata?.size || 0;
      const fileSizeMB = fileSize / (1024 * 1024);

      console.log(`[QUEUE] Document size: ${fileSizeMB.toFixed(2)}MB`);

      // Reading an embedded text layer is fast, so digital PDFs can take wide
      // ranges. OCR runs a vision model per page (tens of seconds even
      // parallelised), so a scanned PDF needs narrow ranges to keep each
      // extract-document-text call inside the edge runtime's ~400s wall-clock
      // limit — that limit is what silently killed large scans before.
      const TEXT_CHUNK_SIZE = 100;
      const OCR_CHUNK_SIZE = 5;

      const progress = (queueItem.metadata ?? {}) as Record<string, unknown>;
      const isResuming = progress.phase === 'extracting';

      let totalPages = 0;
      let isScanned = false;
      let CHUNK_SIZE = TEXT_CHUNK_SIZE;
      let numChunks = 0;
      let nextChunk = 0;
      let needsChunking = false;

      if (isResuming) {
        // Sizing was settled on the first invocation; picking up where it left off.
        totalPages = Number(progress.totalPages) || 0;
        isScanned = progress.isScanned === true;
        CHUNK_SIZE = Number(progress.chunkSize) || TEXT_CHUNK_SIZE;
        numChunks = Number(progress.numChunks) || 0;
        nextChunk = Number(progress.nextChunk) || 0;
        needsChunking = true;
      } else {
        const isPdf = (document.mime_type || '') === 'application/pdf';

        if (isPdf) {
          // Probe page 1 to size the job. Stores nothing; OCR is not run.
          const { data: probe, error: probeError } = await supabase.functions.invoke(
            'extract-document-text',
            {
              body: {
                documentId: queueItem.document_id,
                startPage: 1,
                endPage: 1,
                probe: true,
              },
              headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
            }
          );

          if (probeError || !probe?.totalPages) {
            throw new Error('Failed to determine document size');
          }

          totalPages = probe.totalPages;
          isScanned = probe.isScanned === true;
          console.log(`[QUEUE] PDF has ${totalPages} pages, scanned=${isScanned}`);
        }

        CHUNK_SIZE = isScanned ? OCR_CHUNK_SIZE : TEXT_CHUNK_SIZE;
        // A scanned PDF is chunked on page count alone — a 40-page scan can sit
        // well under 1MB and still take far longer than the wall-clock limit.
        needsChunking = isPdf && totalPages > CHUNK_SIZE && (isScanned || fileSizeMB > 1);
        numChunks = needsChunking ? Math.ceil(totalPages / CHUNK_SIZE) : 0;
        // A retried item keeps its progress, so a failure near the end does not
        // start the walk over from page 1.
        nextChunk = Number(progress.chunkSize) === CHUNK_SIZE ? Number(progress.nextChunk) || 0 : 0;
      }

      if (needsChunking) {
        const i = nextChunk;
        const startPage = i * CHUNK_SIZE + 1;
        const endPage = Math.min((i + 1) * CHUNK_SIZE, totalPages);

        console.log(`[QUEUE] Processing chunk ${i + 1}/${numChunks}: pages ${startPage}-${endPage}`);

        // Extraction is idempotent per range, so a retry (or an overlapping
        // invocation) costs a lookup rather than a repeated OCR run.
        const { data: existingChunk } = await supabase
          .from('document_chunks')
          .select('id')
          .eq('document_id', queueItem.document_id)
          .eq('chunk_index', i)
          .maybeSingle();

        let wholeDocumentConverted = false;

        if (existingChunk) {
          console.log(`[QUEUE] Chunk ${i} already extracted, skipping`);
        } else {
          const { data: extractResult, error: chunkError } = await supabase.functions.invoke(
            'extract-document-text',
            {
              body: {
                documentId: queueItem.document_id,
                startPage,
                endPage,
                chunkIndex: i
              },
              headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
            }
          );

          if (chunkError) throw chunkError;

          // A ranged result covers only its own pages. Only a whole-document
          // conversion means there is nothing further to extract.
          wholeDocumentConverted = !!(extractResult?.converted && !extractResult?.chunked);
        }

        const isLastChunk = i + 1 >= numChunks;

        if (!wholeDocumentConverted && !isLastChunk) {
          // Hand the next range to a fresh invocation with its own time budget.
          await supabase
            .from('document_processing_queue')
            .update({
              status: 'processing',
              metadata: {
                ...progress,
                phase: 'extracting',
                totalPages,
                isScanned,
                chunkSize: CHUNK_SIZE,
                numChunks,
                nextChunk: i + 1,
              },
            })
            .eq('id', queueItem.id);

          await supabase
            .from('documents')
            .update({
              content_text: `Extracting text: ${i + 1}/${numChunks} chunks completed`
            })
            .eq('id', queueItem.document_id);

          const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
          supabase.functions.invoke('process-queue', {
            headers: { 'x-internal-secret': internalSecret || '' }
          });

          console.log(`[QUEUE] Chunk ${i + 1}/${numChunks} done, handing off to next invocation`);

          return new Response(
            JSON.stringify({
              success: true,
              documentId: queueItem.document_id,
              message: `Extracted pages ${startPage}-${endPage} (${i + 1}/${numChunks}), continuing`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extraction is done — drop the resume marker so this item is not
        // picked up again while the remaining phases run.
        await supabase
          .from('document_processing_queue')
          .update({ metadata: { ...progress, phase: 'finalizing', nextChunk: numChunks } })
          .eq('id', queueItem.id);

        console.log('[QUEUE] Text extraction completed, generating embeddings in parallel');

        // Generate embeddings for all chunks in parallel
        const { error: embeddingError } = await supabase.functions.invoke(
          'generate-embeddings',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (embeddingError) throw embeddingError;

        // Merge the per-range chunks into documents.content_text. Must run
        // after embeddings, which read document_chunks — the merge deletes them.
        // Without this the document is left showing the progress placeholder.
        const { error: mergeError } = await supabase.functions.invoke(
          'merge-document-chunks',
          {
            body: { documentId: queueItem.document_id, totalPages },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (mergeError) {
          // Embeddings already exist, so the document is searchable either way.
          console.error('[QUEUE] Chunk merge failed, document text may be incomplete:', mergeError);
        }

      } else {
        // Standard processing for small files
        console.log('[QUEUE] Processing small document in single pass');
        
        const { error: extractError } = await supabase.functions.invoke(
          'extract-document-text',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (extractError) throw extractError;

        console.log('[QUEUE] Text extraction completed, generating embeddings');

        // Generate embeddings
        const { error: embeddingError } = await supabase.functions.invoke(
          'generate-embeddings',
          {
            body: { documentId: queueItem.document_id },
            headers: { Authorization: `Bearer ${serviceRoleKey}`, 'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '' }
          }
        );

        if (embeddingError) throw embeddingError;
      }

      // Mark as completed
      await supabase
        .from('document_processing_queue')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', queueItem.id);

      console.log(`[QUEUE] Successfully processed document ${queueItem.document_id}`);

      // Immediately trigger next queue processing (internal call with secret)
      const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecret || '' }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          documentId: queueItem.document_id,
          message: 'Document processed successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      console.error(`[QUEUE] Error processing document:`, processingError);

      // Increment retry count
      const newRetryCount = queueItem.retry_count + 1;
      
      if (newRetryCount >= queueItem.max_retries) {
        // Max retries reached, mark as failed
        await supabase
          .from('document_processing_queue')
          .update({ 
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString()
          })
          .eq('id', queueItem.id);

        await supabase
          .from('documents')
          .update({ 
            status: 'error',
            content_text: `Processing failed: ${errorMessage}`
          })
          .eq('id', queueItem.document_id);

        console.log(`[QUEUE] Document ${queueItem.document_id} failed after ${newRetryCount} retries`);
      } else {
        // Reset to pending for retry
        await supabase
          .from('document_processing_queue')
          .update({ 
            status: 'pending',
            retry_count: newRetryCount,
            error_message: errorMessage
          })
          .eq('id', queueItem.id);

        console.log(`[QUEUE] Document ${queueItem.document_id} will be retried (attempt ${newRetryCount}/${queueItem.max_retries})`);
      }

      // Continue processing queue even if this item failed (internal call with secret)
      const internalSecretRetry = Deno.env.get('INTERNAL_FUNCTION_SECRET');
      supabase.functions.invoke('process-queue', {
        headers: { 'x-internal-secret': internalSecretRetry || '' }
      });

      throw processingError;
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[QUEUE] Queue processor error:', error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
