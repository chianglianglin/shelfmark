import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import ThemeToggle from "../components/ThemeToggle";

const STATUS_BADGE = {
  done:       { bg: "var(--status-done-bg)",       color: "var(--status-done-text)",       border: "var(--status-done-border)" },
  processing: { bg: "var(--status-processing-bg)", color: "var(--status-processing-text)", border: "var(--status-processing-border)" },
  error:      { bg: "var(--status-error-bg)",      color: "var(--status-error-text)",      border: "var(--status-error-border)" },
};

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
const btnPrimary    = { ...btnBase, background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)" };
const btnSecondary  = { ...btnBase, background: "transparent", color: "var(--text)", borderColor: "var(--border)" };
const btnDestructive = { ...btnBase, background: "transparent", color: "var(--danger-text)", borderColor: "var(--danger-border)", height: 28, padding: "0 8px", fontSize: 13 };

function formatDuration(secs) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Shared folder sidebar ─────────────────────────────────────────────────────
const sidebarStyle = {
  width: 220,
  minWidth: 220,
  background: "var(--surface2, #f0ebe0)",
  borderRight: "1px solid var(--border, #d8cfc0)",
  display: "flex",
  flexDirection: "column",
  fontFamily: "'Outfit', sans-serif",
  minHeight: "100vh",
};

function FolderSidebar({
  folders,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  allLabel,
  allCount,
}) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const newInputRef = useRef(null);

  function handleNewFolder() {
    setShowNewInput(true);
    setNewName("");
    setTimeout(() => newInputRef.current?.focus(), 30);
  }

  function commitNew() {
    const name = newName.trim();
    if (name) onCreate(name);
    setShowNewInput(false);
    setNewName("");
  }

  function startRename(folder) {
    setRenamingId(folder.id);
    setRenameDraft(folder.name);
  }

  function commitRename(id) {
    const name = renameDraft.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  }

  return (
    <div style={sidebarStyle}>
      <div style={{ padding: "20px 14px 8px", borderBottom: "1px solid var(--border, #d8cfc0)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #8a7a65)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Folders
        </div>
        <button
          onClick={() => onSelect(null)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "6px 10px", borderRadius: 6, cursor: "pointer",
            border: "none", fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 500,
            background: activeFolderId === null ? "var(--surface3, #e8e0d0)" : "transparent",
            borderLeft: activeFolderId === null ? "3px solid var(--accent, #c4622d)" : "3px solid transparent",
            color: "var(--text, #2c2416)",
            transition: "all 0.15s ease",
            textAlign: "left",
          }}
        >
          <span>📂 {allLabel}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted, #8a7a65)", background: "var(--border, #d8cfc0)", borderRadius: 999, padding: "1px 6px" }}>
            {allCount}
          </span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {folders.map((folder) => (
          <div
            key={folder.id}
            onMouseEnter={() => setHoverId(folder.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{ position: "relative" }}
          >
            {renamingId === folder.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(folder.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => commitRename(folder.id)}
                style={{
                  width: "calc(100% - 20px)", margin: "2px 10px", padding: "4px 8px",
                  fontSize: 13, border: "1px solid var(--border, #d8cfc0)", borderRadius: 5,
                  fontFamily: "'Outfit', sans-serif", background: "var(--bg)",
                  boxSizing: "border-box",
                }}
              />
            ) : deletingId === folder.id ? (
              <div style={{ padding: "6px 10px", background: "var(--danger-bg)", borderLeft: "3px solid var(--danger-border)", margin: "2px 0" }}>
                <div style={{ fontSize: 12, color: "var(--danger-text)", marginBottom: 6 }}>Delete folder?</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Transcriptions inside will not be deleted.</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { onDelete(folder.id); setDeletingId(null); }}
                    style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, cursor: "pointer", background: "var(--danger-text)", color: "var(--bg)", border: "none" }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, cursor: "pointer", background: "none", border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onSelect(folder.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "6px 10px", cursor: "pointer",
                  border: "none", fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 400,
                  background: activeFolderId === folder.id ? "var(--surface3, #e8e0d0)" : "transparent",
                  borderLeft: activeFolderId === folder.id ? "3px solid var(--accent, #c4622d)" : "3px solid transparent",
                  color: "var(--text, #2c2416)",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                  gap: 4,
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📁 {folder.name}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted, #8a7a65)", background: "var(--border, #d8cfc0)", borderRadius: 999, padding: "1px 6px", flexShrink: 0 }}>
                  {folder.count}
                </span>
                {hoverId === folder.id && (
                  <span style={{ display: "flex", gap: 2, marginLeft: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      title="Rename"
                      onClick={(e) => { e.stopPropagation(); startRename(folder); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: "1px 3px", color: "var(--text-muted, #8a7a65)", borderRadius: 3 }}
                    >
                      ✏️
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); setDeletingId(folder.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: "1px 3px", color: "var(--text-muted, #8a7a65)", borderRadius: 3 }}
                    >
                      ×
                    </button>
                  </span>
                )}
              </button>
            )}
          </div>
        ))}

        {showNewInput && (
          <input
            ref={newInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNew();
              if (e.key === "Escape") { setShowNewInput(false); setNewName(""); }
            }}
            onBlur={commitNew}
            placeholder="Folder name..."
            style={{
              width: "calc(100% - 20px)", margin: "4px 10px", padding: "4px 8px",
              fontSize: 13, border: "1px solid var(--accent, #c4622d)", borderRadius: 5,
              fontFamily: "'Outfit', sans-serif", background: "var(--bg)",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>

      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border, #d8cfc0)" }}>
        <button
          onClick={handleNewFolder}
          style={{
            width: "100%", fontSize: 13, padding: "6px 0", cursor: "pointer",
            background: "transparent", border: "1.5px dashed var(--border, #d8cfc0)",
            borderRadius: 6, color: "var(--text-muted, #8a7a65)", fontFamily: "'Outfit', sans-serif",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent, #c4622d)"; e.currentTarget.style.color = "var(--accent, #c4622d)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border, #d8cfc0)"; e.currentTarget.style.color = "var(--text-muted, #8a7a65)"; }}
        >
          + New Folder
        </button>
      </div>
    </div>
  );
}

// ── Transcriptions ────────────────────────────────────────────────────────────

export default function Transcriptions() {
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState(null);
  const folderMenuRef = useRef(null);

  useEffect(() => {
    api.get("/transcriptions").then((r) => setItems(r.data)).catch(() => {});
    api.get("/folders?type=transcription").then((r) => setFolders(r.data)).catch(() => {});
  }, []);

  // Close folder dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuId(null);
      }
    }
    if (folderMenuId) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [folderMenuId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["mp3", "mp4", "wav", "m4a", "webm", "ogg"].includes(ext)) {
      setUploadError("Supported formats: mp3, mp4, wav, m4a, webm, ogg");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post("/transcriptions/upload", formData);
      setItems((prev) => [data, ...prev]);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/transcriptions/${id}`);
      setItems((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  }

  // ── Folder management ──────────────────────────────────────────────────────

  async function createFolder(name) {
    try {
      const { data } = await api.post("/folders", { name, folder_type: "transcription" });
      setFolders((prev) => [...prev, data]);
    } catch {}
  }

  async function renameFolder(id, name) {
    try {
      const { data } = await api.patch(`/folders/${id}`, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: data.name } : f)));
    } catch {}
  }

  async function deleteFolder(id) {
    try {
      await api.delete(`/folders/${id}`);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setItems((prev) => prev.map((t) => (t.folder_id === id ? { ...t, folder_id: null } : t)));
      if (activeFolderId === id) setActiveFolderId(null);
    } catch {}
  }

  async function moveToFolder(itemId, folderId) {
    try {
      await api.patch(`/transcriptions/${itemId}/folder`, { folder_id: folderId });
      setItems((prev) => prev.map((t) => (t.id === itemId ? { ...t, folder_id: folderId } : t)));
    } catch {}
    setFolderMenuId(null);
  }

  function toggleEditMode() {
    setEditMode((m) => !m);
    setFolderMenuId(null);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const visibleItems = activeFolderId === null
    ? items
    : items.filter((t) => t.folder_id === activeFolderId);

  const foldersWithCounts = folders.map((f) => ({
    ...f,
    count: items.filter((t) => t.folder_id === f.id).length,
  }));

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <FolderSidebar
        folders={foldersWithCounts}
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId}
        onCreate={createFolder}
        onRename={renameFolder}
        onDelete={deleteFolder}
        allLabel="All Transcriptions"
        allCount={items.length}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: "32px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text)" }}>AI Transcription</h1>
              {activeFolder && (
                <div style={{ fontSize: 13, color: "var(--text-muted, #8a7a65)", marginTop: 2 }}>
                  📁 {activeFolder.name}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ThemeToggle />
              <button style={btnSecondary} onClick={toggleEditMode}>{editMode ? "Done" : "Edit"}</button>
              <button style={btnSecondary} onClick={() => navigate("/library")}>← Library</button>
              <button
                style={btnPrimary}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.mp4,.wav,.m4a,.webm,.ogg"
            style={{ display: "none" }}
            onChange={handleUpload}
          />

          {uploadError && (
            <p style={{ color: "var(--danger-text)", fontSize: 13, marginBottom: 14 }}>{uploadError}</p>
          )}

          <div>
            {visibleItems.map((item) => {
              const itemFolder = folders.find((f) => f.id === item.folder_id);
              const folderControl = folders.length > 0 ? (
                <div
                  ref={folderMenuId === item.id ? folderMenuRef : null}
                  style={{ position: "relative" }}
                >
                  <button
                    title="Move to folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolderMenuId((prev) => prev === item.id ? null : item.id);
                    }}
                    style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 5, cursor: "pointer", fontSize: 12,
                      padding: "3px 7px", color: "var(--text-muted)",
                    }}
                  >
                    📁
                  </button>
                  {folderMenuId === item.id && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      minWidth: 160, overflow: "hidden",
                    }}>
                      {folders.map((f, i) => (
                        <button
                          key={f.id}
                          onClick={(e) => { e.stopPropagation(); moveToFolder(item.id, f.id); }}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px",
                            fontSize: 13, cursor: "pointer", border: "none",
                            borderTop: i > 0 ? "1px solid var(--border)" : "none",
                            background: item.folder_id === f.id ? "var(--surface2)" : "transparent",
                            color: "var(--text)", textAlign: "left",
                            fontFamily: "'Outfit', sans-serif",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = item.folder_id === f.id ? "var(--surface2)" : "transparent"; }}
                        >
                          📁 {f.name}
                        </button>
                      ))}
                      {item.folder_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveToFolder(item.id, null); }}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px",
                            fontSize: 13, cursor: "pointer", border: "none",
                            borderTop: "1px solid var(--border)",
                            background: "transparent", color: "var(--danger-text)", textAlign: "left",
                            fontFamily: "'Outfit', sans-serif",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          Remove from folder
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null;

              return (
                <div key={item.id}>
                  <div
                    onClick={() => { if (!editMode) navigate(`/transcription/${item.id}`); }}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      marginBottom: 10,
                      cursor: editMode ? "default" : "pointer",
                      background: "var(--bg)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <strong style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 15,
                        color: "var(--text)",
                      }}>
                        {item.title}
                      </strong>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {item.language ? `${item.language} · ` : ""}
                        {formatDuration(item.duration_seconds) ? `${formatDuration(item.duration_seconds)} · ` : ""}
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                        {itemFolder && (
                          <span style={{
                            fontSize: 11, color: "var(--text-muted)",
                            background: "var(--surface2)",
                            border: "1px solid var(--border)",
                            borderRadius: 999, padding: "1px 7px",
                          }}>
                            📁 {itemFolder.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Right column: status layer on top, edit controls below */}
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      {/* Status layer — always visible */}
                      <span style={{
                        background: STATUS_BADGE[item.status]?.bg ?? "var(--surface2)",
                        color: STATUS_BADGE[item.status]?.color ?? "var(--text)",
                        border: `1px solid ${STATUS_BADGE[item.status]?.border ?? "var(--border)"}`,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}>
                        {item.status}
                      </span>
                      {/* Edit controls layer — edit mode only */}
                      {editMode && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {folderControl}
                          <button
                            aria-label={`Delete ${item.title}`}
                            style={btnDestructive}
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleItems.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", marginTop: 40 }}>
                {activeFolderId
                  ? "No transcriptions in this folder."
                  : "No transcriptions yet. Upload an audio or video file to get started."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
