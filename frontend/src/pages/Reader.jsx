import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import NotePopup from "../components/NotePopup";
import AnnotationSidebar from "../components/AnnotationSidebar";
import PdfViewer from "../components/PdfViewer";
import SelectionToolbar from "../components/SelectionToolbar";
import ThemeToggle from "../components/ThemeToggle";
import { COLOR_BG } from "../constants/highlight";

const READER_STYLES = `
  * { box-sizing: border-box; }

  .reader-content { background: var(--reader-surface); }

  /* PDF structured headings */
  .pdf-page h1 { font-family: 'Lora', serif; font-size: 2em;   font-weight: 600; margin: 1em 0 0.4em; color: var(--reader-text); }
  .pdf-page h2 { font-family: 'Lora', serif; font-size: 1.5em; font-weight: 600; margin: 0.9em 0 0.35em; color: var(--reader-text); }
  .pdf-page h3 { font-family: 'Lora', serif; font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.3em; color: var(--reader-text); }
  .pdf-page p  { margin: 0 0 0.7em; }

  /* Table of contents block */
  .toc-section { background: var(--surface2); border-left: 3px solid var(--accent); border-radius: 6px; padding: 12px 16px; margin: 16px 0; }
  .toc-section p { margin: 0.2em 0; font-family: 'DM Mono', monospace; font-size: 0.92em; color: var(--reader-text); }

  @keyframes fadeToast {
    0%   { opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }
`;

const sel = {
  background: "var(--surface2)",
  border: "1.5px solid var(--border)",
  borderRadius: 7,
  padding: "4px 8px",
  fontFamily: "'Outfit', sans-serif",
  fontSize: "0.78rem",
  color: "var(--text)",
  cursor: "pointer",
  outline: "none",
};

const fmtBtn = {
  background: "var(--surface2)",
  border: "1.5px solid var(--border)",
  borderRadius: 6,
  padding: "3px 9px",
  fontFamily: "'Outfit', sans-serif",
  fontSize: "0.84rem",
  color: "var(--text)",
  cursor: "pointer",
  lineHeight: 1.4,
};

export default function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [activeColor, setActiveColor] = useState("yellow");
  const [toolbar, setToolbar] = useState(null);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const selTimerRef = useRef(null);
  const [viewMode, setViewMode] = useState("pdf");
  const [pdfScale, setPdfScale] = useState(1.0);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(`reader_font_size_${id}`);
    return saved ? parseInt(saved, 10) : 16;
  });
  const [pdfProgress, setPdfProgress] = useState({ loading: false, current: 0, total: 0 });
  const editorRef = useRef(null);
  const contentAreaRef = useRef(null);
  const [connector, setConnector] = useState(null);
  const activeHlRef = useRef(null);    // tracks the currently-connected highlight for resize
  const viewModeRef = useRef(viewMode); // always-fresh viewMode for async callbacks
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const isDraggingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false); // true during handleJumpTo scroll → prevents manual-scroll from clearing connector
  const scrollRafRef = useRef(null);
  const positionSaveTimerRef = useRef(null);
  const pdfSaveTimerRef      = useRef(null);
  const hasRestoredRef       = useRef(false);
  const pendingPdfPageRef    = useRef(null);
  const [showToast, setShowToast] = useState(false);
  const tempMarksRef   = useRef([]);  // <mark> nodes inserted in text/epub view
  const tempHlDivsRef  = useRef([]);  // <div> nodes inserted in PDF highlight-layer
  const [sidebarFocus, setSidebarFocus] = useState(null);
  const [visibleHlIds, setVisibleHlIds] = useState(new Set());
  const visTimerRef = useRef(null);
  const [tempMarkOffscreen, setTempMarkOffscreen] = useState(null); // null | "above" | "below"

  useEffect(() => {
    api.get(`/documents/${id}`).then((r) => setDoc(r.data)).catch(() => {});
    api.get(`/documents/${id}/highlights`).then((r) => setHighlights(r.data)).catch(() => {});
  }, [id]);

  // Cleanup stale note drafts older than 7 days on mount
  useEffect(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("draft_note_")) continue;
      try {
        const draft = JSON.parse(localStorage.getItem(key));
        if (!draft?.savedAt || now - new Date(draft.savedAt).getTime() > SEVEN_DAYS_MS) {
          localStorage.removeItem(key);
          i--; // adjust index after removal
        }
      } catch {
        localStorage.removeItem(key);
        i--;
      }
    }
  }, []);

  // Keep viewModeRef current so async callbacks always read the latest value
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // Reset restoration gate whenever the document changes
  useEffect(() => {
    hasRestoredRef.current = false;
    pendingPdfPageRef.current = null;
  }, [id]);

  // Fix 5: recalculate connector on resize (debounced)
  useEffect(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (activeHlRef.current) drawConnector(activeHlRef.current);
      }, 100);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]); // re-register when viewMode changes so drawConnector uses fresh closure

  // Save PDF page number on scroll — uses capture phase to catch PdfViewer's internal scroll
  useEffect(() => {
    if (viewMode !== "pdf") return;
    function onPdfScroll() {
      clearTimeout(pdfSaveTimerRef.current);
      pdfSaveTimerRef.current = setTimeout(() => {
        const page = findCurrentPdfPage(contentAreaRef.current);
        if (!page) return;
        const savedAt = new Date().toISOString();
        localStorage.setItem(`reader_position_${id}`, JSON.stringify({ page, savedAt }));
        api.patch(`/documents/${id}`, { last_read_page: page, last_read_at: savedAt }).catch(() => {});
      }, 1000);
    }
    document.addEventListener('scroll', onPdfScroll, true);
    return () => {
      document.removeEventListener('scroll', onPdfScroll, true);
      clearTimeout(pdfSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, id]);

  // Restore PDF page: fires when pdfProgress reports the saved page has been rendered
  useEffect(() => {
    if (!pendingPdfPageRef.current || viewMode !== "pdf") return;
    if (pdfProgress.current < pendingPdfPageRef.current) return;
    const page = pendingPdfPageRef.current;
    const pageEl = document.querySelector(`[data-page="${page}"]`);
    if (!pageEl) return;
    pendingPdfPageRef.current = null;
    pageEl.scrollIntoView({ behavior: "instant", block: "start" });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, [pdfProgress, viewMode]);

  // Populate contenteditable once doc + highlights both arrive, or when switching view
  useEffect(() => {
    if (!editorRef.current || !doc) return;
    let rawHtml;
    if (viewMode === "text") {
      // Plain text view — no structured headings, just paragraphs
      const raw = doc.content_text || "";
      rawHtml = raw
        ? `<p>${raw.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
        : "";
    } else {
      // EPUB view — use structured HTML with headings
      rawHtml = doc.content_html ||
        (doc.content_text
          ? `<p>${doc.content_text.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
          : "");
    }
    // Only apply highlights that belong to this view
    const viewHighlights = highlights.filter((h) =>
      h.position?.type === "text_range" &&
      (h.position?.view === viewMode || (!h.position?.view && viewMode === "epub"))
    );
    const html = applyHighlights(rawHtml, viewHighlights);
    editorRef.current.innerHTML = html || "<p style='color:var(--text-muted)'>No extracted text available for this document.</p>";
    updateVisibleHighlights();

    if (!hasRestoredRef.current) {
      let saved = null;
      try {
        const raw = localStorage.getItem(`reader_position_${id}`);
        if (raw) saved = JSON.parse(raw);
      } catch { /* ignore bad JSON */ }
      if (viewMode === "pdf" && doc.type === "pdf") {
        // Only lock the gate for actual PDF docs — epub docs will auto-switch to epub viewMode
        hasRestoredRef.current = true;
        const page = saved?.page ?? doc.last_read_page ?? null;
        if (page) pendingPdfPageRef.current = page;
        // pdfProgress watcher (Task 6) handles the actual scroll
      } else if (viewMode !== "pdf") {
        hasRestoredRef.current = true;
        const offset = saved?.offset ?? doc.last_read_offset ?? null;
        if (offset !== null && offset !== undefined) {
          const el = findElementAtOffset(editorRef.current, offset);
          if (el) {
            el.scrollIntoView({ behavior: "instant", block: "start" });
            setShowToast(true);
            setTimeout(() => setShowToast(false), 3000);
          }
        }
      }
      // If viewMode === "pdf" but doc.type !== "pdf", skip — auto-switch will change viewMode
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, highlights.length, viewMode]); // re-apply when a new highlight is added or view switches

  function handleMouseUp(e) {
    clearTimeout(selTimerRef.current);
    selTimerRef.current = setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) return;
      const text = s.toString().trim();
      if (!text || text.length < 3) return;
      const range = s.getRangeAt(0);
      const selRect = getRangeUnionRect(range);
      const contentEl = editorRef.current || e.currentTarget;
      const startOffset = getCharOffset(contentEl, range.startContainer, range.startOffset);
      const endOffset = startOffset + text.length;
      // Close any open NotePopup before showing the toolbar
      setPendingSelection(null);
      setSelectionRect(null);
      setToolbar({ text, startOffset, endOffset, selRect });
    }, 150);
  }

  async function saveHighlight(selData, color, note) {
    const position = selData.posType === "pdf_range"
      ? { type: "pdf_range", page: selData.page, rects: selData.rects }
      : { type: "text_range", view: viewMode, start_offset: selData.startOffset, end_offset: selData.endOffset };
    const { data } = await api.post("/highlights", {
      document_id: id,
      text: selData.text,
      color,
      note,
      position,
    });
    setHighlights((prev) => [...prev, data]);
    return data;
  }

  async function handleSave(color, note) {
    if (!pendingSelection) return;
    let savedData = null;
    try {
      savedData = await saveHighlight(pendingSelection, color, note);
    } catch {
      // Save failed — remove temp elements so they don't linger
      cleanupTempHighlight(tempMarksRef.current, tempHlDivsRef.current);
      tempMarksRef.current = [];
      tempHlDivsRef.current = [];
      setPendingSelection(null);
      setSelectionRect(null);
      setTempMarkOffscreen(null);
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (savedData?.id) {
      // Stop pulsing; attach id so connector works before the re-render fires
      [...tempMarksRef.current, ...tempHlDivsRef.current].forEach((el, i) => {
        el.style.animation = "none";
        if (i === 0) el.dataset.hlId = savedData.id;
      });
    }
    tempMarksRef.current = [];
    tempHlDivsRef.current = [];
    setPendingSelection(null);
    setSelectionRect(null);
    setTempMarkOffscreen(null);
    window.getSelection()?.removeAllRanges();
    if (savedData?.id) {
      setSidebarFocus({ id: savedData.id, seq: Date.now(), forceSource: true });
    }
  }

  async function handleToolbarHighlight(color) {
    if (!toolbar) return;
    const selData = toolbar;
    setActiveColor(color);
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
    try { await saveHighlight(selData, color, ""); } catch { /* non-fatal */ }
  }

  function handleToolbarAddNote() {
    if (!toolbar) return;
    injectPulseStyle();
    if (toolbar.posType === "pdf_range") {
      tempHlDivsRef.current = insertPdfTempHighlight(toolbar.page, toolbar.rects, activeColor, pdfScale);
    } else {
      tempMarksRef.current = wrapSelectionInTempMark(editorRef.current, activeColor);
    }
    setPendingSelection(toolbar);
    setSelectionRect(toolbar.selRect);
    setToolbar(null);
  }

  async function handleToolbarCopy() {
    if (!toolbar) return;
    try { await navigator.clipboard.writeText(toolbar.text); } catch { /* non-fatal */ }
  }


  async function handleDelete(hlId) {
    try {
      await api.delete(`/highlights/${hlId}`);
      setHighlights((prev) => prev.filter((h) => h.id !== hlId));
    } catch { /* non-fatal */ }
  }

  async function handleEdit(hlId, note) {
    try {
      const { data } = await api.put(`/highlights/${hlId}`, { note });
      setHighlights((prev) => prev.map((h) => (h.id === hlId ? data : h)));
    } catch { /* non-fatal */ }
  }

  function handleMarkClick(hlId) {
    setConnector(null);
    activeHlRef.current = hlId;
    setSidebarFocus({ id: hlId, seq: Date.now(), forceSource: true });
  }

  function handleEditorClick(e) {
    const mark = e.target.closest("[data-hl-id]");
    if (!mark) return;
    clearTimeout(selTimerRef.current);
    handleMarkClick(mark.dataset.hlId);
  }

  function drawConnector(hlId) {
    // Use viewModeRef.current — avoids stale closure when called from async setTimeout/rAF
    const vm = viewModeRef.current;
    const searchRoot = vm !== "pdf" ? (editorRef.current || document) : document;
    const mark = searchRoot.querySelector(`[data-hl-id="${hlId}"]`);
    const card = document.querySelector(`[data-hl-card="${hlId}"]`);
    if (!mark || !card) { setConnector(null); return; }
    const m = mark.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    if (m.width === 0) { setConnector(null); return; } // element is hidden
    // Hide when highlight has scrolled out of the content area's visible bounds
    const scrollEl = contentAreaRef.current;
    if (scrollEl) {
      const sr = scrollEl.getBoundingClientRect();
      if (m.bottom < sr.top || m.top > sr.bottom) { setConnector(null); return; }
    }
    const x1 = Math.min(m.right, c.left - 150);
    setConnector({ x1, y1: m.top + m.height / 2, x2: c.left, y2: c.top + c.height / 2 });
  }

  function updateVisibleHighlights() {
    clearTimeout(visTimerRef.current);
    visTimerRef.current = setTimeout(() => {
      const marks = document.querySelectorAll('[data-hl-id]');
      const visible = new Set();
      marks.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) visible.add(el.dataset.hlId);
      });
      setVisibleHlIds((prev) => {
        if (prev.size === visible.size && [...visible].every((id) => prev.has(id))) return prev;
        return visible;
      });
    }, 100);
  }

  // Update connector origin from live temp-mark DOM positions while Add Note panel is open.
  // When the mark scrolls out of view, records direction (above/below) without moving the panel.
  function updateTempConnector() {
    const allMarks = [...tempMarksRef.current, ...tempHlDivsRef.current];
    if (allMarks.length === 0) return;
    const first = allMarks[0].getBoundingClientRect();
    if (first.bottom < 0) {
      setTempMarkOffscreen("above");
      return;
    }
    if (first.top > window.innerHeight) {
      setTempMarkOffscreen("below");
      return;
    }
    // Mark is visible — compute union rect of all temp elements and update connector origin
    const union = allMarks.reduce(
      (acc, el) => {
        const r = el.getBoundingClientRect();
        return {
          top: Math.min(acc.top, r.top),
          bottom: Math.max(acc.bottom, r.bottom),
          left: Math.min(acc.left, r.left),
          right: Math.max(acc.right, r.right),
        };
      },
      { top: Infinity, bottom: -Infinity, left: Infinity, right: -Infinity }
    );
    setTempMarkOffscreen(null);
    setSelectionRect({
      top: union.top,
      bottom: union.bottom,
      left: union.left,
      right: union.right,
      height: union.bottom - union.top,
      width: union.right - union.left,
    });
  }

  function saveTextPosition() {
    clearTimeout(positionSaveTimerRef.current);
    positionSaveTimerRef.current = setTimeout(() => {
      const offset = findReadingOffset(editorRef.current, contentAreaRef.current);
      if (offset === null) return;
      const savedAt = new Date().toISOString();
      localStorage.setItem(`reader_position_${id}`, JSON.stringify({ offset, savedAt }));
      api.patch(`/documents/${id}`, { last_read_offset: offset, last_read_at: savedAt }).catch(() => {});
    }, 1000);
  }

  function handleContentScroll() {
    if (isProgrammaticScrollRef.current) return;
    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (activeHlRef.current) drawConnector(activeHlRef.current);
      if (tempMarksRef.current.length > 0 || tempHlDivsRef.current.length > 0) {
        updateTempConnector();
      }
    });
    updateVisibleHighlights();
    if (viewMode !== "pdf") saveTextPosition();
  }

  function handleScrollBackToMark() {
    const mark = tempMarksRef.current[0] || tempHlDivsRef.current[0];
    if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleJumpTo(hl) {
    setConnector(null);
    activeHlRef.current = hl.id;
    isProgrammaticScrollRef.current = true; // suppress manual-scroll clearing until connector is drawn

    function showAfterScroll() {
      const scrollEl = contentAreaRef.current;
      const draw = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        drawConnector(hl.id);
        // Allow manual scrolls to clear the connector ~200ms after drawing
        // (gives the scroll animation time to fully settle)
        setTimeout(() => { isProgrammaticScrollRef.current = false; }, 200);
      }));
      if (!scrollEl) { draw(); return; }

      let scrollStarted = false;
      let quietTimer;

      const onScroll = () => {
        scrollStarted = true;
        clearTimeout(quietTimer);
        // Draw 80ms after the last scroll event (scroll has settled)
        quietTimer = setTimeout(() => {
          scrollEl.removeEventListener('scroll', onScroll);
          draw();
        }, 80);
      };

      scrollEl.addEventListener('scroll', onScroll);

      // If no scroll event fires within 150ms, element was already in view — draw now
      setTimeout(() => {
        if (!scrollStarted) {
          scrollEl.removeEventListener('scroll', onScroll);
          draw();
        }
      }, 150);
    }

    if (hl.position?.type === "pdf_range") {
      const alreadyPdf = viewMode === "pdf";
      if (!alreadyPdf) setViewMode("pdf");
      setTimeout(() => {
        document.querySelector(`[data-page="${hl.position.page}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        showAfterScroll();
      }, alreadyPdf ? 0 : 150);
    } else {
      const targetView = hl.position?.view || "epub";
      const needsSwitch = viewMode !== targetView;
      if (needsSwitch) setViewMode(targetView);
      setTimeout(() => {
        document.querySelector(`[data-hl-id="${hl.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        showAfterScroll();
      }, needsSwitch ? 150 : 0);
    }
  }

  function startResize(e) {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      if (!isDraggingRef.current) return;
      const newWidth = Math.max(160, Math.min(600, window.innerWidth - ev.clientX));
      setSidebarWidth(newWidth);
    }
    function onUp() {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function changeFontSize(delta) {
    setFontSize((prev) => {
      const next = Math.min(32, Math.max(10, prev + delta));
      localStorage.setItem(`reader_font_size_${id}`, next);
      return next;
    });
  }

  // Auto-switch to "epub" view when an epub document loads (avoids stale "pdf" viewMode)
  useEffect(() => {
    if (doc?.type === "epub" && viewMode === "pdf") {
      setViewMode("epub");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  if (!doc) return <div style={{ padding: 24, fontFamily: "'Outfit', sans-serif" }}>Loading…</div>;

  const isPdf  = doc.type === "pdf";
  const isEpub = doc.type === "epub";

  return (
    <>
      <style>{READER_STYLES}</style>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", fontFamily: "'Outfit', sans-serif" }}>

        {/* TOPBAR */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 16px",
          background: "var(--surface)", borderBottom: "1.5px solid var(--border)",
          flexShrink: 0, zIndex: 100, flexWrap: "wrap",
        }}>
          <button onClick={() => navigate(-1)} style={fmtBtn}>← Back</button>

          {(isPdf || isEpub) && (
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--accent)" }}>
              {(isPdf
                ? [{ id: "pdf", label: "PDF" }, { id: "epub", label: "EPUB" }, { id: "text", label: "Text" }]
                : [{ id: "epub", label: "EPUB" }, { id: "text", label: "Text" }]
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  style={{
                    ...fmtBtn,
                    border: "none",
                    borderRadius: 0,
                    borderRight: id !== "text" ? "1px solid var(--accent)" : "none",
                    background: viewMode === id ? "var(--accent)" : "var(--surface2)",
                    color: viewMode === id ? "#fff" : "var(--text)",
                    fontWeight: viewMode === id ? 600 : 400,
                    minWidth: 46,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <span style={{ fontFamily: "'Lora', serif", fontWeight: 600, fontSize: "1rem", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 60 }}>
            {doc.title}
          </span>

          {/* Font size controls — EPUB and Text modes only */}
          {viewMode !== "pdf" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, borderLeft: "1.5px solid var(--border)", paddingLeft: 10 }}>
              <button style={fmtBtn} onClick={() => changeFontSize(-2)}>A-</button>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", minWidth: 32, textAlign: "center" }}>{fontSize}px</span>
              <button style={fmtBtn} onClick={() => changeFontSize(+2)}>A+</button>
            </div>
          )}

          {/* Zoom control — PDF view only */}
          {isPdf && viewMode === "pdf" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, borderLeft: "1.5px solid var(--border)", paddingLeft: 10 }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Zoom:</span>
              <select
                style={sel}
                value={Math.round(pdfScale * 100)}
                onChange={(e) => setPdfScale(Number(e.target.value) / 100)}
              >
                {[50, 75, 100, 125, 150, 175, 200].map((p) => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ borderLeft: "1.5px solid var(--border)", paddingLeft: 10, marginLeft: "auto", flexShrink: 0 }}>
            <ThemeToggle />
          </div>

        </div>

        {/* PDF render progress bar */}
        {pdfProgress.loading && pdfProgress.total > 0 && (() => {
          const pct = Math.round((pdfProgress.current / pdfProgress.total) * 100);
          return (
            <div style={{ flexShrink: 0, padding: "6px 16px 4px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <span>
                  {pdfProgress.ocr ? "🔍 OCR scanning" : "Rendering"} page {pdfProgress.current} of {pdfProgress.total}
                  {pdfProgress.ocr && <span style={{ marginLeft: 6, fontSize: "0.7rem", opacity: 0.7 }}>(scanned page)</span>}
                </span>
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 99, transition: "width 0.2s ease" }} />
              </div>
            </div>
          );
        })()}

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Content area */}
          <div ref={contentAreaRef} onScroll={handleContentScroll} onClick={handleEditorClick} className="reader-content" style={{ flex: 1, overflowY: "auto" }}>
            {isPdf && (
              <div style={{ display: viewMode === "pdf" ? "contents" : "none" }}>
                <PdfViewer
                  docId={id}
                  highlights={highlights}
                  scale={pdfScale}
                  onProgress={setPdfProgress}
                  onSelection={({ text, page, rects, rect }) => {
                    const selRect = rect || { top: window.innerHeight / 2, left: window.innerWidth / 2, right: window.innerWidth / 2, bottom: window.innerHeight / 2, height: 0, width: 0 };
                    setToolbar({ text, page, rects, posType: "pdf_range", selRect });
                  }}
                />
              </div>
            )}
            {!(isPdf && viewMode === "pdf") && (
              <div
                key={viewMode}
                ref={editorRef}
                data-testid="text-editor"
                onMouseUp={handleMouseUp}
                style={{
                  maxWidth: 780,
                  margin: "0 auto",
                  padding: "32px 24px 80px",
                  fontFamily: "'Lora', serif",
                  fontSize: fontSize,
                  lineHeight: 1.85,
                  color: "var(--reader-text)",
                  outline: "none",
                  minHeight: "100%",
                }}
              />
            )}
          </div>

          {/* Draggable divider */}
          <div
            onMouseDown={startResize}
            style={{
              width: 5,
              flexShrink: 0,
              cursor: "col-resize",
              background: "transparent",
              borderLeft: "1.5px solid var(--border, #d8cfc0)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--accent, #c4622d)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          />

          {/* Sidebar */}
          <AnnotationSidebar
            highlights={highlights}
            docTitle={doc.title}
            onDelete={handleDelete}
            onJumpTo={handleJumpTo}
            onEdit={handleEdit}
            focusRequest={sidebarFocus}
            onFocusComplete={(hlId) => requestAnimationFrame(() => requestAnimationFrame(() => drawConnector(hlId)))}
            width={sidebarWidth}
            visibleHlIds={visibleHlIds}
          />
        </div>

        {/* Highlight-to-card connector line */}
        {connector && (() => {
          const { x1, y1, x2, y2 } = connector;
          const spread = (x2 - x1) * 0.4;
          const cx1 = x1 + spread;
          const cx2 = x2 - spread;
          return (
            <svg style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 200 }}>
              <path
                d={`M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                opacity={0.7}
              />
              <circle cx={x1} cy={y1} r={3} fill="var(--accent)" opacity={0.8} />
              <circle cx={x2} cy={y2} r={3} fill="var(--accent)" opacity={0.8} />
            </svg>
          );
        })()}

        {/* Floating selection toolbar */}
        <SelectionToolbar
          toolbar={toolbar}
          activeColor={activeColor}
          onHighlight={handleToolbarHighlight}
          onAddNote={handleToolbarAddNote}
          onCopy={handleToolbarCopy}
          onClose={() => setToolbar(null)}
        />

        {/* Note popup */}
        <NotePopup
          visible={pendingSelection !== null}
          selectionRect={selectionRect}
          selectedText={pendingSelection?.text || ""}
          activeColor={activeColor}
          onSave={handleSave}
          markOffscreen={tempMarkOffscreen}
          onScrollBack={handleScrollBackToMark}
          docId={id}
          onClose={() => {
            cleanupTempHighlight(tempMarksRef.current, tempHlDivsRef.current);
            tempMarksRef.current = [];
            tempHlDivsRef.current = [];
            setPendingSelection(null);
            setSelectionRect(null);
            setTempMarkOffscreen(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      </div>

      {showToast && (
        <div style={{
          position: "fixed",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--text)",
          color: "var(--bg)",
          padding: "8px 18px",
          borderRadius: 6,
          fontSize: "0.83rem",
          fontFamily: "'Outfit', sans-serif",
          zIndex: 300,
          pointerEvents: "none",
          animation: "fadeToast 3s ease forwards",
        }}>
          Resumed from where you left off
        </div>
      )}
    </>
  );
}

// Returns a rect that is the union of all line rects in a range.
// range.getBoundingClientRect() can return only the first line rect in some browsers/layouts.
function getRangeUnionRect(range) {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
  if (!rects.length) return range.getBoundingClientRect();
  const top    = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const left   = Math.min(...rects.map((r) => r.left));
  const right  = Math.max(...rects.map((r) => r.right));
  return { top, bottom, left, right, width: right - left, height: bottom - top };
}

function getCharOffset(container, node, offset) {
  if (!container) return 0;
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode === node) return total + offset;
    total += walker.currentNode.textContent.length;
  }
  return total;
}

function applyHighlights(html, highlights) {
  if (!html) return html || "";
  if (typeof document === "undefined") return html;
  const textHighlights = highlights.filter((h) => h.position?.type === "text_range");
  if (!textHighlights.length) return html;

  const container = document.createElement("div");
  container.innerHTML = html;
  const sorted = [...textHighlights].sort((a, b) => b.position.start_offset - a.position.start_offset);

  for (const hl of sorted) {
    const { start_offset: hlStart, end_offset: hlEnd } = hl.position;
    const bg = COLOR_BG[hl.color] || COLOR_BG.yellow;
    const freshNodes = [];
    let total = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      freshNodes.push({ node, start: total, end: total + node.textContent.length });
      total += node.textContent.length;
    }
    for (const { node, start, end } of freshNodes) {
      if (end <= hlStart || start >= hlEnd) continue;
      const localStart = Math.max(0, hlStart - start);
      const localEnd   = Math.min(node.textContent.length, hlEnd - start);
      const before = node.textContent.slice(0, localStart);
      const marked = node.textContent.slice(localStart, localEnd);
      const after  = node.textContent.slice(localEnd);
      const parent = node.parentNode;
      if (!parent) continue;
      const mark = document.createElement("mark");
      mark.style.background = bg;
      mark.dataset.hlId = hl.id;
      mark.textContent = marked;
      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(mark, node);
      if (after)  parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
    }
  }
  return container.innerHTML;
}

// ── Temp-highlight helpers (exported for testing) ─────────────

export function injectPulseStyle() {
  if (document.getElementById("hl-pending-pulse")) return;
  const s = document.createElement("style");
  s.id = "hl-pending-pulse";
  s.textContent = `@keyframes hl-pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`;
  document.head.appendChild(s);
}

export function cleanupTempHighlight(marks, hlDivs) {
  marks.forEach((m) => { if (m.parentNode) m.replaceWith(...m.childNodes); });
  hlDivs.forEach((d) => d.remove());
}

export function wrapSelectionInTempMark(editorEl, color) {
  const marks = [];
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return marks;

  const range = sel.getRangeAt(0).cloneRange();
  if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) return marks;

  const bg = COLOR_BG[color] || COLOR_BG.yellow;
  function makeMark() {
    const m = document.createElement("mark");
    m.style.background = bg;
    m.style.animation = "hl-pulse 1.4s ease-in-out infinite";
    m.dataset.tempHl = "true";
    return m;
  }

  // Primary path: selection within a single text node — one mark wraps all selected content
  if (range.startContainer === range.endContainer) {
    const mark = makeMark();
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
    return [mark];
  }

  // Cross-element range: wrap each intersecting text node individually to preserve DOM structure
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (range.intersectsNode(node)) textNodes.push(node);
  }
  for (const textNode of textNodes) {
    const nodeRange = document.createRange();
    nodeRange.setStart(textNode, textNode === range.startContainer ? range.startOffset : 0);
    nodeRange.setEnd(textNode, textNode === range.endContainer ? range.endOffset : textNode.textContent.length);
    if (nodeRange.collapsed) continue;
    const mark = makeMark();
    const fragment = nodeRange.extractContents();
    mark.appendChild(fragment);
    nodeRange.insertNode(mark);
    marks.push(mark);
  }
  return marks;
}

export function insertPdfTempHighlight(page, rects, color, scale) {
  const divs = [];
  const pageWrapper = document.querySelector(`[data-page="${page}"]`);
  const hlLayer = pageWrapper?.querySelector(".highlight-layer");
  if (!hlLayer || !rects?.length) return divs;

  const bg = COLOR_BG[color] || COLOR_BG.yellow;
  for (const rect of rects) {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.left = `${rect.x * scale}px`;
    div.style.top = `${rect.y * scale}px`;
    div.style.width = `${rect.w * scale}px`;
    div.style.height = `${rect.h * scale}px`;
    div.style.background = bg;
    div.style.borderRadius = "2px";
    div.style.animation = "hl-pulse 1.4s ease-in-out infinite";
    div.dataset.tempHl = "true";
    hlLayer.appendChild(div);
    divs.push(div);
  }
  return divs;
}

// ── Reading-position helpers (exported for testing) ───────────────────────────

export function findReadingOffset(editorEl, contentAreaEl) {
  if (!editorEl || !contentAreaEl) return null;

  // Use scrollTop to find the visible position — avoids elementFromPoint issues
  // with centred/narrow content columns that don't span the full container width.
  const scrollTop = contentAreaEl.scrollTop;

  const BLOCK = ['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','SECTION','ARTICLE'];
  const selector = BLOCK.join(',');
  const blocks = Array.from(editorEl.querySelectorAll(selector));

  // First block whose top edge is at or below the scroll position
  const target = blocks.find(b =>
    b.offsetTop + (b.offsetParent?.offsetTop ?? 0) >= scrollTop
  ) || blocks[0];

  if (!target) return null;

  let charCount = 0;
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (target.contains(walker.currentNode)) break;
    charCount += walker.currentNode.textContent.length;
  }
  return charCount;
}

export function findElementAtOffset(editorEl, offset) {
  if (!editorEl || offset === null || offset === undefined) return null;
  const PREFER   = new Set(['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE']);
  const FALLBACK = new Set(['DIV','SECTION','ARTICLE']);
  let charCount = 0;
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const nodeLen = walker.currentNode.textContent.length;
    if (charCount + nodeLen >= offset) {
      // Walk up from the text node — return the closest PREFER ancestor first,
      // fall back to the closest FALLBACK ancestor, never return editorEl itself.
      let el = walker.currentNode.parentElement;
      let preferred = null;
      let fallback = null;
      while (el && el !== editorEl) {
        if (!preferred && PREFER.has(el.tagName)) preferred = el;
        if (!fallback && FALLBACK.has(el.tagName)) fallback = el;
        el = el.parentElement;
      }
      return preferred ?? fallback ?? null;
    }
    charCount += nodeLen;
  }
  return null;
}

export function findCurrentPdfPage(contentAreaEl) {
  if (!contentAreaEl) return null;
  const rect = contentAreaEl.getBoundingClientRect();
  let el = document.elementFromPoint(
    rect.left + contentAreaEl.offsetWidth / 2,
    rect.top + 10,
  );
  while (el && !el.dataset?.page && el !== document.body) {
    el = el.parentElement;
  }
  const page = el?.dataset?.page ? parseInt(el.dataset.page, 10) : null;
  return page && !isNaN(page) ? page : null;
}
