/**
 * Embedded-image extraction for digital PDFs.
 *
 * A PDF with a real text layer never goes through OCR, so nothing else in the
 * pipeline sees its figures: the text is stored, the images are dropped, and
 * the assistant can only ever answer "no images found in retrieved chunks".
 *
 * The relay reads the image XObjects with PyMuPDF (original resolution, no GPU
 * pass) and reports where each one sits down the page. Here we upload them and
 * turn them into Markdown the retrieval pipeline already understands —
 * `rag-assistant` matches `![alt](url)` when a question is about a figure.
 */

const IMAGES_BUCKET = "document-images";

function getChandraBaseUrl(): string {
  return (Deno.env.get("CHANDRA_BASE_URL") ?? "http://host.docker.internal:8001").replace(/\/$/, "");
}

/**
 * Builds the URL a BROWSER can use for a stored image.
 *
 * `supabase.storage.getPublicUrl()` is wrong here: inside the compose network
 * SUPABASE_URL is http://kong:8000, which no browser can resolve, and these
 * URLs are written into Markdown that outlives the request.
 */
export function publicImageUrl(bucket: string, path: string): string {
  const base = (
    Deno.env.get("PUBLIC_SUPABASE_URL") ??
      Deno.env.get("SUPABASE_URL") ??
      "http://localhost:8000"
  ).replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

interface RelayImage {
  page: number;
  index: number;
  width: number;
  height: number;
  ext: string;
  mime: string;
  /** 0 = top of the page, 1 = bottom. Used to place the image in the text. */
  yTopFraction: number;
  data: string;
}

/** One uploaded figure, ready to be spliced into a page's text. */
export interface PageImage {
  page: number;
  index: number;
  yTopFraction: number;
  markdown: string;
}

/** page number -> figures on that page, in top-to-bottom order. */
export type PageImageMap = Map<number, PageImage[]>;

/**
 * Pulls every embedded raster out of a digital PDF, stores it, and returns the
 * Markdown references keyed by page.
 *
 * Never throws: a document whose figures cannot be extracted is still worth
 * ingesting for its text, so failures are logged and yield an empty map.
 */
export async function extractAndStorePdfImages(
  supabase: {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Uint8Array,
          opts: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  fileBytes: Uint8Array,
  opts: { documentId: string; ownerId: string; startPage?: number; endPage?: number },
): Promise<PageImageMap> {
  const byPage: PageImageMap = new Map();

  let relayImages: RelayImage[] = [];
  try {
    const response = await fetch(`${getChandraBaseUrl()}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: uint8ToBase64(fileBytes),
        startPage: opts.startPage,
        endPage: opts.endPage,
      }),
    });
    if (!response.ok) {
      console.warn(`PDF image extraction failed (${response.status}): ${await response.text()}`);
      return byPage;
    }
    const data = await response.json();
    relayImages = Array.isArray(data?.images) ? data.images : [];
    console.log(`PDF image extraction: ${relayImages.length} image(s), ${data?.skipped ?? 0} skipped`);
  } catch (e) {
    console.warn("PDF image extraction unavailable:", e instanceof Error ? e.message : e);
    return byPage;
  }

  for (const img of relayImages) {
    try {
      const ext = (img.ext || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
      const path = `${opts.ownerId}/${opts.documentId}/p${img.page}_${img.index}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(IMAGES_BUCKET)
        .upload(path, base64ToUint8(img.data), {
          contentType: img.mime || `image/${ext}`,
          upsert: true,
        });
      if (upErr) {
        console.warn("Figure upload failed", path, upErr.message);
        continue;
      }

      const publicUrl = publicImageUrl(IMAGES_BUCKET, path);

      const list = byPage.get(img.page) ?? [];
      list.push({
        page: img.page,
        index: img.index,
        yTopFraction: img.yTopFraction ?? 1,
        markdown: `![Figure ${img.page}-${img.index}](${publicUrl})`,
      });
      byPage.set(img.page, list);
    } catch (e) {
      console.warn("Figure processing failed:", e instanceof Error ? e.message : e);
    }
  }

  for (const list of byPage.values()) {
    list.sort((a, b) => a.yTopFraction - b.yTopFraction);
  }
  return byPage;
}
