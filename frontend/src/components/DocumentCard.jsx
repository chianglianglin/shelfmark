const STATUS_BADGE = {
  unread:     { bg: "var(--status-unread-bg)",     color: "var(--status-unread-text)",     border: "var(--status-unread-border)" },
  reading:    { bg: "var(--status-reading-bg)",    color: "var(--status-reading-text)",    border: "var(--status-reading-border)" },
  finished:   { bg: "var(--status-finished-bg)",   color: "var(--status-finished-text)",   border: "var(--status-finished-border)" },
  processing: { bg: "var(--status-processing-bg)", color: "var(--status-processing-text)", border: "var(--status-processing-border)" },
  error:      { bg: "var(--status-error-bg)",      color: "var(--status-error-text)",      border: "var(--status-error-border)" },
};

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
const btnDestructive = { ...btnBase, background: "transparent", color: "var(--danger-text)", borderColor: "var(--danger-border)" };

export default function DocumentCard({
  doc,
  onClick,
  editMode,
  onDeleteClick,
  isConfirming,
  onConfirmDelete,
  onCancelDelete,
  folderControl,
  hideBadge = false,
}) {
  function handleCardClick() {
    if (!editMode) onClick?.();
  }

  const confirming = isConfirming && editMode;

  return (
    <div
      onClick={handleCardClick}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 10,
        cursor: editMode ? "default" : "pointer",
        background: "var(--surface2)",
      }}
    >
      {confirming ? (
        <div style={{ background: "var(--danger-bg)", borderRadius: 6, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 10px", fontWeight: 500, fontSize: 14, color: "var(--text)" }}>
            Delete &ldquo;{doc.title || "Untitled"}&rdquo;?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmDelete?.(); }}
              style={btnDestructive}
            >
              Confirm Delete
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCancelDelete?.(); }}
              style={btnSecondary}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <strong style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 15,
              color: "var(--text)",
              paddingTop: 2,
            }}>
              {doc.title || "Untitled"}
            </strong>
            {(!hideBadge || editMode) && (
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                {/* Status layer — hidden when hideBadge is true */}
                {!hideBadge && (
                  <span style={{
                    background: STATUS_BADGE[doc.status]?.bg ?? "var(--status-finished-bg)",
                    color: STATUS_BADGE[doc.status]?.color ?? "var(--status-finished-text)",
                    border: `1px solid ${STATUS_BADGE[doc.status]?.border ?? "var(--status-finished-border)"}`,
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
                )}
                {/* Edit controls layer — edit mode only */}
                {editMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {folderControl}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteClick?.(); }}
                      style={{
                        background: "none",
                        border: "1px solid var(--danger-border)",
                        borderRadius: 5,
                        color: "var(--danger-text)",
                        cursor: "pointer",
                        fontSize: 14,
                        lineHeight: 1,
                        padding: "3px 7px",
                        flexShrink: 0,
                      }}
                      aria-label={`Delete ${doc.title || "Untitled"}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            {doc.type} · {doc.saved_at ? new Date(doc.saved_at).toLocaleDateString() : ""}
            {doc.word_count ? ` · ${Math.ceil(doc.word_count / 200)} min read` : ""}
          </div>
        </>
      )}
    </div>
  );
}
