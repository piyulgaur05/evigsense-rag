import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from 'https://esm.sh/pdfjs-serverless@0.3.2';
import JSZip from "https://esm.sh/jszip@3.10.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { ocrToPlainText, ocrPdf } from "../_shared/ocr.ts";
import { extractAndStorePdfImages, PageImage, PageImageMap } from "../_shared/pdfImages.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const requestSchema = z.union([
  z.object({
    documentId: z.string().uuid("Invalid document ID"),
    startPage: z.number().optional(),
    endPage: z.number().optional(),
    // Identifies this page range's row in document_chunks. Supplied by the
    // orchestrator (process-queue) so ranges of any size stay collision-free;
    // the legacy fallback below assumes 50-page ranges and collides otherwise.
    chunkIndex: z.number().optional(),
    // Page-count/scanned probe: read page 1 to size the job, store nothing.
    probe: z.boolean().optional(),
    skipConversionCheck: z.boolean().optional(),
  }),
  z.object({
    filePath: z.string(),
    bucketName: z.string(),
    mimeType: z.string().optional(),
    startPage: z.number().optional(),
    endPage: z.number().optional(),
    chunkIndex: z.number().optional(),
    // Page-count/scanned probe: read page 1 to size the job, store nothing.
    probe: z.boolean().optional(),
    skipConversionCheck: z.boolean().optional(),
  }),
]);

/**
 * Rebuilds per-page offsets from OCR markdown. The relay emits one
 * `# Page <n>` heading per page (absolute page numbers), joined by `---`, so
 * the headings mark where each page's text starts.
 */
function pageMapFromOcrMarkdown(
  markdown: string,
  firstPage: number,
): Array<{ page: number, startIndex: number, endIndex: number }> {
  const headings = [...markdown.matchAll(/^# Page (\d+)\s*$/gm)];

  if (headings.length === 0) {
    return [{ page: firstPage, startIndex: 0, endIndex: markdown.length }];
  }

  return headings.map((match, i) => ({
    page: parseInt(match[1], 10),
    startIndex: match.index ?? 0,
    endIndex: i + 1 < headings.length ? (headings[i + 1].index ?? markdown.length) : markdown.length,
  }));
}

/**
 * Rebuilds one page's text, splicing figure Markdown in at the vertical
 * position the figure occupies on the page.
 *
 * pdf.js reports each text item's position in PDF user space (origin at the
 * bottom-left), while the relay reports a figure's top as a fraction measured
 * down from the page top — so both are converted to the same "fraction from
 * the top" before being interleaved. Getting this right is what keeps a figure
 * next to its caption, and therefore in the same retrieval chunk as the words
 * that describe it.
 */
function composePageText(items: any[], pageHeight: number, images: PageImage[]): string {
  if (images.length === 0) {
    return items.map((item: any) => item.str).join(' ');
  }

  const parts: string[] = [];
  const pending = [...images];

  for (const item of items) {
    // transform[5] is the item's baseline y in PDF space (0 = page bottom).
    const y = Array.isArray(item.transform) ? item.transform[5] : 0;
    const yFromTop = pageHeight > 0 ? 1 - y / pageHeight : 1;

    while (pending.length > 0 && pending[0].yTopFraction <= yFromTop) {
      parts.push(`\n\n${pending.shift()!.markdown}\n\n`);
    }
    parts.push(item.str);
    parts.push(' ');
  }

  // Anything below the last line of text, plus figures with no known placement.
  for (const image of pending) {
    parts.push(`\n\n${image.markdown}\n\n`);
  }

  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Extract text from PDF using pdfjs-serverless with page numbers
async function extractTextFromPDF(
  fileData: Uint8Array,
  startPage?: number,
  endPage?: number,
  pageImages?: PageImageMap,
): Promise<{ text: string, pageMap: Array<{ page: number, startIndex: number, endIndex: number }>, totalPages: number }> {
  try {
    console.log('Parsing PDF with pdfjs-serverless...');
    const doc = await getDocument(fileData).promise;
    const numPages = doc.numPages;
    console.log(`PDF has ${numPages} pages`);

    // Determine page range to process
    const startIdx = startPage || 1;
    const endIdx = endPage || numPages;

    console.log(`Processing pages ${startIdx} to ${endIdx} of ${numPages}`);

    const textPages = [];
    const pageMap = [];
    let currentIndex = 0;

    for (let pageNum = startIdx; pageNum <= endIdx; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      // page.view is [x0, y0, x1, y1] in PDF units.
      const pageHeight = Array.isArray(page.view) ? page.view[3] - page.view[1] : 0;
      const pageText = composePageText(
        textContent.items,
        pageHeight,
        pageImages?.get(pageNum) ?? [],
      );

      const startIndex = currentIndex;
      const endIndex = currentIndex + pageText.length;
      
      pageMap.push({ page: pageNum, startIndex, endIndex });
      textPages.push(pageText);
      
      // Add separator length to index (2 for '\n\n')
      currentIndex = endIndex + 2;
    }
    
    return {
      text: textPages.join('\n\n'),
      pageMap,
      totalPages: numPages
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
}

// Extract text from a scanned PDF by OCR-ing individual pages
async function extractTextFromScannedPDF(fileData: Uint8Array): Promise<string> {
  try {
    console.log('Processing scanned PDF with page-by-page OCR...');
    const doc = await getDocument(fileData).promise;
    const numPages = doc.numPages;
    console.log(`Scanned PDF has ${numPages} pages, extracting with OCR...`);
    
    // Limit to first 5 pages for free OCR API
    const maxPages = Math.min(numPages, 5);
    const textPages = [];
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`OCR processing page ${pageNum}/${maxPages}...`);
      const page = await doc.getPage(pageNum);
      
      // Render page to canvas-like data
      const viewport = page.getViewport({ scale: 2.0 });
      
      // Note: This is a simplified approach. In production, you'd render the page
      // to an actual image format first. For now, we'll just inform the user.
      console.log(`Page ${pageNum} dimensions: ${viewport.width}x${viewport.height}`);
    }
    
    // For multi-page scanned PDFs, inform user of limitation
    if (numPages > 1) {
      console.log('Multi-page scanned PDF detected. OCR on full document is limited by API constraints.');
      return `[Scanned PDF with ${numPages} pages detected. Text extraction from scanned PDFs is limited. Please use a searchable PDF or extract individual pages as images for better results.]`;
    }
    
    return '';
  } catch (error) {
    console.error('Scanned PDF extraction error:', error);
    throw error;
  }
}

// Extract text from DOCX using JSZip (treats as single page document)
async function extractTextFromDOCX(fileData: Uint8Array): Promise<{ text: string, pageMap: Array<{ page: number, startIndex: number, endIndex: number }> }> {
  try {
    console.log('Extracting text from DOCX...');
    const zip = await JSZip.loadAsync(fileData);
    const documentXml = await zip.file('word/document.xml')?.async('text');
    
    if (!documentXml) {
      throw new Error('Could not find document.xml in DOCX file');
    }
    
    // Extract text from XML by removing tags
    const text = documentXml
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`Extracted ${text.length} characters from DOCX`);
    
    // Treat DOCX as single page document
    return {
      text,
      pageMap: [{ page: 1, startIndex: 0, endIndex: text.length }]
    };
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw error;
  }
}

// Extract text from images using Chandra OCR (LM Studio VLM or native server)
async function extractTextFromImage(fileData: Uint8Array, mimeType: string = 'image/png'): Promise<string> {
  try {
    console.log(`Extracting text using Chandra OCR for type: ${mimeType}...`);
    const extractedText = (await ocrToPlainText(fileData, mimeType)).trim();
    console.log(`Extracted ${extractedText.length} characters via Chandra OCR`);
    if (extractedText.length === 0) {
      throw new Error('OCR returned no text. The document may be unreadable.');
    }
    return extractedText;
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const requestData = validationResult.data;
    
    // Use service role key to bypass RLS for background processing
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if called with internal secret (function-to-function) or user auth (external)
    const authHeader = req.headers.get('Authorization');
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const isInternalCall =
      (expectedSecret && internalSecret === expectedSecret) ||
      authHeader?.includes(serviceRoleKey || '');

    let user = null;

    if (!isInternalCall) {
      // External call - authenticate user
      if (!authHeader) throw new Error('Not authenticated');

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user: authenticatedUser } } = await supabaseAuth.auth.getUser();
      if (!authenticatedUser) throw new Error('Not authenticated');
      user = authenticatedUser;
    }
    // For internal calls, skip user authentication

    let storagePath: string;
    let bucketName: string;
    let mimeType: string;
    let documentId: string | undefined;
    const startPage = 'startPage' in requestData ? requestData.startPage : undefined;
    const endPage = 'endPage' in requestData ? requestData.endPage : undefined;
    const chunkIndexOverride = 'chunkIndex' in requestData ? requestData.chunkIndex : undefined;
    const isProbe = 'probe' in requestData && requestData.probe === true;

    // Check if this is a document extraction or direct file extraction
    if ('documentId' in requestData) {
      documentId = requestData.documentId;
      console.log('Extracting text for document:', documentId, startPage ? `(pages ${startPage}-${endPage})` : '');

      // Get document
      let query = supabase
        .from('documents')
        .select('id, title, storage_path, mime_type, created_by')
        .eq('id', documentId);
      
      // Only filter by created_by for external user calls
      if (!isInternalCall && user) {
        query = query.eq('created_by', user.id);
      }
      
      const { data: document, error: docError } = await query.single();

      if (docError || !document) {
        throw new Error('Document not found or access denied');
      }

      storagePath = document.storage_path;
      bucketName = 'documents';
      mimeType = document.mime_type || '';
    } else {
      // Direct file extraction (e.g., for translation)
      storagePath = requestData.filePath;
      bucketName = requestData.bucketName;
      mimeType = requestData.mimeType || '';
      console.log('Extracting text from file:', storagePath);
    }

    // Download file from storage
    console.log('Downloading file from storage:', storagePath);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Convert blob to Uint8Array
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    let extractedText = '';
    let pageMap: Array<{ page: number, startIndex: number, endIndex: number }> = [];
    let totalPages = 1; // Default for non-PDF files
    // Reported back so the orchestrator can size its page ranges: OCR is far
    // slower per page than reading an embedded text layer.
    let isScanned = false;

    // Extract text based on mime type
    if (mimeType === 'application/pdf') {
      console.log('Extracting text from PDF...');
      const result = await extractTextFromPDF(uint8Array, startPage, endPage);
      extractedText = result.text;
      pageMap = result.pageMap;
      totalPages = result.totalPages; // Store total pages from PDF extraction
      
      // A ranged extraction holds only its own pages: it is stored as one row
      // in document_chunks and merge-document-chunks assembles the document at
      // the end. Folding documents.content_text in here instead baked whatever
      // it held — including the orchestrator's progress placeholder — into the
      // chunk's stored text.

      // If no text was extracted (scanned PDF), trigger conversion to searchable PDF
      // Only skip conversion during initial page count check (1 page only) or if explicitly told to skip
      const isPageCountCheck = startPage === 1 && endPage === 1;
      const skipConversion = requestData.skipConversionCheck === true;
      const pagesProcessed = pageMap.length || 1;
      const textPerPage = extractedText.length / pagesProcessed;
      
      // Consider it scanned if less than 100 chars per page (likely just metadata)
      const isScannedPDF = !extractedText || extractedText.trim().length === 0 || textPerPage < 100;
      isScanned = isScannedPDF;

      // A digital PDF never reaches OCR, so its embedded figures would be lost
      // entirely. Pull them out of the file itself, store them, and re-compose
      // the text with the figures in place — the offsets in pageMap have to be
      // the ones that include the image Markdown, hence the second pass.
      if (!isScannedPDF && !isPageCountCheck && !isProbe && documentId) {
        try {
          const { data: ownerRow } = await supabase
            .from('documents')
            .select('created_by')
            .eq('id', documentId)
            .single();

          if (ownerRow?.created_by) {
            const pageImages = await extractAndStorePdfImages(supabase, uint8Array, {
              documentId,
              ownerId: ownerRow.created_by,
              startPage,
              endPage,
            });

            if (pageImages.size > 0) {
              const figureCount = [...pageImages.values()].reduce((n, list) => n + list.length, 0);
              const withImages = await extractTextFromPDF(uint8Array, startPage, endPage, pageImages);
              extractedText = withImages.text;
              pageMap = withImages.pageMap;
              console.log(`Embedded ${figureCount} figure(s) from ${pageImages.size} page(s) into the text layer`);
            }
          }
        } catch (imageError) {
          // Figures are an enrichment: never fail ingestion over them.
          console.warn(
            'Embedded image extraction skipped:',
            imageError instanceof Error ? imageError.message : imageError,
          );
        }
      }

      if (isScannedPDF && !isPageCountCheck && !skipConversion && !isProbe && documentId) {
        console.log(`Scanned PDF detected - ${extractedText.length} chars across ${pagesProcessed} pages (${textPerPage.toFixed(1)} per page)`);

        const { data: document } = await supabase
          .from('documents')
          .select('storage_path, original_filename, created_by')
          .eq('id', documentId)
          .single();

        if (document) {
          console.log('Running Chandra OCR on scanned PDF for document:', documentId);

          await supabase.from('pdf_conversions').insert({
            user_id: document.created_by,
            original_file_path: document.storage_path,
            original_filename: document.original_filename,
            status: 'processing',
          });

          try {
            // A page range means the orchestrator is walking a large scan in
            // bounded pieces: OCR only those pages and store them as one chunk,
            // leaving the other ranges (and the merge at the end) alone.
            const isRangedOcr = !!(startPage && endPage);

            if (isRangedOcr) {
              const ocrResult = await ocrPdf(uint8Array, { startPage, endPage });
              const rangeText = ocrResult.markdown;
              const rangePageMap = pageMapFromOcrMarkdown(rangeText, startPage);
              const chunkIndex = chunkIndexOverride ?? Math.floor((startPage - 1) / 50);

              console.log(
                `[CHUNKED OCR] Pages ${startPage}-${endPage} -> chunk ${chunkIndex}, ${rangeText.length} chars`,
              );

              const { error: chunkError } = await supabase
                .from('document_chunks')
                .upsert({
                  document_id: documentId,
                  chunk_index: chunkIndex,
                  start_page: startPage,
                  end_page: endPage,
                  content_text: rangeText,
                  page_map: rangePageMap,
                }, {
                  onConflict: 'document_id,chunk_index',
                });

              if (chunkError) {
                throw new Error(`Failed to store OCR chunk: ${chunkError.message}`);
              }

              await supabase
                .from('pdf_conversions')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('original_file_path', document.storage_path)
                .eq('status', 'processing');

              return new Response(
                JSON.stringify({
                  success: true,
                  textLength: rangeText.length,
                  pageMap: rangePageMap,
                  startPage,
                  endPage,
                  converted: true,
                  chunked: true,
                  useMarkdown: true,
                  message: `Scanned PDF OCR completed for pages ${startPage}-${endPage}`,
                }),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200,
                },
              );
            }

            const ocrResult = await ocrPdf(uint8Array);
            extractedText = ocrResult.markdown;
            pageMap = pageMapFromOcrMarkdown(extractedText, 1);
            totalPages = pageMap.length;

            console.log(`Successfully extracted ${extractedText.length} characters from scanned PDF via Chandra OCR`);

            await supabase.from('document_chunks').delete().eq('document_id', documentId);
            await supabase.from('document_embeddings').delete().eq('document_id', documentId);

            const { error: updateError } = await supabase
              .from('documents')
              .update({
                content_text: extractedText,
                page_map: pageMap,
                status: 'active',
              })
              .eq('id', documentId);

            if (updateError) {
              throw new Error(`Failed to update document: ${updateError.message}`);
            }

            await supabase
              .from('pdf_conversions')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('original_file_path', document.storage_path)
              .eq('status', 'processing');

            return new Response(
              JSON.stringify({
                success: true,
                text: extractedText,
                pageMap,
                textLength: extractedText.length,
                totalPages,
                converted: true,
                useMarkdown: true,
                message: 'Scanned PDF OCR completed successfully',
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              },
            );
          } catch (conversionError) {
            console.error('Error during scanned PDF OCR:', conversionError);
            extractedText = '[Scanned PDF detected. Automatic OCR failed. Please retry or use the Translation Markdown OCR page.]';
            pageMap = [{ page: 1, startIndex: 0, endIndex: extractedText.length }];
          }
        }
      }
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      console.log('Extracting text from DOCX...');
      const result = await extractTextFromDOCX(uint8Array);
      extractedText = result.text;
      pageMap = result.pageMap;
    } else if (mimeType?.startsWith('image/')) {
      // For images (JPG, PNG, etc.), use OCR
      console.log('Extracting text from image using OCR...');
      extractedText = await extractTextFromImage(uint8Array, mimeType);
      pageMap = [{ page: 1, startIndex: 0, endIndex: extractedText.length }];
    } else if (mimeType?.startsWith('text/') || 
               mimeType === 'application/json' ||
               mimeType === 'text/markdown' ||
               mimeType === 'text/csv' ||
               mimeType === 'application/csv') {
      // For text files and CSV, just decode
      const decoder = new TextDecoder();
      extractedText = decoder.decode(uint8Array);
      pageMap = [{ page: 1, startIndex: 0, endIndex: extractedText.length }];
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      console.log('Warning: No text extracted from document');
      // Don't throw error - store a message instead
      extractedText = '[Document uploaded but text extraction was not successful. This may be a scanned document that requires OCR processing, or an unsupported format.]';
      pageMap = [{ page: 1, startIndex: 0, endIndex: extractedText.length }];
    }

    console.log(`Extracted ${extractedText.length} characters of text from ${pageMap.length} pages`);

    // Update document with extracted text and page map (only if documentId provided)
    if (documentId && !isProbe) {
      // If this is chunked processing, store in document_chunks table
      if (startPage && endPage) {
        console.log(`[CHUNKED] Storing chunk result for pages ${startPage}-${endPage}, text length: ${extractedText.length}`);
        // Prefer the orchestrator's index; the /50 fallback only holds for
        // 50-page ranges and collides on anything narrower.
        const chunkIndex = chunkIndexOverride ?? Math.floor((startPage - 1) / 50);
        
        console.log(`[CHUNKED] Upserting chunk ${chunkIndex} to document_chunks table`);
        const { data: upsertData, error: chunkError } = await supabase
          .from('document_chunks')
          .upsert({
            document_id: documentId,
            chunk_index: chunkIndex,
            start_page: startPage,
            end_page: endPage,
            content_text: extractedText,
            page_map: pageMap
          }, {
            onConflict: 'document_id,chunk_index'
          })
          .select();
        
        if (chunkError) {
          console.error('[CHUNKED] Error storing chunk:', chunkError);
          throw chunkError;
        }
        
        console.log(`[CHUNKED] Successfully stored chunk ${chunkIndex} (${pageMap.length} pages) for document:`, documentId);
      } else {
        // Regular (non-chunked) processing - update document directly
        let updateQuery = supabase
          .from('documents')
          .update({ 
            content_text: extractedText,
            page_map: pageMap,
            status: 'active'  // Mark as active after text extraction
          })
          .eq('id', documentId);
        
        // Only filter by created_by for external user calls
        if (!isInternalCall && user) {
          updateQuery = updateQuery.eq('created_by', user.id);
        }
        
        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error('Error updating document with text:', updateError);
          throw updateError;
        }

        console.log('Successfully extracted and stored text with page map for document:', documentId);
      }
    }

    // Return total pages info for chunking decisions
    return new Response(
      JSON.stringify({ 
        success: true, 
        text: extractedText,
        pageMap: pageMap,
        textLength: extractedText.length,
        totalPages: totalPages,
        isScanned,
        message: 'Text extracted successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Extract text error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});