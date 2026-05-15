import html as html_mod
import io
import os
import re
import statistics
from typing import Optional

from pdfminer.high_level import extract_pages, extract_text
from pdfminer.layout import LTTextBox, LTTextLine, LTChar

from services.sanitize import sanitize_html

_TOC_RE = re.compile(r'目錄|目次|contents|table\s+of\s+contents', re.IGNORECASE)


def ingest_pdf(url: str, pdf_bytes: Optional[bytes] = None) -> dict:
    if pdf_bytes is None:
        import urllib.request
        with urllib.request.urlopen(url, timeout=30) as response:
            pdf_bytes = response.read()

    title = os.path.basename(url.split("?")[0]) if url else "document.pdf"

    try:
        content_html = _extract_structured(pdf_bytes)
        content_text = re.sub(r"<[^>]+>", " ", content_html)
    except Exception:
        # Fallback: plain text extraction
        text = extract_text(io.BytesIO(pdf_bytes))
        pages = text.split("\f")
        content_html = "".join(
            f'<div class="pdf-page"><p>{html_mod.escape(p.strip()).replace(chr(10), "<br>")}</p></div>'
            for p in pages if p.strip()
        )
        content_text = text

    return {
        "title": title,
        "content_html": sanitize_html(content_html),
        "content_text": content_text,
        "word_count": len(content_text.split()),
    }


def _extract_structured(pdf_bytes: bytes) -> str:
    """
    Extract text with heading detection based on font-size ratios.

    Algorithm:
      1. Walk every LTChar to get per-line median font size.
      2. Compute body_size = median of all line sizes (= most common = body text).
      3. Lines whose size is ≥ 2.0× body → <h1>
                                  ≥ 1.5× body → <h2>
                                  ≥ 1.2× body → <h3>
                                  otherwise   → grouped into <p>
      4. Consecutive body lines with a y-gap ≤ 1.5× line-height are joined
         in the same <p>; a larger gap starts a new paragraph.
      5. Pages whose text contains 目錄/Contents/etc. get class="toc-section".
    """
    pages = []

    for page_num, page_layout in enumerate(extract_pages(io.BytesIO(pdf_bytes)), start=1):
        # Sort boxes top-to-bottom (PDF y=0 is at the bottom)
        boxes = sorted(
            (e for e in page_layout if isinstance(e, LTTextBox)),
            key=lambda e: -e.y1,
        )
        lines = []
        for box in boxes:
            for line in box:
                if not isinstance(line, LTTextLine):
                    continue
                text = line.get_text().strip()
                if not text:
                    continue
                char_sizes = [c.size for c in line if isinstance(c, LTChar) and c.size > 0]
                if not char_sizes:
                    continue
                lines.append({
                    "text": text,
                    "size": statistics.median(char_sizes),
                    "y0": line.y0,
                    "y1": line.y1,
                })
        pages.append({"num": page_num, "lines": lines})

    all_sizes = [ln["size"] for p in pages for ln in p["lines"]]
    if not all_sizes:
        return ""
    body_size = statistics.median(all_sizes)

    parts = []

    for page in pages:
        lines = page["lines"]
        if not lines:
            continue

        combined = " ".join(ln["text"] for ln in lines)
        is_toc = bool(_TOC_RE.search(combined))

        parts.append('<div class="pdf-page">')
        if is_toc:
            parts.append('<div class="toc-section">')

        para: list[str] = []
        prev_y0: Optional[float] = None

        def flush_para():
            if para:
                parts.append("<p>" + "<br>".join(para) + "</p>")
                para.clear()

        for ln in lines:
            t = html_mod.escape(ln["text"])
            ratio = ln["size"] / body_size if body_size > 0 else 1.0

            if ratio >= 2.0:
                flush_para()
                parts.append(f"<h1>{t}</h1>")
                prev_y0 = None
            elif ratio >= 1.5:
                flush_para()
                parts.append(f"<h2>{t}</h2>")
                prev_y0 = None
            elif ratio >= 1.2:
                flush_para()
                parts.append(f"<h3>{t}</h3>")
                prev_y0 = None
            else:
                # Body text — decide whether to continue current paragraph
                if prev_y0 is not None:
                    gap = prev_y0 - ln["y1"]
                    line_h = max(ln["y1"] - ln["y0"], 1)
                    if gap > line_h * 1.5:
                        flush_para()
                para.append(t)
                prev_y0 = ln["y0"]

        flush_para()

        if is_toc:
            parts.append("</div>")
        parts.append("</div>")

    return "\n".join(parts)
