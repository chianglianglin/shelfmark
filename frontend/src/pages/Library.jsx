import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import ThemeToggle from "../components/ThemeToggle";

const btnBase = {
  height: 34,
  padding: "0 14px",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid",
  lineHeight: 1,
  whiteSpace: "nowrap",
};
const btnSecondary = { ...btnBase, background: "transparent", color: "var(--text)", borderColor: "var(--border)" };
const toolCardBase = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "14px 16px",
  background: "var(--bg)",
  flex: 1,
  minWidth: 0,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const STATUS_BADGE = {
  unread:     { bg: "var(--status-unread-bg)",     color: "var(--status-unread-text)",     border: "var(--status-unread-border)" },
  reading:    { bg: "var(--status-reading-bg)",    color: "var(--status-reading-text)",    border: "var(--status-reading-border)" },
  finished:   { bg: "var(--status-finished-bg)",   color: "var(--status-finished-text)",   border: "var(--status-finished-border)" },
  processing: { bg: "var(--status-processing-bg)", color: "var(--status-processing-text)", border: "var(--status-processing-border)" },
  error:      { bg: "var(--status-error-bg)",      color: "var(--status-error-text)",      border: "var(--status-error-border)" },
};

export default function Library() {
  const [documents, setDocuments] = useState([]);
  const [hoveredTool, setHoveredTool] = useState(null);
  const [hoveredDoc, setHoveredDoc] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/documents").then((r) => setDocuments(r.data)).catch(() => {});
  }, []);

  function toolCardStyle(key) {
    const hovered = hoveredTool === key;
    return {
      ...toolCardBase,
      border: hovered ? "1.5px solid var(--accent)" : "1px solid var(--border)",
      boxShadow: hovered ? "0 4px 16px var(--accent-bg)" : "none",
      transform: hovered ? "translateY(-2px)" : "translateY(0)",
    };
  }

  return (
    <div style={{ padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text)" }}>Library</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <button onClick={() => navigate("/settings")} style={btnSecondary}>Settings</button>
        </div>
      </div>

      {/* TOOLS */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Tools
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <div
            data-tool="reader"
            style={toolCardStyle("reader")}
            onClick={() => navigate("/library/reader")}
            onMouseEnter={() => setHoveredTool("reader")}
            onMouseLeave={() => setHoveredTool(null)}
          >
            <strong style={{ fontSize: 14, color: "var(--text)", display: "block", marginBottom: 4 }}>
              Document Reader
            </strong>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Read PDF and EPUB files</span>
          </div>
          <div
            data-tool="transcription"
            style={toolCardStyle("transcription")}
            onClick={() => navigate("/transcriptions")}
            onMouseEnter={() => setHoveredTool("transcription")}
            onMouseLeave={() => setHoveredTool(null)}
          >
            <strong style={{ fontSize: 14, color: "var(--text)", display: "block", marginBottom: 4 }}>
              AI Transcription
            </strong>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Transcribe audio and video files</span>
          </div>
        </div>
      </div>

      {/* RECENT PROJECTS */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Recent Projects
        </p>
        {documents.slice(0, 5).map((doc) => {
          const hovered = hoveredDoc === doc.id;
          return (
            <div
              key={doc.id}
              onClick={() => navigate(`/read/${doc.id}`)}
              onMouseEnter={() => setHoveredDoc(doc.id)}
              onMouseLeave={() => setHoveredDoc(null)}
              style={{
                border: "1px solid var(--border)",
                borderLeft: hovered ? "3px solid var(--accent, #c4622d)" : "3px solid transparent",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 10,
                cursor: "pointer",
                background: "var(--bg)",
                boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.10)" : "none",
                transform: hovered ? "translateY(-3px)" : "translateY(0)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <strong style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 15,
                  color: "var(--text)",
                }}>
                  {doc.title || "Untitled"}
                </strong>
                <span style={{
                  background: STATUS_BADGE[doc.status]?.bg ?? "var(--surface2)",
                  color: STATUS_BADGE[doc.status]?.color ?? "var(--text)",
                  border: `1px solid ${STATUS_BADGE[doc.status]?.border ?? "var(--border)"}`,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}>
                  {doc.status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                {doc.type} · {doc.saved_at ? new Date(doc.saved_at).toLocaleDateString() : ""}
                {doc.word_count ? ` · ${Math.ceil(doc.word_count / 200)} min read` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
