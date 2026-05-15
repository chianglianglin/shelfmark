import { useState, useEffect, useRef } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSource(h) {
  if (h.position?.type === "pdf_range") return "pdf";
  if (h.position?.type === "text_range" && h.position?.view === "text") return "text";
  return "epub";
}

function fmtDate(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return ""; }
}

function csvEscape(val) {
  const str = val === null || val === undefined ? "" : String(val);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function safeName(title) {
  return (title || "annotations").replace(/[/\\:*?"<>|]/g, "").trim() || "annotations";
}

// ── Formatters ────────────────────────────────────────────────────────────────

function buildMarkdown(highlights, docTitle) {
  const now = fmtDate(new Date().toISOString());
  const lines = [
    `# ${docTitle} — Annotations`,
    `Exported: ${now}`,
    `Total: ${highlights.length} annotations`,
    "",
    "---",
    "",
  ];

  const epub = highlights.filter((h) => getSource(h) === "epub");
  const text = highlights.filter((h) => getSource(h) === "text");
  const pdfByPage = {};
  highlights
    .filter((h) => getSource(h) === "pdf")
    .forEach((h) => {
      const p = h.position?.page ?? "?";
      (pdfByPage[p] = pdfByPage[p] || []).push(h);
    });

  function hlBlock(h) {
    const b = [`> ${h.text}`];
    if (h.note) b.push(`Note: ${h.note}`);
    b.push(`Color: ${h.color}`);
    if (h.created_at) b.push(`Added: ${fmtDate(h.created_at)}`);
    return b.join("\n");
  }

  function addSection(title, items) {
    if (!items.length) return;
    lines.push(`## ${title}`, "");
    items.forEach((h, i) => {
      lines.push(hlBlock(h), "");
      if (i < items.length - 1) lines.push("---", "");
    });
  }

  addSection("EPUB", epub);
  Object.keys(pdfByPage)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((p) => addSection(`PDF · p.${p}`, pdfByPage[p]));
  addSection("Text", text);

  return lines.join("\n");
}

function buildCSV(highlights) {
  const rows = [
    ["source", "page", "highlighted_text", "note", "color", "date_added"].join(","),
    ...highlights.map((h) =>
      [
        csvEscape(getSource(h)),
        csvEscape(h.position?.page ?? ""),
        csvEscape(h.text),
        csvEscape(h.note ?? ""),
        csvEscape(h.color),
        csvEscape(h.created_at ? new Date(h.created_at).toISOString() : ""),
      ].join(",")
    ),
  ];
  return rows.join("\n");
}

function buildJSON(highlights, docTitle) {
  return JSON.stringify(
    {
      book: docTitle,
      exported: new Date().toISOString(),
      total: highlights.length,
      annotations: highlights.map((h) => ({
        id: h.id,
        source: getSource(h),
        page: h.position?.page ?? null,
        text: h.text,
        note: h.note ?? null,
        color: h.color,
        created_at: h.created_at ?? null,
      })),
    },
    null,
    2
  );
}

// ── File save (File System Access API + fallback) ─────────────────────────────

async function saveFile(content, suggestedName, description, mimeType, ext) {
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled picker
      // fall through to blob fallback
    }
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Print ─────────────────────────────────────────────────────────────────────

function printAnnotations(highlights, docTitle) {
  const now = fmtDate(new Date().toISOString());

  function srcLabel(h) {
    const s = getSource(h);
    if (s === "pdf") return `PDF · p.${h.position?.page ?? "?"}`;
    if (s === "text") return "Text";
    return "EPUB";
  }

  function esc(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  const rows = highlights
    .map(
      (h) => `
      <div class="ann">
        <div class="src">${srcLabel(h)}</div>
        <blockquote>${esc(h.text)}</blockquote>
        ${h.note ? `<div class="note">${esc(h.note)}</div>` : ""}
        <div class="meta">Color: ${h.color}${h.created_at ? ` · Added: ${fmtDate(h.created_at)}` : ""}</div>
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${esc(docTitle)} — Annotations</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #2c2416; }
  h1 { font-size: 1.3rem; margin-bottom: 4px; }
  .header-meta { color: #8a7a65; font-size: .85rem; margin-bottom: 28px; }
  .ann { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #d8cfc0; }
  .src { font-size: .72rem; font-family: monospace; color: #8a7a65; margin-bottom: 5px; }
  blockquote { margin: 0 0 8px; padding-left: 12px; border-left: 3px solid #c4622d; font-style: italic; color: #4a3c28; }
  .note { font-size: .88rem; margin-bottom: 5px; }
  .meta { font-size: .72rem; color: #8a7a65; }
  @media print { body { margin: 20px; } }
</style>
</head><body>
<h1>${esc(docTitle)} — Annotations</h1>
<div class="header-meta">Exported: ${now} · Total: ${highlights.length} annotations</div>
${rows}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return; // popup blocked
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// ── Dropdown item ─────────────────────────────────────────────────────────────

function MenuItem({ onClick, children, divider }) {
  return (
    <button
      style={{
        display: "block",
        width: "100%",
        padding: "8px 14px",
        textAlign: "left",
        background: "none",
        border: "none",
        borderTop: divider ? "1px solid var(--border, #d8cfc0)" : "none",
        fontFamily: "'Outfit', sans-serif",
        fontSize: "0.82rem",
        color: "var(--text, #2c2416)",
        cursor: "pointer",
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2, #f0ebe0)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ── ExportMenu ────────────────────────────────────────────────────────────────

export default function ExportMenu({ highlights, docTitle }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  // Inject tooltip animation keyframes once
  useEffect(() => {
    if (!document.getElementById("export-tooltip-kf")) {
      const s = document.createElement("style");
      s.id = "export-tooltip-kf";
      s.textContent =
        "@keyframes exportTipIn{from{opacity:0;transform:translateX(-50%) translateY(-3px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";
      document.head.appendChild(s);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function close() { setOpen(false); }

  const name = safeName(docTitle);

  async function handleMarkdown() {
    close();
    await saveFile(
      buildMarkdown(highlights, docTitle),
      `${name}-annotations.md`,
      "Markdown",
      "text/markdown",
      ".md"
    );
  }

  async function handleCSV() {
    close();
    await saveFile(
      buildCSV(highlights),
      `${name}-annotations.csv`,
      "CSV",
      "text/csv",
      ".csv"
    );
  }

  async function handleJSON() {
    close();
    await saveFile(
      buildJSON(highlights, docTitle),
      `${name}-annotations.json`,
      "JSON",
      "application/json",
      ".json"
    );
  }

  function handlePDF() {
    close();
    printAnnotations(highlights, docTitle);
  }

  async function handleCopy() {
    close();
    try {
      await navigator.clipboard.writeText(buildMarkdown(highlights, docTitle));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* non-fatal */ }
  }

  return (
    <>
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => {
          if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const tooltipWidth = 200;
            const arrowX = r.left + r.width / 2;
            let x = arrowX;
            if (x + tooltipWidth / 2 > window.innerWidth - 12) {
              x = window.innerWidth - tooltipWidth / 2 - 12;
            }
            setTooltipPos({ x, y: r.bottom + 8, arrowX });
          }
          setHovered(true);
        }}
        onMouseLeave={() => { setHovered(false); setTooltipPos(null); }}
        style={{
          background: "none",
          border: "1.5px solid var(--border, #d8cfc0)",
          borderRadius: 6,
          padding: "2px 7px",
          fontFamily: "'Outfit', sans-serif",
          fontSize: "0.78rem",
          color: copied ? "var(--accent, #c4622d)" : "var(--text-muted, #8a7a65)",
          cursor: "pointer",
          lineHeight: 1.4,
          transition: "color 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copied!" : "↓"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--surface, #fffdf7)",
            border: "1.5px solid var(--border, #d8cfc0)",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(44,36,22,0.12)",
            zIndex: 200,
            minWidth: 170,
            overflow: "hidden",
          }}
        >
          <MenuItem onClick={handleMarkdown}>Markdown (.md)</MenuItem>
          <MenuItem onClick={handleCSV}>CSV (.csv)</MenuItem>
          <MenuItem onClick={handlePDF}>PDF</MenuItem>
          <MenuItem onClick={handleJSON}>JSON (.json)</MenuItem>
          <MenuItem onClick={handleCopy} divider>Copy to clipboard</MenuItem>
        </div>
      )}
    </div>

    {hovered && !open && tooltipPos && (
      <div
        style={{
          position: "fixed",
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: "translateX(-50%)",
          background: "var(--text, #2c2416)",
          color: "white",
          borderRadius: 8,
          padding: "10px 14px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: 999,
          pointerEvents: "none",
          animation: "exportTipIn 0.12s ease 0.4s both",
          whiteSpace: "nowrap",
        }}
      >
        {/* Up arrow */}
        <div style={{
          position: "absolute",
          top: -6,
          left: `calc(${tooltipPos.arrowX - tooltipPos.x}px + 50%)`,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderBottom: "6px solid var(--text, #2c2416)",
        }} />
        <div style={{ fontSize: "0.82rem", fontFamily: "'Outfit', sans-serif", marginBottom: 5 }}>
          Export annotations
        </div>
        <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontFamily: "'Outfit', sans-serif" }}>
          Markdown · CSV · PDF · JSON
          <br />
          Copy to clipboard
        </div>
      </div>
    )}
    </>
  );
}
