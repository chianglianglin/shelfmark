export default function SyncStatus({ status, onSyncAll }) {
  const hasErrors = status.errors?.length > 0;
  return (
    <div style={{ background: hasErrors ? "#fef2f2" : "#f0fdf4", borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          {(status.unsynced_count ?? 0) === 0
            ? "All highlights synced"
            : `${status.unsynced_count} highlight(s) pending sync`}
        </span>
        <button onClick={onSyncAll}>Sync All</button>
      </div>
      {hasErrors && (
        <div style={{ marginTop: 12 }}>
          <strong>Sync errors:</strong>
          {status.errors.map((e) => (
            <p key={e.id} style={{ color: "#ef4444", fontSize: 12 }}>
              {e.id}: {e.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
