import { useEffect, useRef } from "react";
import { HIGHLIGHT_COLORS, COLOR_SOLID } from "../constants/highlight";

export default function SelectionToolbar({
  toolbar,      // { selRect, text, startOffset, endOffset, page, rects, posType }
  activeColor,
  onHighlight,  // (color) => void — saves highlight immediately, no note
  onAddNote,    // () => void — opens NotePopup
  onCopy,       // () => void
  onClose,
}) {
  const ref = useRef(null);

  // Two-pass positioning: render hidden at (0,0), measure, then place correctly
  useEffect(() => {
    if (!ref.current || !toolbar) return;
    const el  = ref.current;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;
    const r   = toolbar.selRect;

    // Horizontal: center on selection, clamp to viewport edges
    const centerX = r.left + r.width / 2;
    let left = Math.round(centerX - elW / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - elW - 8));

    // Vertical: below selection; flip above if it would clip the bottom edge
    const rawTop = r.bottom + 8;
    const top = rawTop + elH > window.innerHeight - 8
      ? Math.max(8, r.top - elH - 8)
      : rawTop;

    el.style.left       = left + "px";
    el.style.top        = top  + "px";
    el.style.visibility = "visible";
  }, [toolbar]);

  // Dismiss: outside mousedown or Escape key
  useEffect(() => {
    if (!toolbar) return;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown",   onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown",   onKeyDown);
    };
  }, [toolbar, onClose]);

  if (!toolbar) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 0, left: 0,
        visibility: "hidden",   // shown after positioning useEffect
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 8px",
        background: "var(--surface, #fffdf7)",
        border: "1.5px solid var(--border, #d8cfc0)",
        borderRadius: 10,
        boxShadow: "0 4px 24px rgba(44,36,22,0.18)",
        zIndex: 500,
        fontFamily: "'Outfit', sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      <button onClick={onCopy}    style={btnSty}>Copy</button>
      <Sep />
      <button onClick={onAddNote} style={btnSty}>Note</button>
      <Sep />

      {/* Highlight color dots */}
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          title={`Highlight ${color}`}
          onClick={() => onHighlight(color)}
          style={{
            width: 15,
            height: 15,
            borderRadius: "50%",
            background: COLOR_SOLID[color],
            border: activeColor === color
              ? "2px solid var(--text, #2c2416)"
              : "2px solid transparent",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 18, background: "var(--border, #d8cfc0)", margin: "0 2px", flexShrink: 0 }} />;
}

const btnSty = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "0.75rem",
  color: "var(--text, #2c2416)",
  padding: "2px 5px",
  borderRadius: 5,
  fontFamily: "'Outfit', sans-serif",
  lineHeight: 1.4,
};
