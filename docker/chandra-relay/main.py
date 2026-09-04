"""
Chandra-native OCR relay for jyoma-ai.

_shared/ocr.ts's chandra-native backend posts raw PDF/image bytes (base64) to
POST /ocr and expects back { markdown, images }. The bug this fixes: nothing
was rasterizing PDF pages into real images before handing them to Chandra's
vLLM chat-completions endpoint, which rejects raw PDF bytes wrapped as an
image_url ("cannot identify image file"). This service does that rasterization
step (pdf2image, same approach as reference/Service-Document-Loader's
handwritten_ocr.py) and forwards each page image to vLLM.
"""
import base64
import io
import os
from concurrent.futures import ThreadPoolExecutor

import fitz  # PyMuPDF
import requests
from fastapi import FastAPI, HTTPException
from pdf2image import convert_from_bytes
from PIL import Image
from pydantic import BaseModel

app = FastAPI()

OCR_BASE_URL = os.environ.get("OCR_BASE_URL", "http://vllm-ocr:8000/v1").rstrip("/")
OCR_MODEL = os.environ.get("OCR_MODEL", "chandra-ocr-2")
OCR_MAX_TOKENS = int(os.environ.get("OCR_MAX_TOKENS", "16384"))
OCR_REASONING_EFFORT = os.environ.get("OCR_REASONING_EFFORT") or None
MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "20"))
DPI = int(os.environ.get("OCR_RASTER_DPI", "200"))
# Pages are OCR'd concurrently to stay under the edge-runtime's ~400s wall-clock
# limit on the caller — sequential per-page calls to a reasoning OCR model blow
# past that on anything past a few pages. Match VLLM_OCR_SEQS so we don't queue
# more concurrent requests than vllm-ocr itself will run at once.
OCR_CONCURRENCY = int(os.environ.get("OCR_CONCURRENCY", "2"))

OCR_SYSTEM_PROMPT = """You are a document OCR engine. Extract all text from the provided document image or PDF page as faithful Markdown.
Rules:
- Preserve headings, lists, tables (as Markdown tables), and layout structure
- Use $...$ for inline math and $$...$$ for display math
- Do not summarize or omit content
- Output ONLY the Markdown, no commentary or code fences wrapping the whole document"""

OCR_USER_PROMPT = "Extract the full document content as Markdown. Preserve tables, headings, and structure."


class OcrRequest(BaseModel):
    file: str
    fileType: int  # 0 = pdf, 1 = image
    mime_type: str | None = None
    # 1-based inclusive page range. Callers processing a large PDF send one
    # bounded range per request so each call stays under the caller's own
    # execution limit; omitted means "the whole document" (capped at MAX_PAGES).
    startPage: int | None = None
    endPage: int | None = None


def image_to_data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


def ocr_page(img: Image.Image) -> str:
    payload = {
        "model": OCR_MODEL,
        "temperature": 0,
        "max_tokens": OCR_MAX_TOKENS,
        "messages": [
            {"role": "system", "content": OCR_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": OCR_USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": image_to_data_uri(img)}},
                ],
            },
        ],
    }
    if OCR_REASONING_EFFORT:
        payload["reasoning_effort"] = OCR_REASONING_EFFORT

    resp = requests.post(f"{OCR_BASE_URL}/chat/completions", json=payload, timeout=300)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"vLLM OCR call failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    if not content or not content.strip():
        raise HTTPException(status_code=502, detail="vLLM OCR returned empty content")
    return content.strip()


@app.post("/ocr")
def ocr(req: OcrRequest):
    raw = base64.b64decode(req.file)

    # Absolute page number of the first rasterized page, so multi-request runs
    # over one document still label pages by their real position in the file.
    first_page = req.startPage if req.fileType == 0 and req.startPage else 1

    if req.fileType == 0:
        last_page = req.endPage
        if last_page is None:
            last_page = first_page + MAX_PAGES - 1
        else:
            # Never rasterize more than MAX_PAGES in a single request, however
            # wide a range the caller asked for.
            last_page = min(last_page, first_page + MAX_PAGES - 1)
        pages = convert_from_bytes(raw, dpi=DPI, first_page=first_page, last_page=last_page)
    else:
        pages = [Image.open(io.BytesIO(raw))]

    if not pages:
        raise HTTPException(status_code=422, detail="No pages found in document")

    with ThreadPoolExecutor(max_workers=min(OCR_CONCURRENCY, len(pages))) as pool:
        page_markdowns = list(pool.map(ocr_page, pages))

    if len(pages) > 1:
        results = [
            f"# Page {n}\n\n{md}"
            for n, md in enumerate(page_markdowns, start=first_page)
        ]
    else:
        results = page_markdowns

    return {
        "markdown": "\n\n---\n\n".join(results),
        "images": {},
        "startPage": first_page,
        "endPage": first_page + len(pages) - 1,
        "pagesProcessed": len(pages),
    }


class ImagesRequest(BaseModel):
    file: str
    # 1-based inclusive page range; omitted means the whole document.
    startPage: int | None = None
    endPage: int | None = None


# Below this, an embedded image is almost always a rule, bullet, logo or
# gradient strip rather than a figure worth storing and embedding.
MIN_IMAGE_PX = int(os.environ.get("PDF_IMAGE_MIN_PX", "80"))
MIN_IMAGE_AREA_FRACTION = float(os.environ.get("PDF_IMAGE_MIN_AREA_FRACTION", "0.01"))
MAX_IMAGES_PER_PAGE = int(os.environ.get("PDF_IMAGE_MAX_PER_PAGE", "12"))


@app.post("/images")
def extract_images(req: ImagesRequest):
    """
    Extracts the raster images already embedded in a digital PDF.

    This is the counterpart to /ocr for documents that have a real text layer:
    no OCR runs, so nothing else in the pipeline would ever see their figures.
    PyMuPDF reads the image XObjects directly, which keeps original resolution
    and costs milliseconds per page instead of a GPU pass.

    `yTopFraction` is where the image sits down the page (0 = top edge, 1 =
    bottom). The caller uses it to splice the image into the text layer at the
    right vertical position, so a figure lands next to its caption.

    Vector artwork drawn with path operators has no XObject and is invisible
    here; those need the rasterize-or-OCR route.
    """
    try:
        raw = base64.b64decode(req.file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"file is not valid base64: {exc}")

    try:
        doc = fitz.open(stream=raw, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not open PDF: {exc}")

    with doc:
        first_page = max(1, req.startPage or 1)
        last_page = min(doc.page_count, req.endPage or doc.page_count)

        images = []
        skipped = 0

        for page_number in range(first_page, last_page + 1):
            page = doc.load_page(page_number - 1)
            page_height = page.rect.height or 1
            page_area = (page.rect.width or 1) * page_height
            per_page = 0

            # Deduplicate: the same xref can be placed several times on a page.
            seen_xrefs: set[int] = set()

            for info in page.get_images(full=True):
                xref = info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                if per_page >= MAX_IMAGES_PER_PAGE:
                    skipped += 1
                    continue

                try:
                    extracted = doc.extract_image(xref)
                except Exception:
                    skipped += 1
                    continue

                width = extracted.get("width", 0)
                height = extracted.get("height", 0)
                if width < MIN_IMAGE_PX or height < MIN_IMAGE_PX:
                    skipped += 1
                    continue

                rects = page.get_image_rects(xref)
                rect = rects[0] if rects else None
                if rect is not None and (rect.width * rect.height) / page_area < MIN_IMAGE_AREA_FRACTION:
                    skipped += 1
                    continue

                per_page += 1
                images.append(
                    {
                        "page": page_number,
                        "index": per_page,
                        "width": width,
                        "height": height,
                        "ext": extracted.get("ext", "png"),
                        "mime": f"image/{extracted.get('ext', 'png')}",
                        # Top of the image as a fraction of page height. Falls
                        # back to 1.0 (page bottom) when the placement rect is
                        # unknown, so it sorts after the page's text.
                        "yTopFraction": round(rect.y0 / page_height, 6) if rect is not None else 1.0,
                        "bbox": [rect.x0, rect.y0, rect.x1, rect.y1] if rect is not None else None,
                        "data": base64.b64encode(extracted["image"]).decode(),
                    }
                )

        return {
            "images": images,
            "startPage": first_page,
            "endPage": last_page,
            "skipped": skipped,
        }


@app.get("/health")
def health():
    return {"status": "ok"}
