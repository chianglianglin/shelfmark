import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import ThemeToggle from "../components/ThemeToggle";

const btnBase = {
  height: 32,
  padding: "0 12px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid",
  lineHeight: 1,
};
const btnSecondary = { ...btnBase, background: "transparent", color: "var(--text)", borderColor: "var(--border)" };
const btnCompact = {
  height: 28,
  padding: "0 9px",
  borderRadius: 5,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  lineHeight: 1,
};
// Toolbar buttons — consistent 34px height, themed border
const btnTool = {
  height: 34,
  padding: "0 12px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  lineHeight: 1,
  fontFamily: "'Outfit', sans-serif",
  whiteSpace: "nowrap",
};
// Inner buttons inside a grouped border (no individual border)
const btnToolInner = {
  height: 34,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  lineHeight: 1,
  fontFamily: "'Outfit', sans-serif",
};
const dropdownItem = {
  display: "block",
  width: "100%",
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 400,
  cursor: "pointer",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  textAlign: "left",
  fontFamily: "'Outfit', sans-serif",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function formatSrtTime(s) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, "0");
  return `${h}:${m}:${sec},${ms}`;
}

function generateSrt(words) {
  if (!words || words.length === 0) return "";
  const CHUNK = 7;
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK) {
    chunks.push(words.slice(i, i + CHUNK));
  }
  return chunks
    .map((chunk, idx) => {
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const text = chunk.map((w) => w.word).join(" ").trim();
      return `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}`;
    })
    .join("\n\n");
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Group words into paragraphs at sentence boundaries (every ~9 sentences). */
function buildParagraphs(words) {
  const paragraphs = [];
  let current = [];
  let sentenceCount = 0;
  words.forEach((word, globalIdx) => {
    current.push({ word, globalIdx });
    if (/[.?!]/.test(word.word)) {
      sentenceCount++;
      if (sentenceCount >= 9) {
        paragraphs.push(current);
        current = [];
        sentenceCount = 0;
      }
    }
  });
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

function estimatedTime(durationSeconds) {
  if (!durationSeconds) return null;
  const min = durationSeconds / 60;
  if (min < 10) return "~1 minute";
  if (min < 30) return "~2-5 minutes";
  if (min < 60) return "~5-10 minutes";
  return "~10-20 minutes";
}

/** Find the start/end indices of the sentence containing `idx`. */
function getSentenceBounds(words, idx) {
  if (idx < 0 || !words) return { start: -1, end: -1 };
  let start = idx;
  while (start > 0 && !/[.?!]/.test(words[start - 1].word)) start--;
  let end = idx;
  while (end < words.length - 1 && !/[.?!]/.test(words[end].word)) end++;
  return { start, end };
}

function isWordHighlighted(i, activeIdx, displayIdx, highlightMode, words) {
  if (highlightMode === "word") return activeIdx >= 0 && i === activeIdx;
  if (displayIdx < 0) return false;
  const { start, end } = getSentenceBounds(words, displayIdx);
  return i >= start && i <= end;
}

// ─── ChapterRow ───────────────────────────────────────────────────────────────

function ChapterRow({ chapter, isActive, onSeek, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);
  const inputRef = useRef(null);

  function commit() {
    if (draft.trim()) onRename(draft.trim());
    setEditing(false);
  }

  return (
    <div
      className="chapter-row"
      onClick={editing ? undefined : onSeek}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        cursor: editing ? "default" : "pointer",
        borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
        background: isActive ? "var(--surface3)" : "transparent",
        gap: 6,
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(chapter.title); setEditing(false); } }}
          onBlur={commit}
          style={{ flex: 1, fontSize: 12, border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {chapter.title}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
              {formatTime(chapter.start_time)}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "2px 3px", opacity: 0, transition: "opacity 0.1s" }}
            className="chapter-action-btn"
            title="Rename"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "2px 3px", opacity: 0, transition: "opacity 0.1s" }}
            className="chapter-action-btn"
            title="Delete"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TranscriptionReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const audioRef = useRef(null);
  const wordRefs = useRef({});
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const highestActiveRef = useRef(-1);

  const searchInputRef = useRef(null);
  const showSearchRef = useRef(false);
  const [showSearch, setShowSearch] = useState(false);
  useEffect(() => { showSearchRef.current = showSearch; }, [showSearch]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchIdx, setSearchIdx] = useState(0);

  const [showAnnotations, setShowAnnotations] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [showChapters, setShowChapters] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 768);
  const [selectionRange, setSelectionRange] = useState(null); // {start, end}
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [showToolbar, setShowToolbar] = useState(false);
  const [notePopup, setNotePopup] = useState(null); // {startIdx, endIdx, text, color}
  const [pendingColor, setPendingColor] = useState("yellow");
  const [sharePopup, setSharePopup] = useState(false);
  const [shareLink, setShareLink] = useState(null); // { share_url, expires_at }
  const [transcribeComplete, setTranscribeComplete] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);
  const minimapRef = useRef(null);
  const [minimapScroll, setMinimapScroll] = useState({ scrollY: 0, scrollH: 1, viewH: 1 });

  const [connectorPath, setConnectorPath] = useState(null);
  const [connectorPoints, setConnectorPoints] = useState(null);
  const connectorIdRef = useRef(null);
  const scrollRafRef = useRef(null);
  const [flashingCardId, setFlashingCardId] = useState(null);
  const [showAnnExportMenu, setShowAnnExportMenu] = useState(false);
  const annExportMenuRef = useRef(null);
  const [annExportCopied, setAnnExportCopied] = useState(false);

  const [trans, setTrans] = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightMode, setHighlightMode] = useState("word");
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem("transcription_font_size");
    return saved ? parseInt(saved, 10) : 16;
  });
  const [speed, setSpeed] = useState(() => {
    const saved = localStorage.getItem("transcription_speed");
    return saved ? parseFloat(saved) : 1.0;
  });
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("transcription_volume");
    return saved ? parseFloat(saved) : 1.0;
  });

  // Fetch transcript + audio
  useEffect(() => {
    Promise.all([
      api.get(`/transcriptions/${id}`),
      api.get(`/transcriptions/${id}/audio`, { responseType: "blob" }),
    ]).then(([metaResp, audioResp]) => {
      setTrans(metaResp.data);
      setAudioSrc(URL.createObjectURL(audioResp.data));
    }).catch(() => {}).finally(() => setLoading(false));

    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch annotations
  useEffect(() => {
    if (!id) return;
    api.get(`/transcription-annotations?transcription_id=${id}`)
      .then((r) => setAnnotations(r.data))
      .catch(() => {});
  }, [id]);

  // Load chapters from transcription data
  useEffect(() => {
    if (trans?.chapters) setChapters(trans.chapters);
  }, [trans?.chapters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load share link from trans data
  useEffect(() => {
    if (trans?.share_token) {
      setShareLink({ share_url: `/shared/${trans.share_token}`, expires_at: trans.share_expires_at });
    }
  }, [trans?.share_token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for transcription completion while status is "processing"
  useEffect(() => {
    if (trans?.status !== "processing") return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/transcriptions/${id}`);
        setTrans((prev) => ({ ...prev, progress: data.progress }));
        if (data.status !== "processing") {
          setTrans(data);
          clearInterval(interval);
          if (data.status === "done") {
            setTranscribeComplete(true);
            setTimeout(() => setTranscribeComplete(false), 1500);
          }
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [trans?.status, id]);

  // Track screen size for responsive chapters sidebar
  useEffect(() => {
    function onResize() { setIsSmallScreen(window.innerWidth < 768); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track scroll position for mini-map viewport indicator
  useEffect(() => {
    function onScroll() {
      setMinimapScroll({
        scrollY: window.scrollY,
        scrollH: document.documentElement.scrollHeight,
        viewH: window.innerHeight,
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // capture initial values
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Redraw connector on scroll — uses fresh rects so position is always correct
  useEffect(() => {
    function onWindowScroll() {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        if (connectorIdRef.current) drawConnector(connectorIdRef.current);
      });
    }
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onWindowScroll);
      cancelAnimationFrame(scrollRafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showExportMenu]);

  // Close annotation export dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (annExportMenuRef.current && !annExportMenuRef.current.contains(e.target)) {
        setShowAnnExportMenu(false);
      }
    }
    if (showAnnExportMenu) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAnnExportMenu]);

  // Apply saved playback speed whenever audio loads or speed changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [audioSrc, speed]);

  // Restore saved volume when audio loads
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [audioSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.paused
              ? audioRef.current.play().catch(() => {})
              : audioRef.current.pause();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(
              0, audioRef.current.currentTime + (e.shiftKey ? -30 : -10)
            );
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.min(
              audioRef.current.duration || 0,
              Math.max(0, audioRef.current.currentTime + (e.shiftKey ? 30 : 10))
            );
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setFontSize((prev) => {
            const next = Math.min(28, prev + 2);
            localStorage.setItem("transcription_font_size", String(next));
            return next;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setFontSize((prev) => {
            const next = Math.max(12, prev - 2);
            localStorage.setItem("transcription_font_size", String(next));
            return next;
          });
          break;
        case "Escape":
          if (showSearchRef.current) {
            setShowSearch(false);
            setSearchQuery("");
            setSearchResults([]);
            setSearchIdx(0);
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect manual scrolling — suppress auto-scroll for 2 s after
  useEffect(() => {
    function onUserScroll() {
      isUserScrollingRef.current = true;
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 2000);
    }
    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Derived values
  const activeIdx = trans?.words
    ? trans.words.findIndex((w) => currentTime >= w.start && currentTime < w.end)
    : -1;

  // Keep a high-water mark for dimming — only moves forward unless user seeks back
  if (activeIdx > -1) {
    if (activeIdx < highestActiveRef.current - 5) {
      // Backwards seek: reset to current position
      highestActiveRef.current = Math.max(0, activeIdx);
    } else {
      highestActiveRef.current = Math.max(highestActiveRef.current, activeIdx);
    }
  }

  // displayIdx: use actual active word when playing, fall back to high-water mark
  // during gaps/pauses so sentence highlight doesn't flash off
  const displayIdx = activeIdx >= 0 ? activeIdx : highestActiveRef.current;

  const progress = trans?.duration_seconds
    ? (currentTime / trans.duration_seconds) * 100
    : 0;

  const paragraphs = trans?.words ? buildParagraphs(trans.words) : [];

  // Map word index → annotation color (for persistent highlights)
  const annotationColorByIdx = {};
  const annotationIdByIdx = {};
  annotations.forEach((ann) => {
    const pos = ann.position;
    if (pos?.type === "transcription_range") {
      for (let i = pos.start_word_index; i <= pos.end_word_index; i++) {
        annotationColorByIdx[i] = ann.color;
        annotationIdByIdx[i] = ann.id;
      }
    }
  });

  // Color background map
  const ANN_COLOR_BG = {
    yellow: "rgba(245,216,66,0.45)",
    green: "rgba(76,175,118,0.40)",
    blue: "rgba(74,144,217,0.40)",
    pink: "rgba(232,112,144,0.40)",
  };

  // Mini-map calculations
  const mmH = minimapScroll.viewH || (typeof window !== "undefined" ? window.innerHeight : 800);
  const mmTotalScrollable = Math.max(1, minimapScroll.scrollH - minimapScroll.viewH);
  const mmViewFrac = Math.min(1, mmH / Math.max(mmH, minimapScroll.scrollH));
  const mmViewH = Math.max(20, mmViewFrac * mmH);
  const mmScrollRatio = minimapScroll.scrollY / mmTotalScrollable;
  const mmViewTop = mmScrollRatio * (mmH - mmViewH);
  function getMinimapY(wordIndex) {
    const total = trans?.words?.length || 1;
    return Math.round((wordIndex / total) * mmH);
  }

  // Auto-scroll to active word during playback
  useEffect(() => {
    if (activeIdx < 0 || !isPlaying || isUserScrollingRef.current) return;
    const el = wordRefs.current[activeIdx];
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, isPlaying]);

  // Clear connector when audio moves 200+ px past annotation
  useEffect(() => {
    if (!connectorIdRef.current || activeIdx < 0) return;
    const ann = annotations.find((a) => a.id === connectorIdRef.current);
    if (!ann) return;
    const endIdx = ann.position?.end_word_index ?? ann.position?.start_word_index ?? 0;
    if (activeIdx > endIdx) {
      const hlEl = document.querySelector(`[data-hl-id="${connectorIdRef.current}"]`);
      const activeEl = wordRefs.current[activeIdx];
      if (hlEl && activeEl) {
        const hlRect = hlEl.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.top - hlRect.bottom > 200) {
          setConnectorPath(null);
          setConnectorPoints(null);
          connectorIdRef.current = null;
        }
      }
    }
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTimeUpdate() {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  }

  function seekTo(start) {
    if (audioRef.current) {
      audioRef.current.currentTime = start;
      audioRef.current.play().catch(() => {});
    }
  }

  function skip(seconds) {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(
        0,
        Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds)
      );
    }
  }

  function changeSpeed(s) {
    setSpeed(s);
    localStorage.setItem("transcription_speed", String(s));
    if (audioRef.current) audioRef.current.playbackRate = s;
  }

  function changeFontSize(delta) {
    setFontSize((prev) => {
      const next = Math.max(12, Math.min(28, prev + delta));
      localStorage.setItem("transcription_font_size", String(next));
      return next;
    });
  }

  function exportTxt() {
    if (!trans) return;
    triggerDownload(trans.full_text || "", `${trans.title}.txt`, "text/plain");
  }

  function exportSrt() {
    if (!trans) return;
    triggerDownload(generateSrt(trans.words || []), `${trans.title}.srt`, "text/plain");
  }

  function handleMouseUp(e) {
    if (notePopup) return; // don't interfere while note popup is open
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !trans?.words) {
      setShowToolbar(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const spans = document.querySelectorAll("[data-word-index]");
    const selected = [];
    spans.forEach((span) => {
      if (range.intersectsNode(span)) {
        selected.push(parseInt(span.dataset.wordIndex, 10));
      }
    });
    if (selected.length === 0) {
      setShowToolbar(false);
      return;
    }
    const startIdx = Math.min(...selected);
    const endIdx = Math.max(...selected);
    setSelectionRange({ start: startIdx, end: endIdx });
    const rect = range.getBoundingClientRect();
    setToolbarPos({ top: rect.top + window.scrollY - 48, left: rect.left + rect.width / 2 });
    setPendingColor("yellow");
    setShowToolbar(true);
  }

  function handleMinimapClick(e) {
    if (!minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: ratio * totalScrollable, behavior: "smooth" });
    if (trans?.words?.length > 0) {
      const word = trans.words[Math.min(Math.floor(ratio * trans.words.length), trans.words.length - 1)];
      if (word) seekTo(word.start);
    }
  }

  // Pure draw — always reads fresh getBoundingClientRect(), never cached coords.
  // Hides connector when mark scrolls off screen; restores when it comes back into view.
  function drawConnector(annotationId) {
    const markEl = document.querySelector(`[data-hl-id="${annotationId}"]`);
    const cardEl = document.querySelector(`[data-hl-card="${annotationId}"]`);
    if (!markEl || !cardEl) { setConnectorPath(null); setConnectorPoints(null); return; }
    const mark = markEl.getBoundingClientRect();
    const card = cardEl.getBoundingClientRect();
    if (mark.width === 0) { setConnectorPath(null); setConnectorPoints(null); return; }
    // Hide when mark is off-screen; connector restores automatically when user scrolls back
    if (mark.bottom < 0 || mark.top > window.innerHeight) {
      setConnectorPath(null);
      setConnectorPoints(null);
      return;
    }
    const contentEl = document.querySelector("[data-transcript-content]");
    const contentRect = contentEl ? contentEl.getBoundingClientRect() : null;
    const x1 = mark.right < 0 ? (contentRect ? contentRect.right : 0) : mark.right;
    const y1 = mark.top + mark.height / 2;
    const x2 = card.left;
    const y2 = card.top + card.height / 2;
    const dx = x2 - x1;
    setConnectorPath(`M ${x1} ${y1} C ${x1 + dx * 0.4} ${y1}, ${x2 - dx * 0.4} ${y2}, ${x2} ${y2}`);
    setConnectorPoints({ x1, y1, x2, y2 });
  }

  // Scroll-then-draw — same pattern as Reader.jsx handleJumpTo.
  // Clears connector, scrolls to mark, then draws 80ms after scroll settles
  // (or after 150ms if element was already in view and no scroll fires).
  function showConnectorAfterScroll(annotationId) {
    setConnectorPath(null);
    setConnectorPoints(null);
    connectorIdRef.current = annotationId;

    const ann = annotations.find((a) => a.id === annotationId);
    const startWordIdx = ann?.position?.start_word_index;
    const markEl = startWordIdx != null ? wordRefs.current[startWordIdx] : null;
    if (markEl) markEl.scrollIntoView({ behavior: "smooth", block: "center" });

    const draw = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (connectorIdRef.current === annotationId) drawConnector(annotationId);
    }));

    let scrollStarted = false;
    let quietTimer;

    const onScroll = () => {
      scrollStarted = true;
      clearTimeout(quietTimer);
      // Draw 80ms after the last scroll event (scroll has settled)
      quietTimer = setTimeout(() => {
        window.removeEventListener("scroll", onScroll);
        draw();
      }, 80);
    };

    window.addEventListener("scroll", onScroll);

    // If no scroll event fires within 150ms, element was already in view — draw now
    setTimeout(() => {
      if (!scrollStarted) {
        window.removeEventListener("scroll", onScroll);
        draw();
      }
    }, 150);
  }

  function scrollToCard(annotationId) {
    setTimeout(() => {
      const cardEl = document.querySelector(`[data-hl-card="${annotationId}"]`);
      if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function flashCard(annotationId) {
    setFlashingCardId(annotationId);
    setTimeout(() => setFlashingCardId((id) => (id === annotationId ? null : id)), 1000);
  }

  function handleWordClick(word, globalIdx, e) {
    const hlId = e.currentTarget.dataset.hlId;
    if (hlId) {
      showConnectorAfterScroll(hlId);
      setShowAnnotations(true);
      scrollToCard(hlId);
      flashCard(hlId);
      seekTo(word.start);
    } else {
      setConnectorPath(null);
      setConnectorPoints(null);
      connectorIdRef.current = null;
      seekTo(word.start);
    }
  }

  function buildAnnotationsMd() {
    const title = trans?.title || "Transcript";
    const sorted = [...annotations].sort((a, b) => (a.position?.start_time ?? 0) - (b.position?.start_time ?? 0));
    const lines = [
      `# ${title} — Annotations`,
      `Exported: ${new Date().toLocaleDateString()}`,
      `Total: ${sorted.length} annotations`,
      "",
    ];
    for (const ann of sorted) {
      lines.push("---", "");
      lines.push(`> ${ann.text}`);
      lines.push(`Timestamp: ${formatTime(ann.position?.start_time ?? 0)}`);
      if (ann.note) lines.push(`Note: ${ann.note}`);
      lines.push(`Color: ${ann.color}`);
      lines.push(`Added: ${new Date(ann.created_at).toLocaleDateString()}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  function buildAnnotationsCsv() {
    const sorted = [...annotations].sort((a, b) => (a.position?.start_time ?? 0) - (b.position?.start_time ?? 0));
    const rows = [["timestamp", "highlighted_text", "note", "color", "date_added"].join(",")];
    for (const ann of sorted) {
      rows.push([
        formatTime(ann.position?.start_time ?? 0),
        `"${(ann.text || "").replace(/"/g, '""')}"`,
        ann.note ? `"${ann.note.replace(/"/g, '""')}"` : "",
        ann.color,
        new Date(ann.created_at).toLocaleDateString(),
      ].join(","));
    }
    return rows.join("\n");
  }

  function buildAnnotationsJson() {
    const sorted = [...annotations].sort((a, b) => (a.position?.start_time ?? 0) - (b.position?.start_time ?? 0));
    return JSON.stringify({
      title: trans?.title || "",
      exported: new Date().toISOString(),
      total: sorted.length,
      annotations: sorted.map((ann) => ({
        id: ann.id,
        timestamp: ann.position?.start_time ?? 0,
        timestamp_formatted: formatTime(ann.position?.start_time ?? 0),
        text: ann.text,
        note: ann.note || null,
        color: ann.color,
        created_at: ann.created_at,
      })),
    }, null, 2);
  }

  async function saveAnnotationFile(content, filename, mimeType, description, ext) {
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description, accept: { [mimeType]: [ext] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    triggerDownload(content, filename, mimeType);
  }

  async function exportAnnotationsMd() {
    await saveAnnotationFile(buildAnnotationsMd(), `${trans?.title || "transcript"}-annotations.md`, "text/markdown", "Markdown", ".md");
    setShowAnnExportMenu(false);
  }

  async function exportAnnotationsCsvFile() {
    await saveAnnotationFile(buildAnnotationsCsv(), `${trans?.title || "transcript"}-annotations.csv`, "text/csv", "CSV", ".csv");
    setShowAnnExportMenu(false);
  }

  async function exportAnnotationsJsonFile() {
    await saveAnnotationFile(buildAnnotationsJson(), `${trans?.title || "transcript"}-annotations.json`, "application/json", "JSON", ".json");
    setShowAnnExportMenu(false);
  }

  async function copyAnnotationsToClipboard() {
    try {
      await navigator.clipboard.writeText(buildAnnotationsMd());
      setAnnExportCopied(true);
      setTimeout(() => setAnnExportCopied(false), 2000);
    } catch {}
    setShowAnnExportMenu(false);
  }

  function saveAnnotation({ startIdx, endIdx, text, color, note }) {
    if (!trans) return;
    api.post("/transcription-annotations", {
      transcription_id: trans.id,
      text,
      color,
      note,
      position: {
        type: "transcription_range",
        transcription_id: trans.id,
        start_word_index: startIdx,
        end_word_index: endIdx,
        start_time: trans.words[startIdx]?.start ?? 0,
        end_time: trans.words[endIdx]?.end ?? 0,
      },
    }).then((r) => {
      setAnnotations((prev) => [...prev, r.data]);
    }).catch(() => {});
  }

  function saveChapters(updated) {
    setChapters(updated);
    api.patch(`/transcriptions/${id}/chapters`, { chapters: updated }).catch(() => {});
  }

  function addChapter() {
    const newChapter = {
      id: crypto.randomUUID(),
      title: `Chapter ${chapters.length + 1}`,
      start_time: currentTime,
      word_index: Math.max(0, activeIdx >= 0 ? activeIdx : highestActiveRef.current),
    };
    const updated = [...chapters, newChapter].sort((a, b) => a.start_time - b.start_time);
    saveChapters(updated);
  }

  function renameChapter(chapId, title) {
    saveChapters(chapters.map((c) => c.id === chapId ? { ...c, title } : c));
  }

  function deleteChapter(chapId) {
    saveChapters(chapters.filter((c) => c.id !== chapId));
  }

  const activeChapterId = (() => {
    if (!chapters.length) return null;
    let active = chapters[0].id;
    for (const ch of chapters) {
      if (currentTime >= ch.start_time) active = ch.id;
      else break;
    }
    return active;
  })();

  // ── Loading / not-found states ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  if (!trans) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--danger-text)" }}>Transcription not found.</p>
        <button style={btnSecondary} onClick={() => navigate("/transcriptions")}>← Back</button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const readingMaxWidth = (showChapters && showAnnotations) ? 1400 : (showChapters || showAnnotations) ? 1100 : 960;

  return (
    <div style={{ display: "flex", width: "100vw", minHeight: "100vh", position: "relative", background: "var(--bg)" }}>
      {/* CSS for chapter hover effects */}
      <style>{`
        #root { width: 100% !important; max-width: none !important; margin: 0 !important; border-inline: none !important; text-align: left !important; }
        .chapter-row:hover .chapter-action-btn { opacity: 1 !important; }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes cardPulse {
          0%   { box-shadow: 0 0 0 0 rgba(196,98,45,0.5); }
          50%  { box-shadow: 0 0 0 6px rgba(196,98,45,0.15); }
          100% { box-shadow: 0 0 0 0 rgba(196,98,45,0); }
        }
      `}</style>

      {/* Chapters sidebar (left) */}
      {!isSmallScreen && (
        <div style={{
          width: showChapters ? 220 : 0,
          overflow: "hidden",
          flexShrink: 0,
          transition: "width 0.2s ease",
          background: "var(--surface2)",
          borderRight: showChapters ? "1px solid var(--border)" : "none",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: showChapters ? "auto" : "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Outfit', sans-serif",
        }}>
          <div style={{ padding: "14px 12px 8px", borderBottom: "1.5px solid var(--border)", fontWeight: 600, fontSize: 13 }}>
            Chapters
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {chapters.map((ch) => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                isActive={ch.id === activeChapterId}
                onSeek={() => seekTo(ch.start_time)}
                onRename={(title) => renameChapter(ch.id, title)}
                onDelete={() => deleteChapter(ch.id)}
              />
            ))}
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1.5px solid var(--border)" }}>
            <button
              onClick={addChapter}
              style={{ width: "100%", fontSize: 12, padding: "6px 0", cursor: "pointer", background: "transparent", border: "1.5px solid var(--border)", borderRadius: 6, color: "var(--text-muted)" }}
            >
              + Add Chapter
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>

      {/* Small screen: chapters as dropdown */}
      {showChapters && isSmallScreen && chapters.length > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 11, background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "6px 12px" }}>
          <select
            value={activeChapterId || ""}
            onChange={(e) => {
              const ch = chapters.find((c) => c.id === e.target.value);
              if (ch) seekTo(ch.start_time);
            }}
            style={{ width: "100%", fontSize: 13, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)" }}
          >
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.title} ({formatTime(ch.start_time)})</option>
            ))}
          </select>
        </div>
      )}

      {/* Header: title + toolbar */}
      <div style={{ padding: "0 24px" }}>
      {/* Title */}
      <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 600, color: "var(--text)" }}>
        {trans.title}
      </h1>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 6 }}>

        {/* ── Left group ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button style={btnTool} onClick={() => navigate("/transcriptions")}>← Back</button>
        </div>

        {/* ── Right group ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>

          <button
            onClick={() => {
              if (shareLink) {
                setSharePopup(true);
              } else {
                api.post(`/transcriptions/${id}/share`)
                  .then((r) => { setShareLink(r.data); setSharePopup(true); })
                  .catch(() => { setSharePopup(true); });
              }
            }}
            style={btnTool}
          >
            ↗ Share
          </button>

          {/* Export dropdown */}
          <div style={{ position: "relative" }} ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              style={{ ...btnTool, background: showExportMenu ? "var(--text)" : "transparent", color: showExportMenu ? "var(--bg)" : "var(--text)" }}
            >
              ⬇ Export ▾
            </button>
            {showExportMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                overflow: "hidden",
                minWidth: 148,
              }}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { exportTxt(); setShowExportMenu(false); }}
                  style={dropdownItem}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Download TXT
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { exportSrt(); setShowExportMenu(false); }}
                  style={{ ...dropdownItem, borderTop: "1px solid var(--border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Download SRT
                </button>
              </div>
            )}
          </div>
          <ThemeToggle />

        </div>
      </div>
      </div>{/* end header padding */}

      {/* Sticky control hub — audio player + navigation/reading tools */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--bg)",
        padding: "10px 24px",
        borderBottom: "1px solid var(--border)",
      }}>
        {audioSrc && (
          <>
            {/* Row 1: ↺ 10s  |  audio player  |  10s ↻ */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
              <button
                onClick={() => skip(-10)}
                style={{ height: 32, padding: "0 10px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                ↺ 10s
              </button>
              <div style={{ flex: 1, minWidth: 0, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <audio
                  ref={audioRef}
                  src={audioSrc}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onVolumeChange={() => {
                    if (audioRef.current) {
                      const v = audioRef.current.volume;
                      setVolume(v);
                      localStorage.setItem("transcription_volume", String(v));
                    }
                  }}
                  style={{ width: "100%", display: "block" }}
                />
              </div>
              <button
                onClick={() => skip(10)}
                style={{ height: 32, padding: "0 10px", borderRadius: 5, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                10s ↻
              </button>
            </div>

            {/* Row 2: progress bar */}
            <div style={{ position: "relative", height: 3, background: "var(--border)", marginTop: 6 }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)", transition: "width 0.1s linear" }} />
              {chapters.map((ch) => {
                const pct = trans?.duration_seconds ? (ch.start_time / trans.duration_seconds) * 100 : 0;
                return (
                  <div
                    key={ch.id}
                    title={ch.title}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: `${pct}%`,
                      width: 2,
                      height: "100%",
                      background: "rgba(255,255,255,0.8)",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                );
              })}
            </div>

            {/* Row 3: speed buttons + shortcut hint */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
              {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => changeSpeed(s)}
                  style={{
                    height: 26,
                    padding: "0 9px",
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    lineHeight: 1,
                    border: s === speed ? "none" : "1px solid var(--border)",
                    background: s === speed ? "var(--accent)" : "transparent",
                    color: s === speed ? "#fff" : "var(--text)",
                  }}
                >
                  {s}x
                </button>
              ))}
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
                Space to play/pause · ← → 10s
              </span>
            </div>
          </>
        )}

        {/* Navigation tools — always visible, separated from audio rows when present */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
          marginTop: audioSrc ? 10 : 0,
          paddingTop: audioSrc ? 10 : 0,
          borderTop: audioSrc ? "1px solid var(--border)" : "none",
        }}>
          <button
            onClick={() => {
              setShowSearch((v) => !v);
              if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            style={{ ...btnTool, height: 28, background: showSearch ? "var(--text)" : "transparent", color: showSearch ? "var(--bg)" : "var(--text)" }}
          >
            🔍 Search
          </button>

          <button
            onClick={() => setShowChapters((v) => !v)}
            style={{ ...btnTool, height: 28, background: showChapters ? "var(--text)" : "transparent", color: showChapters ? "var(--bg)" : "var(--text)" }}
          >
            ≡ Chapters
          </button>

          <button
            onClick={() => {
              setShowAnnotations((v) => {
                if (v) {
                  setConnectorPath(null);
                  setConnectorPoints(null);
                  connectorIdRef.current = null;
                }
                return !v;
              });
            }}
            style={{ ...btnTool, height: 28, background: showAnnotations ? "var(--text)" : "transparent", color: showAnnotations ? "var(--bg)" : "var(--text)" }}
          >
            📝 Notes
          </button>

          <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />

          {/* Font size */}
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <button style={{ ...btnToolInner, height: 28 }} onClick={() => changeFontSize(-2)} aria-label="Decrease font size">A−</button>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", padding: "0 6px", lineHeight: "28px", minWidth: 38, textAlign: "center", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>{fontSize}px</span>
            <button style={{ ...btnToolInner, height: 28 }} onClick={() => changeFontSize(2)} aria-label="Increase font size">A+</button>
          </div>

          <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />

          {/* Highlight mode */}
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {["word", "sentence"].map((mode, i) => (
              <button
                key={mode}
                onClick={() => setHighlightMode(mode)}
                style={{
                  ...btnToolInner,
                  height: 28,
                  borderRight: i === 0 ? "1px solid var(--border)" : "none",
                  background: highlightMode === mode ? "var(--text)" : "transparent",
                  color: highlightMode === mode ? "var(--bg)" : "var(--text)",
                  textTransform: "capitalize",
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar — inline, shown when Search is active */}
        {showSearch && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  if (!q.trim() || !trans?.words) {
                    setSearchResults([]);
                    setSearchIdx(0);
                    return;
                  }
                  const results = trans.words.reduce((acc, w, i) => {
                    if (w.word.toLowerCase().includes(q.toLowerCase())) acc.push(i);
                    return acc;
                  }, []);
                  setSearchResults(results);
                  setSearchIdx(0);
                  if (results.length > 0) {
                    const el = wordRefs.current[results[0]];
                    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                style={{ flex: 1, height: 32, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: "var(--text)", outline: "none" }}
              />
              <button
                aria-label="Clear search"
                onClick={() => { setSearchQuery(""); setSearchResults([]); setSearchIdx(0); }}
                style={btnCompact}
              >
                ✕
              </button>
              <button
                aria-label="Previous result"
                onClick={() => {
                  if (searchResults.length === 0) return;
                  const idx = (searchIdx - 1 + searchResults.length) % searchResults.length;
                  setSearchIdx(idx);
                  const el = wordRefs.current[searchResults[idx]];
                  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                style={btnCompact}
              >
                ↑
              </button>
              <button
                aria-label="Next result"
                onClick={() => {
                  if (searchResults.length === 0) return;
                  const idx = (searchIdx + 1) % searchResults.length;
                  setSearchIdx(idx);
                  const el = wordRefs.current[searchResults[idx]];
                  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                style={btnCompact}
              >
                ↓
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {searchQuery
                  ? searchResults.length > 0
                    ? `${searchIdx + 1} / ${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`
                    : "0 results"
                  : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Transcript content */}
      <div style={{ padding: "24px 24px 80px", maxWidth: readingMaxWidth, margin: "0 auto", boxSizing: "border-box" }}>

      <div style={{ marginBottom: 24 }} />

      {transcribeComplete && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", marginBottom: 16,
          background: "var(--status-done-bg)", border: "1px solid var(--status-done-border)", borderRadius: 8,
          color: "var(--status-done-text)", fontSize: 14, fontWeight: 500,
        }}>
          ✓ Transcription complete!
        </div>
      )}
      {trans.status === "processing" && (
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "24px 28px",
          background: "var(--surface2)",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
              🎙 Transcribing audio...
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
              {trans.progress || 0}%
            </span>
          </div>
          <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--border)", marginBottom: 14, overflow: "hidden" }}>
            {(trans.progress || 0) > 0 ? (
              <div style={{
                width: `${trans.progress}%`,
                height: "100%",
                borderRadius: 4,
                background: "var(--accent)",
                transition: "width 0.6s ease",
              }} />
            ) : (
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, var(--accent) 25%, #e8a882 50%, var(--accent) 75%)",
                backgroundSize: "200% auto",
                animation: "shimmer 1.5s linear infinite",
              }} />
            )}
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            This may take a few minutes depending on the length of the audio file.
          </p>
          {trans.duration_seconds > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
              <span>Audio length: {formatTime(trans.duration_seconds)}</span>
              {estimatedTime(trans.duration_seconds) && (
                <span>Estimated time: {estimatedTime(trans.duration_seconds)}</span>
              )}
            </div>
          )}
        </div>
      )}
      {trans.status === "error" && (
        <p style={{ color: "var(--danger-text)", fontSize: 14 }}>Error: {trans.full_text}</p>
      )}

      {/* Word-level transcript + mini-map */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {paragraphs.length > 0 ? (
            <div
              data-transcript-content
              onMouseUp={handleMouseUp}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "20px 24px",
                background: "var(--bg)",
                lineHeight: 2,
                fontSize,
                color: "var(--reader-text)",
              }}
            >
              {paragraphs.map((para, pIdx) => (
                <p key={pIdx} style={{ margin: 0, marginBottom: "1.2em" }}>
                  {para.map(({ word: w, globalIdx }) => {
                    const highlighted = isWordHighlighted(globalIdx, activeIdx, displayIdx, highlightMode, trans.words);
                    const dimmed = globalIdx < highestActiveRef.current && !highlighted;
                    const annId = annotationIdByIdx[globalIdx];
                    return (
                      <span
                        key={globalIdx}
                        ref={(el) => { wordRefs.current[globalIdx] = el; }}
                        data-word-index={globalIdx}
                        data-hl-id={annId || undefined}
                        onClick={(e) => handleWordClick(w, globalIdx, e)}
                        style={{
                          cursor: "pointer",
                          padding: "2px 1px",
                          borderRadius: 3,
                          background: highlighted
                            ? "var(--playback-highlight-bg)"
                            : searchResults[searchIdx] === globalIdx
                              ? "var(--status-done-text)"
                              : searchResults.includes(globalIdx)
                                ? "var(--status-done-bg)"
                                : annotationColorByIdx[globalIdx]
                                  ? ANN_COLOR_BG[annotationColorByIdx[globalIdx]]
                                  : "transparent",
                          color: highlighted
                            ? "var(--playback-highlight-text)"
                            : searchResults[searchIdx] === globalIdx
                              ? "var(--status-done-bg)"
                              : searchResults.includes(globalIdx)
                                ? "var(--status-done-text)"
                                : dimmed ? "var(--text-dim)" : "inherit",
                          outline: searchResults[searchIdx] === globalIdx ? "2px solid var(--status-done-text)" : "none",
                          transition: "background 0.1s",
                          textDecoration: annId ? "underline dotted" : "none",
                        }}
                      >
                        {w.word}{" "}
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>
          ) : trans.full_text ? (
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "20px 24px",
              background: "var(--bg)",
              lineHeight: 1.8,
              fontSize,
              color: "var(--reader-text)",
              whiteSpace: "pre-wrap",
            }}>
              {trans.full_text}
            </div>
          ) : null}
        </div>

        {/* Mini-map — thin overview bar */}
        {trans.words?.length > 0 && (
          <div
            ref={minimapRef}
            role="presentation"
            aria-label="Document mini-map"
            onClick={handleMinimapClick}
            style={{
              width: 16,
              flexShrink: 0,
              position: "sticky",
              top: 0,
              height: "100vh",
              background: "var(--border)",
              cursor: "pointer",
              overflow: "hidden",
              borderRadius: 4,
            }}
          >
            {/* Viewport indicator */}
            <div style={{
              position: "absolute",
              left: 0, right: 0,
              top: mmViewTop,
              height: mmViewH,
              background: "rgba(196,98,45,0.2)",
              border: "1px solid var(--accent)",
              boxSizing: "border-box",
              borderRadius: 2,
              pointerEvents: "none",
            }} />

            {/* Chapter markers */}
            {chapters.map((ch) => (
              <div
                key={ch.id}
                style={{
                  position: "absolute",
                  left: 0, right: 0,
                  top: getMinimapY(ch.word_index),
                  height: 3,
                  background: "var(--accent)",
                  opacity: 0.75,
                  pointerEvents: "none",
                }}
              />
            ))}

            {/* Annotation markers */}
            {annotations.map((ann) => {
              const pos = ann.position;
              if (pos?.start_word_index == null) return null;
              const annColors = { yellow: "#f5d842", green: "#4caf76", blue: "#4a90d9", pink: "#e87090" };
              return (
                <div
                  key={ann.id}
                  style={{
                    position: "absolute",
                    left: 0, right: 0,
                    top: getMinimapY(pos.start_word_index),
                    height: 2,
                    background: annColors[ann.color] || "#f5d842",
                    pointerEvents: "none",
                  }}
                />
              );
            })}

            {/* Playback position */}
            {activeIdx >= 0 && (
              <div style={{
                position: "absolute",
                left: 0, right: 0,
                top: getMinimapY(activeIdx),
                height: 2,
                background: "var(--accent)",
                boxShadow: "0 0 3px var(--accent)",
                zIndex: 2,
                pointerEvents: "none",
              }} />
            )}
          </div>
        )}
      </div>

      {/* Floating selection toolbar */}
      {showToolbar && selectionRange && (
        <div
          style={{
            position: "absolute",
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "#1f2937",
            borderRadius: 8,
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            whiteSpace: "nowrap",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              const text = trans.words
                .slice(selectionRange.start, selectionRange.end + 1)
                .map((w) => w.word)
                .join(" ");
              navigator.clipboard.writeText(text).catch(() => {});
              setShowToolbar(false);
              window.getSelection()?.removeAllRanges();
            }}
            style={{ background: "none", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", padding: "2px 6px" }}
          >
            Copy
          </button>
          <button
            onClick={() => {
              const text = trans.words
                .slice(selectionRange.start, selectionRange.end + 1)
                .map((w) => w.word)
                .join(" ");
              setNotePopup({ startIdx: selectionRange.start, endIdx: selectionRange.end, text, color: pendingColor });
              setShowToolbar(false);
              window.getSelection()?.removeAllRanges();
            }}
            style={{ background: "none", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", padding: "2px 6px" }}
          >
            Add Note
          </button>
          {["yellow", "green", "blue", "pink"].map((c) => {
            const colors = { yellow: "#f5d842", green: "#4caf76", blue: "#4a90d9", pink: "#e87090" };
            return (
              <button
                key={c}
                onClick={() => {
                  const text = trans.words
                    .slice(selectionRange.start, selectionRange.end + 1)
                    .map((w) => w.word)
                    .join(" ");
                  saveAnnotation({ startIdx: selectionRange.start, endIdx: selectionRange.end, text, color: c, note: null });
                  setShowToolbar(false);
                  window.getSelection()?.removeAllRanges();
                }}
                style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: colors[c],
                  border: pendingColor === c ? "2px solid #fff" : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
                title={c}
              />
            );
          })}
        </div>
      )}

      {/* Note popup */}
      {notePopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={() => setNotePopup(null)}
        >
          <div
            style={{
              background: "var(--bg)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              padding: "20px 24px",
              width: 360,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Note at {formatTime(trans.words[notePopup.startIdx]?.start ?? 0)}
            </div>
            <div style={{
              fontSize: 13, fontStyle: "italic", color: "var(--text-muted)",
              marginBottom: 12, lineHeight: 1.5,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              "{notePopup.text}"
            </div>
            <textarea
              autoFocus
              placeholder="Add a note…"
              rows={3}
              id="note-popup-textarea"
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                fontSize: 13, fontFamily: "'Outfit', sans-serif",
                border: "1.5px solid var(--border)", borderRadius: 6,
                padding: "6px 8px", background: "var(--bg)",
                color: "var(--text)", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setNotePopup(null)}
                style={{ fontSize: 13, padding: "5px 14px", cursor: "pointer", background: "none", border: "1.5px solid var(--border)", borderRadius: 6, color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const note = document.getElementById("note-popup-textarea")?.value?.trim() || null;
                  saveAnnotation({ startIdx: notePopup.startIdx, endIdx: notePopup.endIdx, text: notePopup.text, color: notePopup.color, note });
                  setNotePopup(null);
                }}
                style={{ fontSize: 13, padding: "5px 14px", cursor: "pointer", background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", fontWeight: 600 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share popup */}
      {sharePopup && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={() => setSharePopup(false)}
        >
          <div
            style={{
              background: "var(--bg)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              padding: "20px 24px",
              width: 380,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Share Transcript</h3>
            {shareLink ? (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                  Expires: {new Date(shareLink.expires_at).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <input
                    readOnly
                    value={window.location.origin + shareLink.share_url}
                    style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg)", color: "var(--text)" }}
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(window.location.origin + shareLink.share_url).catch(() => {})}
                    style={{ ...btnSecondary, fontSize: 12, padding: "0 10px", height: 32 }}
                  >
                    Copy link
                  </button>
                </div>
                <button
                  onClick={() => {
                    api.delete(`/transcriptions/${id}/share`)
                      .then(() => { setShareLink(null); setSharePopup(false); })
                      .catch(() => {});
                  }}
                  style={{ fontSize: 12, padding: "5px 12px", cursor: "pointer", background: "none", border: "1.5px solid var(--danger-border)", borderRadius: 6, color: "var(--danger-text)" }}
                >
                  Revoke link
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Create a shareable link (valid for 7 days). No login required to view.
                </p>
                <button
                  onClick={() => {
                    api.post(`/transcriptions/${id}/share`)
                      .then((r) => { setShareLink(r.data); })
                      .catch(() => {});
                  }}
                  style={{ ...btnSecondary, fontSize: 13 }}
                >
                  Generate link
                </button>
              </>
            )}
          </div>
        </div>
      )}

      </div>{/* end transcript padding */}
    </div>{/* end main content */}

    {/* Connector line SVG overlay */}
    {connectorPath && connectorPoints && (
      <svg
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 999, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <path
          d={connectorPath}
          stroke="var(--accent)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="4 3"
          opacity="0.6"
        />
        <circle cx={connectorPoints.x1} cy={connectorPoints.y1} r="3" fill="var(--accent)" opacity="0.6" />
        <circle cx={connectorPoints.x2} cy={connectorPoints.y2} r="3" fill="var(--accent)" opacity="0.6" />
      </svg>
    )}

    {/* Annotations sidebar */}
    <div style={{
      width: showAnnotations ? 280 : 0,
      overflow: "hidden",
      flexShrink: 0,
      transition: "width 0.2s ease",
      background: "var(--surface2)",
      borderLeft: showAnnotations ? "1px solid var(--border)" : "none",
      position: "sticky",
      top: 0,
      height: "100vh",
      overflowY: showAnnotations ? "auto" : "hidden",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Outfit', sans-serif",
    }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Annotations</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, background: "var(--accent)", color: "#fff", borderRadius: 20, padding: "2px 8px" }}>
              {annotations.length}
            </span>
            {/* Export dropdown */}
            <div style={{ position: "relative" }} ref={annExportMenuRef}>
              <button
                onClick={() => setShowAnnExportMenu((v) => !v)}
                title="Export annotations"
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", fontSize: 12, padding: "2px 7px", color: "var(--text)", lineHeight: 1.6 }}
              >
                ↓
              </button>
              {showAnnExportMenu && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                  minWidth: 168,
                }}>
                  {[
                    { label: "Markdown (.md)", action: exportAnnotationsMd },
                    { label: "CSV (.csv)", action: exportAnnotationsCsvFile },
                    { label: "JSON (.json)", action: exportAnnotationsJsonFile },
                    { label: annExportCopied ? "Copied!" : "Copy to clipboard", action: copyAnnotationsToClipboard },
                  ].map(({ label, action }, i) => (
                    <button
                      key={label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={action}
                      style={{
                        ...dropdownItem,
                        borderTop: i > 0 ? "1px solid var(--border)" : "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setShowAnnotations(false);
                setConnectorPath(null);
                setConnectorPoints(null);
                connectorIdRef.current = null;
              }}
              title="Close"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)", padding: "2px 4px", lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {annotations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)", fontSize: 13 }}>
              Select text to create annotations.
            </div>
          ) : (
            annotations
              .slice()
              .sort((a, b) => (a.position?.start_time ?? 0) - (b.position?.start_time ?? 0))
              .map((ann) => {
                const colors = { yellow: "#f5d842", green: "#4caf76", blue: "#4a90d9", pink: "#e87090" };
                return (
                  <div
                    key={ann.id}
                    data-hl-card={ann.id}
                    onClick={() => {
                      showConnectorAfterScroll(ann.id);
                    }}
                    style={{
                      background: "var(--surface3)",
                      border: "1.5px solid var(--border)",
                      borderLeft: `3px solid ${colors[ann.color] || "#f5d842"}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                      animation: flashingCardId === ann.id ? "cardPulse 1s ease" : "none",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                      Audio · {formatTime(ann.position?.start_time ?? 0)}
                    </div>
                    <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: ann.note ? 6 : 0,
                      display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      "{ann.text}"
                    </div>
                    {ann.note && (
                      <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5,
                        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {ann.note}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        api.delete(`/transcription-annotations/${ann.id}`)
                          .then(() => setAnnotations((prev) => prev.filter((a) => a.id !== ann.id)))
                          .catch(() => {});
                      }}
                      style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 11, padding: "2px 4px", marginTop: 4 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
          )}
        </div>
      </div>
  </div>
  );
}
