import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { createWorker } from "tesseract.js";
import api from "../api";
import { COLOR_BG } from "../constants/highlight";
import { computeUnionRect, normalizePdfRects, getWordHugRects } from "../utils/pdfSelection";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// Module-level cache: avoids re-fetching the same PDF on every mount
const pdfDataCache = new Map();

// Lazy OCR worker — created once, reused for all scanned pages
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng");
  }
  return ocrWorkerPromise;
}

// Threshold: pages with fewer than this many text items are treated as scanned
const SCANNED_THRESHOLD = 5;

// Shared highlight-drawing logic used by both the highlights effect (handles
// highlight changes while the PDF is already rendered) and by loadPdf() after
// all pages are in the DOM (handles the race where highlights arrive before
// pages exist).
function drawHighlightLayer(container, highlights, scale) {
  container.querySelectorAll(".highlight-layer").forEach((layer) => {
    const pageNum = parseInt(layer.closest("[data-page]")?.dataset.page, 10);
    layer.innerHTML = "";
    highlights
      .filter((h) => h.position?.type === "pdf_range" && h.position.page === pageNum)
      .forEach((hl) => {
        (hl.position.rects || []).forEach((rect, i) => {
          const div = document.createElement("div");
          div.style.cssText = `position:absolute;left:${rect.x * scale}px;top:${rect.y * scale}px;width:${rect.w * scale}px;height:${rect.h * scale}px;background:${COLOR_BG[hl.color]};border-radius:2px;`;
          if (i === 0) div.dataset.hlId = hl.id; // first rect used for connector line
          layer.appendChild(div);
        });
      });
  });
}

export default function PdfViewer({ docId, highlights = [], scale = 1.0, onSelection, onProgress }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  // Always-current ref so the async loadPdf() closure can read the latest
  // highlights without going stale between awaits.
  const highlightsRef = useRef(highlights);
  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

  // Separate effect: re-draw highlight overlays when highlights change,
  // WITHOUT re-fetching or re-rendering the PDF pages.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    drawHighlightLayer(container, highlights, scale);
  }, [highlights, scale]);

  // Main effect: fetch PDF and render all pages. Re-runs only when docId or scale changes.
  useEffect(() => {
    let cancelled = false;
    const cleanups = [];

    async function loadPdf() {
      onProgress?.({ loading: true, current: 0, total: 0 });
      setError(null);
      try {
        let cached = pdfDataCache.get(docId);
        if (!cached) {
          const resp = await api.get(`/documents/${docId}/file`, { responseType: "arraybuffer" });
          if (cancelled) return;
          cached = new Uint8Array(resp.data);
          pdfDataCache.set(docId, cached);
        }
        if (cancelled) return;
        // slice() creates a copy — pdfjs transfers the buffer on load, which would detach the cached copy
        const pdfDoc = await pdfjsLib.getDocument({ data: cached.slice() }).promise;
        if (cancelled) return;

        onProgress?.({ loading: true, current: 0, total: pdfDoc.numPages });

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          // Page wrapper
          const wrapper = document.createElement("div");
          wrapper.style.cssText = `position:relative;display:inline-block;box-shadow:0 4px 24px rgba(44,36,22,0.10);border-radius:4px;background:white;margin-bottom:16px;`;
          wrapper.dataset.page = pageNum;

          // Canvas
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = "display:block;border-radius:4px;";
          wrapper.appendChild(canvas);

          // Highlight layer — populated by the separate highlights useEffect
          const hlLayer = document.createElement("div");
          hlLayer.className = "highlight-layer";
          hlLayer.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;border-radius:4px;overflow:hidden;`;
          wrapper.appendChild(hlLayer);

          // Text layer — must have class "textLayer" so pdfjs CSS makes spans transparent
          const textLayer = document.createElement("div");
          textLayer.className = "textLayer";
          textLayer.style.cssText = `border-radius:4px;`;
          // Hit tolerance: inject CSS once so each span has extra vertical padding,
          // making glyphs easier to click without pixel-perfect accuracy
          if (!document.getElementById("pdf-textlayer-hittolerance")) {
            const s = document.createElement("style");
            s.id = "pdf-textlayer-hittolerance";
            s.textContent = `.textLayer span { padding: 3px 0; cursor: text; }
              .textLayer { user-select: text; -webkit-user-select: text; }`;
            document.head.appendChild(s);
          }
          wrapper.appendChild(textLayer);

          container.appendChild(wrapper);

          // Render canvas
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          if (cancelled) return;
          onProgress?.({ loading: true, current: pageNum, total: pdfDoc.numPages });

          // Render text layer (native) or OCR fallback (scanned pages)
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const isScanned = textContent.items.length < SCANNED_THRESHOLD;

          if (!isScanned) {
            // Native text: use pdfjs TextLayer for precise glyph-level spans
            try {
              const tl = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport,
              });
              await tl.render();
            } catch (_) {
              // TextLayer not available — skip
            }
          } else {
            // Scanned page: run Tesseract OCR on the rendered canvas,
            // then inject synthetic word spans so text is selectable
            textLayer.style.cssText += `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;overflow:hidden;pointer-events:auto;`;
            onProgress?.({ loading: true, current: pageNum, total: pdfDoc.numPages, ocr: true });
            try {
              const worker = await getOcrWorker();
              if (cancelled) return;
              const { data: { words } } = await worker.recognize(canvas);
              if (cancelled) return;

              for (const word of words) {
                if (!word.text.trim() || word.confidence < 30) continue;
                const { x0, y0, x1, y1 } = word.bbox;
                const span = document.createElement("span");
                span.textContent = word.text;
                span.style.cssText = [
                  `position:absolute`,
                  `left:${x0}px`,
                  `top:${y0}px`,
                  `width:${x1 - x0}px`,
                  `height:${y1 - y0}px`,
                  `font-size:${y1 - y0}px`,
                  `line-height:${y1 - y0}px`,
                  `color:transparent`,
                  `cursor:text`,
                  `white-space:nowrap`,
                  `overflow:hidden`,
                  `user-select:text`,
                ].join(";");
                textLayer.appendChild(span);
              }
            } catch (ocrErr) {
              console.warn(`OCR failed for page ${pageNum}:`, ocrErr);
            }
          }

          // Annotation layer — renders clickable link annotations (TOC, internal links)
          const annotations = await page.getAnnotations();
          if (cancelled) return;
          const linkAnnots = annotations.filter((a) => a.subtype === "Link");
          if (linkAnnots.length) {
            const annotLayer = document.createElement("div");
            annotLayer.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;pointer-events:none;`;
            wrapper.appendChild(annotLayer);

            for (const annot of linkAnnots) {
              const [vx1, vy1, vx2, vy2] = pdfjsLib.Util.normalizeRect(
                viewport.convertToViewportRectangle(annot.rect)
              );
              const link = document.createElement("a");
              link.style.cssText = `position:absolute;left:${vx1}px;top:${vy1}px;width:${vx2 - vx1}px;height:${vy2 - vy1}px;pointer-events:auto;cursor:pointer;`;

              if (annot.url) {
                link.href = annot.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
              } else {
                link.href = "#";
                const dest = annot.dest;
                link.addEventListener("click", async (e) => {
                  e.preventDefault();
                  try {
                    let resolved = dest;
                    if (typeof resolved === "string") resolved = await pdfDoc.getDestination(resolved);
                    if (!resolved) return;
                    const targetPageIndex = await pdfDoc.getPageIndex(resolved[0]);
                    const targetWrapper = containerRef.current?.querySelector(`[data-page="${targetPageIndex + 1}"]`);
                    targetWrapper?.scrollIntoView({ behavior: "smooth", block: "start" });
                  } catch (_) {}
                });
              }
              annotLayer.appendChild(link);
            }
          }

          // Selection handler:
          // 1. On mouseup: defer one tick (setTimeout 0) so the browser finalises
          //    the selection before we read it — avoids the previous 150 ms lag.
          // 2. Geometry: anchor toolbar to the union of getClientRects(), not to
          //    the cursor position. This puts the toolbar above/below the actual
          //    highlighted text regardless of where the drag ended.
          // 3. Normalise rects before storing: strip noise, group into lines,
          //    merge adjacent spans — no cross-line width stretching.
          let selTimer = null;
          const handler = () => {
            clearTimeout(selTimer);
            selTimer = setTimeout(() => {
              const sel = window.getSelection();
              if (!sel || sel.isCollapsed) return;

              const text = sel.toString().trim();
              // Minimum length guard: ignore accidental micro-selections (< 3 chars)
              if (!text || text.length < 3) return;

              const range = sel.getRangeAt(0);
              const clientRects = getWordHugRects(range);
              const canvasRect = canvas.getBoundingClientRect();

              // Map every client rect into unscaled PDF-space coordinates.
              const rawRects = clientRects.map((r) => ({
                x: (r.left - canvasRect.left) / scale,
                y: (r.top  - canvasRect.top)  / scale,
                w: r.width  / scale,
                h: r.height / scale,
              }));

              // Clean up: remove noise, group lines, merge adjacent spans.
              const rects = normalizePdfRects(rawRects);
              if (rects.length === 0) return;

              // Anchor the toolbar to the selection geometry (viewport coords),
              // not to the cursor position at drag-end.
              const selRect = computeUnionRect(Array.from(clientRects));

              onSelection({ text, page: pageNum, rects, rect: selRect });
            }, 0);
          };
          textLayer.addEventListener("mouseup", handler);
          cleanups.push(() => { clearTimeout(selTimer); textLayer.removeEventListener("mouseup", handler); });
        }

        // All .highlight-layer nodes now exist. Draw persisted highlights that
        // arrived before this render loop ran (race: highlights effect fired
        // against an empty container and found nothing to draw into).
        if (!cancelled) drawHighlightLayer(container, highlightsRef.current, scale);

        onProgress?.({ loading: false, current: pdfDoc.numPages, total: pdfDoc.numPages });
      } catch (err) {
        if (!cancelled) {
          console.error("PdfViewer error:", err);
          onProgress?.({ loading: false, current: 0, total: 0 });
          const msg = err?.response?.status === 404
            ? "PDF file not available — only text view is supported for this document."
            : "Could not render PDF.";
          setError(msg);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [docId, scale]); // highlights are updated imperatively by the separate effect above

  if (error) return <div style={{ padding: 24, color: "#c33", fontFamily: "'Outfit', sans-serif" }}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 20px" }}>
      <div
        ref={containerRef}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}
      />
    </div>
  );
}
