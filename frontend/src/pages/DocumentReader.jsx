import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import DocumentCard from "../components/DocumentCard";
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
const btnPrimary   = { ...btnBase, background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)" };

// ── Shared folder sidebar styles ──────────────────────────────────────────────
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
        {/* All items row */}
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

      {/* Folder list */}
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
                  fontFamily: "'Outfit', sans-serif", background: "var(--bg)", color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
            ) : deletingId === folder.id ? (
              <div style={{ padding: "6px 10px", background: "var(--danger-bg)", borderLeft: "3px solid var(--danger-border)", margin: "2px 0" }}>
                <div style={{ fontSize: 12, color: "var(--danger-text)", marginBottom: 6 }}>Delete folder?</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Documents inside will not be deleted.</div>
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

        {/* New folder inline input */}
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
              fontFamily: "'Outfit', sans-serif", background: "var(--bg)", color: "var(--text)",
              boxSizing: "border-box",
            }}
          />
        )}
      </div>

      {/* New folder button */}
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

// ── DocumentReader ────────────────────────────────────────────────────────────

export default function DocumentReader() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const navigate = useNavigate();
  const activeIntervals = useRef(new Set());
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [folderMenuDocId, setFolderMenuDocId] = useState(null);
  const folderMenuRef = useRef(null);

  useEffect(() => {
    api.get("/documents")
      .then((r) => {
        setDocuments(r.data);
        r.data.filter((d) => d.status === "processing").forEach((d) => pollStatus(d.id));
      })
      .catch(() => {});
    api.get("/folders?type=document").then((r) => setFolders(r.data)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close folder dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target)) {
        setFolderMenuDocId(null);
      }
    }
    if (folderMenuDocId) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [folderMenuDocId]);

  async function handleSave(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const { data } = await api.post("/documents", { url });
      setDocuments((prev) => [data, ...prev]);
      setUrl("");
      pollStatus(data.id);
    } catch {
      setSaveError("Failed to save URL. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf  = file.type === "application/pdf"       || name.endsWith(".pdf");
    const isEpub = file.type === "application/epub+zip"  || name.endsWith(".epub");
    if (!isPdf && !isEpub) {
      setUploadError("Only PDF and EPUB files are supported.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post("/documents/upload", formData);
      setDocuments((prev) => [data, ...prev]);
      pollStatus(data.id);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function pollStatus(id) {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/documents/${id}/status`);
        if (data.status !== "processing") {
          clearInterval(interval);
          activeIntervals.current.delete(interval);
          const { data: updated } = await api.get(`/documents/${id}`);
          setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
        }
      } catch {
        clearInterval(interval);
        activeIntervals.current.delete(interval);
      }
    }, 2000);
    activeIntervals.current.add(interval);
  }

  useEffect(() => {
    return () => { activeIntervals.current.forEach(clearInterval); };
  }, []);

  function toggleEditMode() {
    setEditMode((m) => !m);
    setConfirmingId(null);
    setDeleteError("");
  }

  async function handleDelete(id) {
    setConfirmingId(null);
    setDeleteError("");
    try {
      await api.delete(`/documents/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setDeleteError("Failed to delete. Please try again.");
    }
  }

  // ── Folder management ──────────────────────────────────────────────────────

  async function createFolder(name) {
    try {
      const { data } = await api.post("/folders", { name, folder_type: "document" });
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
      setDocuments((prev) => prev.map((d) => (d.folder_id === id ? { ...d, folder_id: null } : d)));
      if (activeFolderId === id) setActiveFolderId(null);
    } catch {}
  }

  async function moveToFolder(docId, folderId) {
    try {
      await api.patch(`/documents/${docId}/folder`, { folder_id: folderId });
      setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, folder_id: folderId } : d)));
      // Update counts in folder list
      setFolders((prev) => prev.map((f) => {
        const doc = documents.find((d) => d.id === docId);
        const oldFolderId = doc?.folder_id ?? null;
        if (f.id === folderId) return { ...f, count: f.count + 1 };
        if (f.id === oldFolderId) return { ...f, count: Math.max(0, f.count - 1) };
        return f;
      }));
    } catch {}
    setFolderMenuDocId(null);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const visibleDocuments = activeFolderId === null
    ? documents
    : documents.filter((d) => d.folder_id === activeFolderId);

  // Sync folder counts from document state
  const foldersWithCounts = folders.map((f) => ({
    ...f,
    count: documents.filter((d) => d.folder_id === f.id).length,
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
        allLabel="All Documents"
        allCount={documents.length}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: "32px 24px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text)" }}>Document Reader</h1>
              {activeFolder && (
                <div style={{ fontSize: 13, color: "var(--text-muted, #8a7a65)", marginTop: 2 }}>
                  📁 {activeFolder.name}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ThemeToggle />
              <button onClick={toggleEditMode} style={btnSecondary}>
                {editMode ? "Done" : "Edit"}
              </button>
              <button onClick={() => navigate("/library")} style={btnSecondary}>
                ← Library
              </button>
            </div>
          </div>

          {/* Save / Upload row */}
          <div style={{ marginBottom: 28 }}>
            <form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{
                  flex: 1, height: 34, padding: "0 12px",
                  border: "1px solid var(--border)", borderRadius: 6, fontSize: 14,
                  background: "var(--surface2)", color: "var(--text)", outline: "none", boxSizing: "border-box",
                }}
                placeholder="Paste URL to save as article..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button type="submit" disabled={saving || uploading} style={btnSecondary}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                disabled={uploading || saving}
                onClick={() => fileInputRef.current?.click()}
                style={btnPrimary}
              >
                {uploading ? "Uploading..." : "Upload PDF / EPUB"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.epub"
                style={{ display: "none" }}
                onChange={handleUpload}
              />
            </form>
            {saveError && <p style={{ color: "var(--danger-text)", fontSize: 13, margin: "6px 0 0" }}>{saveError}</p>}
            {uploadError && <p style={{ color: "var(--danger-text)", fontSize: 13, margin: "6px 0 0" }}>{uploadError}</p>}
          </div>

          {deleteError && <p style={{ color: "var(--danger-text)", fontSize: 13, margin: "0 0 14px" }}>{deleteError}</p>}

          <div>
            {visibleDocuments.map((doc) => {
              const docFolder = folders.find((f) => f.id === doc.folder_id);
              const folderControl = folders.length > 0 ? (
                <div
                  ref={folderMenuDocId === doc.id ? folderMenuRef : null}
                  style={{ position: "relative" }}
                >
                  <button
                    title="Move to folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolderMenuDocId((prev) => prev === doc.id ? null : doc.id);
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
                  {folderMenuDocId === doc.id && (
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
                          onClick={(e) => { e.stopPropagation(); moveToFolder(doc.id, f.id); }}
                          style={{
                            display: "block", width: "100%", padding: "8px 12px",
                            fontSize: 13, cursor: "pointer", border: "none",
                            borderTop: i > 0 ? "1px solid var(--border)" : "none",
                            background: doc.folder_id === f.id ? "var(--surface2)" : "transparent",
                            color: "var(--text, #2c2416)", textAlign: "left",
                            fontFamily: "'Outfit', sans-serif",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = doc.folder_id === f.id ? "var(--surface2)" : "transparent"; }}
                        >
                          📁 {f.name}
                        </button>
                      ))}
                      {doc.folder_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); moveToFolder(doc.id, null); }}
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
                <div key={doc.id} style={{ position: "relative" }}>
                  <DocumentCard
                    doc={doc}
                    onClick={() => navigate(`/read/${doc.id}`)}
                    editMode={editMode}
                    onDeleteClick={() => { setDeleteError(""); setConfirmingId(doc.id); }}
                    isConfirming={confirmingId === doc.id}
                    onConfirmDelete={() => handleDelete(doc.id)}
                    onCancelDelete={() => setConfirmingId(null)}
                    folderControl={folderControl}
                    hideBadge={doc.status === "unread"}
                  />
                  {/* Folder chip — non-edit mode only */}
                  {docFolder && !editMode && (
                    <div style={{
                      position: "absolute", bottom: 10, left: 16,
                      fontSize: 11, color: "var(--text-muted)",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 999, padding: "1px 7px",
                      pointerEvents: "none",
                    }}>
                      📁 {docFolder.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
