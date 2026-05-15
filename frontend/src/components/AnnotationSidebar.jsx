import { useState, useEffect } from "react";
import { COLOR_SOLID } from "../constants/highlight";
import ExportMenu from "./ExportMenu";

const SOURCE_TABS = [
  { id: "all",  label: "All" },
  { id: "epub", label: "EPUB" },
  { id: "pdf",  label: "PDF" },
  { id: "text", label: "Text" },
];

function matchesSource(h, source) {
  if (source === "all")  return true;
  if (source === "pdf")  return h.position?.type === "pdf_range";
  if (source === "epub") return h.position?.type === "text_range" && (h.position?.view === "epub" || !h.position?.view);
  if (source === "text") return h.position?.type === "text_range" && h.position?.view === "text";
  return true;
}

function getSourceId(h) {
  if (h.position?.type === "pdf_range") return "pdf";
  if (h.position?.type === "text_range" && h.position?.view === "text") return "text";
  return "epub";
}

export default function AnnotationSidebar({ highlights, docTitle = "", onDelete, onJumpTo, onEdit, focusRequest, onFocusComplete, width = 300, visibleHlIds = new Set() }) {
  const [tab, setTab] = useState("all");
  const [source, setSource] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [flashingId, setFlashingId] = useState(null);

  // Focus a card: switch tab/source, scroll into view, flash, then signal connector draw
  useEffect(() => {
    if (!focusRequest) return;
    const hl = highlights.find((h) => h.id === focusRequest.id);
    if (!hl) return;
    setTab(hl.note && hl.note.trim() ? "notes" : "highlights");
    if (focusRequest.forceSource) {
      // Post-save: always switch to the exact source so the user sees where the card landed
      setSource(getSourceId(hl));
    } else if (!matchesSource(hl, source)) {
      // Highlight click: only widen to "all" if current filter would hide the card
      setSource("all");
    }
    setTimeout(() => {
      document.querySelector(`[data-hl-card="${focusRequest.id}"]`)
        ?.scrollIntoView({ behavior: "instant", block: "center" });
      setFlashingId(focusRequest.id);
      setTimeout(() => setFlashingId(null), 1100);
      onFocusComplete?.(focusRequest.id);
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.seq]);

  const filtered = highlights.filter((h) => {
    if (!matchesSource(h, source)) return false;
    if (tab === "notes")      return h.note && h.note.trim();
    if (tab === "highlights") return !h.note || !h.note.trim();
    return true;
  });

  // Narrow to whichever top-tab is active before counting by source
  const tabSubset = highlights.filter(h => {
    if (tab === "notes")      return h.note && h.note.trim();
    if (tab === "highlights") return !h.note || !h.note.trim();
    return true;
  });

  const counts = SOURCE_TABS.reduce((acc, s) => {
    acc[s.id] = s.id === "all" ? tabSubset.length : tabSubset.filter(h => matchesSource(h, s.id)).length;
    return acc;
  }, {});

  const notesCount         = highlights.filter(h =>  h.note && h.note.trim()).length;
  const highlightOnlyCount = highlights.filter(h => !h.note || !h.note.trim()).length;

  // Sort filtered list by DOM position so card order matches reading order
  const domIds = Array.from(
    new Set(Array.from(document.querySelectorAll('[data-hl-id]')).map((el) => el.dataset.hlId))
  );
  const sortedFiltered = [...filtered].sort((a, b) => {
    const ai = domIds.indexOf(a.id);
    const bi = domIds.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <>
    <style>{`
      @keyframes hl-card-flash {
        0%   { box-shadow: 0 0 0 2px var(--flash-color), 0 0 14px var(--flash-color); }
        40%  { box-shadow: 0 0 0 2px var(--flash-color), 0 0 8px var(--flash-color); }
        100% { box-shadow: none; }
      }
    `}</style>
    <div style={{
      width,
      minWidth: 160,
      background: "var(--surface)",
      borderLeft: "1.5px solid var(--border, #d8cfc0)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 10px",
        borderBottom: "1.5px solid var(--border, #d8cfc0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <h3 style={{ fontFamily: "'Lora', serif", fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
          Annotations
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ExportMenu highlights={highlights} docTitle={docTitle} />
          <span style={{
            fontSize: "0.75rem",
            background: "var(--accent, #c4622d)",
            color: "white",
            borderRadius: 20,
            padding: "2px 8px",
            fontFamily: "'DM Mono', monospace",
          }}>
            {highlights.length}
          </span>
        </div>
      </div>

      {/* Type tabs: All / Notes / Highlights */}
      <div style={{ display: "flex", borderBottom: "1.5px solid var(--border, #d8cfc0)" }}>
        {[
          { id: "all",        label: "All",        badge: highlights.length },
          { id: "notes",      label: "Notes",      badge: notesCount },
          { id: "highlights", label: "Highlights", badge: highlightOnlyCount },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "8px 4px",
              textAlign: "center",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: "pointer",
              background: "none",
              border: "none",
              borderBottom: tab === t.id ? "2.5px solid var(--accent, #c4622d)" : "2.5px solid transparent",
              color: tab === t.id ? "var(--accent, #c4622d)" : "var(--text-muted, #8a7a65)",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{
                fontSize: "0.62rem",
                background: tab === t.id ? "var(--accent, #c4622d)" : "var(--border, #d8cfc0)",
                color: tab === t.id ? "white" : "var(--text-muted, #8a7a65)",
                borderRadius: 99,
                padding: "0px 5px",
                fontFamily: "'DM Mono', monospace",
                transition: "all 0.15s",
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Source tabs: All / EPUB / PDF / Text */}
      <div style={{ display: "flex", borderBottom: "1.5px solid var(--border)", background: "var(--surface2)" }}>
        {SOURCE_TABS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            style={{
              flex: 1,
              padding: "5px 4px",
              textAlign: "center",
              fontSize: "0.72rem",
              fontWeight: 500,
              cursor: "pointer",
              background: "none",
              border: "none",
              borderBottom: source === s.id ? "2px solid var(--accent, #c4622d)" : "2px solid transparent",
              color: source === s.id ? "var(--accent, #c4622d)" : "var(--text-muted, #8a7a65)",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
            }}
          >
            {s.label}
            {counts[s.id] > 0 && (
              <span style={{
                fontSize: "0.62rem",
                background: source === s.id ? "var(--accent, #c4622d)" : "var(--border, #d8cfc0)",
                color: source === s.id ? "white" : "var(--text-muted, #8a7a65)",
                borderRadius: 99,
                padding: "0px 5px",
                fontFamily: "'DM Mono', monospace",
                transition: "all 0.15s",
              }}>
                {counts[s.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedFiltered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted, #8a7a65)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🖊️</div>
            <p style={{ fontSize: "0.84rem", lineHeight: 1.6 }}>Select text to add highlights and notes.</p>
          </div>
        ) : (
          sortedFiltered.map((hl) => (
            <div
              key={hl.id}
              data-hl-card={hl.id}
              onClick={() => onJumpTo(hl)}
              style={{
                background: "var(--surface2)",
                border: "1.5px solid var(--border)",
                borderLeft: visibleHlIds.has(hl.id)
                  ? `3px solid ${COLOR_SOLID[hl.color]}`
                  : "1.5px solid var(--border)",
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
                "--flash-color": COLOR_SOLID[hl.color],
                animation: flashingId === hl.id ? "hl-card-flash 1s ease forwards" : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: COLOR_SOLID[hl.color], display: "inline-block" }} />
                  <span style={{ fontSize: "0.72rem", fontFamily: "'DM Mono', monospace", color: "var(--text-muted, #8a7a65)" }}>
                    {hl.position?.type === "pdf_range"
                      ? `PDF · p.${hl.position.page}`
                      : hl.position?.view === "text"
                        ? "Text"
                        : "EPUB"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    title="Edit note"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(hl.id);
                      setEditText(hl.note || "");
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #8a7a65)", fontSize: "0.75rem", padding: "2px 4px" }}
                  >
                    ✏️
                  </button>
                  <button
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(hl.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #8a7a65)", fontSize: "0.75rem", padding: "2px 4px" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={{
                fontSize: "0.78rem",
                color: "var(--text-muted, #8a7a65)",
                fontStyle: "italic",
                marginBottom: hl.note || editingId === hl.id ? 6 : 0,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                <span>{hl.text}</span>
              </div>
              {editingId === hl.id ? (
                <div onClick={(e) => e.stopPropagation()} style={{ borderTop: "1px solid var(--border, #d8cfc0)", paddingTop: 6, marginTop: 4 }}>
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Add a note…"
                    rows={3}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      fontSize: "0.82rem",
                      fontFamily: "'Outfit', sans-serif",
                      color: "var(--text, #2c2416)",
                      background: "var(--surface)",
                      border: "1.5px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setEditingId(null); setEditText(""); }}
                      style={{ fontSize: "0.75rem", padding: "3px 10px", cursor: "pointer", background: "none", border: "1.5px solid var(--border, #d8cfc0)", borderRadius: 5, color: "var(--text-muted, #8a7a65)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { onEdit(hl.id, editText.trim()); setEditingId(null); setEditText(""); }}
                      style={{ fontSize: "0.75rem", padding: "3px 10px", cursor: "pointer", background: "var(--accent, #c4622d)", border: "none", borderRadius: 5, color: "#fff", fontWeight: 600 }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : hl.note ? (
                <div style={{ fontSize: "0.82rem", color: "var(--text, #2c2416)", lineHeight: 1.5, borderTop: "1px solid var(--border, #d8cfc0)", paddingTop: 6, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {hl.note}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
}
