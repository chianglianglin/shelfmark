import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

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

export default function SharedTranscription() {
  const { token } = useParams();
  const audioRef = useRef(null);
  const wordRefs = useRef({});

  const [trans, setTrans] = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const BASE = "/api";
    Promise.all([
      axios.get(`${BASE}/transcriptions/shared/${token}`),
      axios.get(`${BASE}/transcriptions/shared/${token}/audio`, { responseType: "blob" }),
    ])
      .then(([metaResp, audioResp]) => {
        setTrans(metaResp.data);
        setAudioSrc(URL.createObjectURL(audioResp.data));
      })
      .catch((err) => {
        setError(err?.response?.status === 404 ? "not found" : "error");
      })
      .finally(() => setLoading(false));

    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIdx = trans?.words
    ? trans.words.findIndex((w) => currentTime >= w.start && currentTime < w.end)
    : -1;

  const progress = trans?.duration_seconds ? (currentTime / trans.duration_seconds) * 100 : 0;
  const paragraphs = trans?.words ? buildParagraphs(trans.words) : [];

  const activeChapterId = (() => {
    if (!trans?.chapters?.length) return null;
    let active = trans.chapters[0].id;
    for (const ch of trans.chapters) {
      if (currentTime >= ch.start_time) active = ch.id;
      else break;
    }
    return active;
  })();

  function seekTo(start) {
    if (audioRef.current) {
      audioRef.current.currentTime = start;
      audioRef.current.play().catch(() => {});
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "#9ca3af" }}>Loading…</p>
      </div>
    );
  }

  if (error || !trans) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 8 }}>
          {error === "not found" ? "Link not found or expired" : "Something went wrong"}
        </h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>
          {error === "not found"
            ? "This shared link may have expired or been revoked."
            : "Could not load the shared transcript."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      {/* Chapters sidebar */}
      {trans.chapters?.length > 0 && (
        <div style={{
          width: 180, minWidth: 180, position: "sticky", top: 0, height: "100vh",
          overflowY: "auto", background: "#f9fafb", borderRight: "1px solid #e5e7eb",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "12px 12px 8px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e5e7eb" }}>Chapters</div>
          {trans.chapters.map((ch) => (
            <div
              key={ch.id}
              onClick={() => seekTo(ch.start_time)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                borderLeft: ch.id === activeChapterId ? "3px solid #c4622d" : "3px solid transparent",
                background: ch.id === activeChapterId ? "#f0ebe0" : "transparent",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: ch.id === activeChapterId ? 600 : 400 }}>{ch.title}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "'DM Mono', monospace" }}>{formatTime(ch.start_time)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {/* Expires banner */}
        {trans.share_expires_at && (
          <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
            Shared transcript — expires {new Date(trans.share_expires_at).toLocaleDateString()}
          </div>
        )}

        <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 600, color: "#111827" }}>
          {trans.title}
        </h1>

        {/* Audio player */}
        {audioSrc && (
          <div style={{
            position: "sticky", top: 0, zIndex: 10,
            background: "#faf8f3", padding: "12px 0 8px",
            borderBottom: "1px solid #e5e0d8",
          }}>
            <audio
              ref={audioRef}
              src={audioSrc}
              controls
              onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
              style={{ width: "100%", display: "block" }}
            />
            <div style={{ position: "relative", height: 4, background: "#e5e0d8", marginTop: 6, borderRadius: 2 }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#c4622d", transition: "width 0.1s linear", borderRadius: 2 }} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }} />

        {/* Transcript */}
        {paragraphs.length > 0 ? (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px", background: "#fff", lineHeight: 2, fontSize: 16, color: "#111827" }}>
            {paragraphs.map((para, pIdx) => (
              <p key={pIdx} style={{ margin: 0, marginBottom: "1.2em" }}>
                {para.map(({ word: w, globalIdx }) => {
                  const highlighted = activeIdx >= 0 && globalIdx === activeIdx;
                  return (
                    <span
                      key={globalIdx}
                      ref={(el) => { wordRefs.current[globalIdx] = el; }}
                      onClick={() => seekTo(w.start)}
                      style={{
                        cursor: "pointer",
                        padding: "2px 1px",
                        borderRadius: 3,
                        background: highlighted ? "#fef9c3" : "transparent",
                        color: highlighted ? "#78350f" : "inherit",
                        transition: "background 0.1s",
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
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px", background: "#fff", lineHeight: 1.8, fontSize: 16, color: "#111827", whiteSpace: "pre-wrap" }}>
            {trans.full_text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
