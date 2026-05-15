import { useState, useEffect, useRef } from "react";
import { HIGHLIGHT_COLORS, COLOR_SOLID } from "../constants/highlight";

const POPUP_WIDTH = 280;

function draftKey(docId) {
  return `draft_note_${docId}_new`;
}

function loadDraft(docId) {
  try {
    const raw = localStorage.getItem(draftKey(docId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveDraft(docId, text, color) {
  try {
    localStorage.setItem(draftKey(docId), JSON.stringify({
      text,
      color,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* ignore storage errors */ }
}

function clearDraft(docId) {
  localStorage.removeItem(draftKey(docId));
}

export default function NotePopup({ visible, selectionRect, selectedText, activeColor, onSave, onClose, markOffscreen, onScrollBack, docId }) {
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState(activeColor);
  const [showCancelWarning, setShowCancelWarning] = useState(false);
  const popupRef = useRef(null);
  const textareaRef = useRef(null);
  const [popupHeight, setPopupHeight] = useState(260);
  const draftTimerRef = useRef(null);

  useEffect(() => { setSelectedColor(activeColor); }, [activeColor]);

  useEffect(() => {
    if (visible && popupRef.current) {
      setPopupHeight(popupRef.current.offsetHeight);
    }
  }, [visible, selectedText, markOffscreen]);

  // On open: load draft if available, otherwise start fresh
  useEffect(() => {
    if (!visible) return;
    setShowCancelWarning(false);
    const draft = loadDraft(docId);
    if (draft) {
      if (draft.text !== undefined) setNote(draft.text);
      if (draft.color)              setSelectedColor(draft.color);
    } else {
      setNote("");
      setSelectedColor(activeColor);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced draft save while panel is open
  useEffect(() => {
    if (!visible) return;
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(docId, note, selectedColor), 500);
    return () => clearTimeout(draftTimerRef.current);
  }, [note, selectedColor, visible]);

  if (!visible || !selectionRect) return null;

  function handleSave(noteText) {
    clearTimeout(draftTimerRef.current);
    clearDraft(docId);
    onSave(selectedColor, noteText);
    setNote("");
    setSelectedColor(activeColor);
  }

  function handleCancelClick() {
    if (!note.trim()) {
      onClose();
      return;
    }
    setShowCancelWarning(true);
  }

  function handleDiscard() {
    setNote("");
    setSelectedColor(activeColor);
    setShowCancelWarning(false);
    onClose();
  }

  function handleKeepEditing() {
    setShowCancelWarning(false);
    textareaRef.current?.focus();
  }

  const selMidY = selectionRect.top + (selectionRect.height ?? 0) / 2;
  const rawTop = selMidY - popupHeight / 2;
  const popupTop = Math.max(8, Math.min(rawTop, window.innerHeight - popupHeight - 8));
  const popupLeft = window.innerWidth - POPUP_WIDTH - 16;
  const popupMidY = popupTop + popupHeight / 2;

  const lineX1 = selectionRect.right + 4;
  const lineY1 = selMidY;
  const lineX2 = popupLeft - 4;
  const lineY2 = popupMidY;
  const cx1 = lineX1 + (lineX2 - lineX1) * 0.5;
  const cy1 = lineY1;
  const cx2 = lineX1 + (lineX2 - lineX1) * 0.5;
  const cy2 = lineY2;

  const svgLeft = Math.min(lineX1, lineX2) - 2;
  const svgTop  = Math.min(lineY1, lineY2) - 2;
  const svgW    = Math.abs(lineX2 - lineX1) + 8;
  const svgH    = Math.abs(lineY2 - lineY1) + 8;

  const px1  = lineX1 - svgLeft;
  const py1  = lineY1 - svgTop;
  const px2  = lineX2 - svgLeft;
  const py2  = lineY2 - svgTop;
  const pcx1 = cx1 - svgLeft;
  const pcy1 = cy1 - svgTop;
  const pcx2 = cx2 - svgLeft;
  const pcy2 = cy2 - svgTop;

  return (
    <>
      {/* Connecting line SVG — hidden when temp mark has scrolled off screen */}
      {!markOffscreen && <svg
        style={{
          position: "fixed",
          left: svgLeft,
          top: svgTop,
          width: svgW,
          height: svgH,
          pointerEvents: "none",
          zIndex: 999,
          overflow: "visible",
        }}
      >
        <path
          d={`M ${px1} ${py1} C ${pcx1} ${pcy1}, ${pcx2} ${pcy2}, ${px2} ${py2}`}
          fill="none"
          stroke="var(--accent, #c4622d)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.6"
        />
        <circle cx={px1} cy={py1} r="3" fill="var(--accent, #c4622d)" opacity="0.7" />
      </svg>}

      {/* Popup */}
      <div
        ref={popupRef}
        style={{
          position: "fixed",
          top: popupTop,
          left: popupLeft,
          width: POPUP_WIDTH,
          background: "var(--surface, #fffdf7)",
          border: "1.5px solid var(--border, #d8cfc0)",
          borderRadius: 14,
          boxShadow: "0 8px 40px rgba(44,36,22,0.18)",
          padding: 16,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontFamily: "'Outfit', sans-serif",
        }}
      >
        <h4 style={{ fontFamily: "'Lora', serif", fontSize: "0.9rem", color: "var(--accent, #c4622d)", margin: 0 }}>
          Add a Note
        </h4>
        {markOffscreen && (
          <button
            onClick={onScrollBack}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 12px",
              borderRadius: 99,
              background: "var(--accent, #c4622d)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 500,
              alignSelf: "center",
            }}
          >
            {markOffscreen === "above" ? "↑" : "↓"} Back to highlight
          </button>
        )}
        <div style={{
          fontSize: "0.78rem",
          color: "var(--text-muted, #8a7a65)",
          fontStyle: "italic",
          background: "var(--surface2, #f0ebe0)",
          borderRadius: 6,
          padding: "6px 8px",
          maxHeight: 60,
          overflow: "hidden",
          lineHeight: 1.5,
        }}>
          {selectedText}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => setSelectedColor(color)}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: COLOR_SOLID[color],
                border: selectedColor === color ? "2.5px solid var(--text, #2c2416)" : "2.5px solid transparent",
                cursor: "pointer",
                transform: selectedColor === color ? "scale(1.15)" : "scale(1)",
                transition: "all 0.15s",
              }}
            />
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type your note here..."
          style={{
            width: "100%",
            minHeight: 80,
            border: "1.5px solid var(--border, #d8cfc0)",
            borderRadius: 8,
            padding: 8,
            fontFamily: "'Outfit', sans-serif",
            fontSize: "0.84rem",
            background: "var(--surface2, #f0ebe0)",
            color: "var(--text, #2c2416)",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {showCancelWarning ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted, #8a7a65)" }}>
              You have unsaved changes
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={handleDiscard} style={secondaryBtn}>Discard</button>
              <button onClick={handleKeepEditing} style={primaryBtn}>Keep editing</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={handleCancelClick} style={secondaryBtn}>Cancel</button>
            <button onClick={() => handleSave("")} style={secondaryBtn}>Highlight Only</button>
            <button onClick={() => handleSave(note)} style={primaryBtn}>Save Note</button>
          </div>
        )}
      </div>
    </>
  );
}

const base = {
  padding: "6px 14px",
  borderRadius: 7,
  fontFamily: "'Outfit', sans-serif",
  fontSize: "0.8rem",
  fontWeight: 500,
  cursor: "pointer",
  border: "1.5px solid var(--border, #d8cfc0)",
  transition: "all 0.15s",
};
const secondaryBtn = { ...base, background: "var(--surface2, #f0ebe0)", color: "var(--text, #2c2416)" };
const primaryBtn   = { ...base, background: "var(--accent, #c4622d)", color: "white", borderColor: "var(--accent, #c4622d)" };
