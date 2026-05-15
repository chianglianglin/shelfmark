import { useContext, useState, useEffect, useRef } from "react";
import { ThemeContext } from "../App";

const THEMES = [
  { key: "light",         icon: "☀️",  label: "Light" },
  { key: "dark",          icon: "🌙",  label: "Dark" },
  { key: "sepia",         icon: "📖",  label: "Sepia" },
  { key: "high-contrast", icon: "◐",   label: "High Contrast" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);

  const current = THEMES.find((t) => t.key === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 34,
          padding: "0 10px",
          borderRadius: 6,
          fontSize: 14,
          cursor: "pointer",
          border: "1px solid var(--border, #d8cfc0)",
          background: "transparent",
          color: "var(--text, #2c2416)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        aria-label="Toggle theme"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current.icon} <span style={{ fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 1000,
            background: "var(--bg, #faf8f3)",
            border: "1px solid var(--border, #d8cfc0)",
            borderRadius: 8,
            padding: "4px 0",
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          {THEMES.map((t) => {
            const isActive = theme === t.key;
            const isHovered = hovered === t.key;
            return (
              <button
                key={t.key}
                role="option"
                aria-selected={isActive}
                onClick={() => { setTheme(t.key); setOpen(false); }}
                onMouseEnter={() => setHovered(t.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 16px",
                  background: isHovered ? "var(--surface2, #f0ebe0)" : "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--accent, #c4622d)" : "var(--text, #2c2416)",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                {t.icon} <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
