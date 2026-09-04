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


@app.get("/health")
def health():
    return {"status": "ok"}
