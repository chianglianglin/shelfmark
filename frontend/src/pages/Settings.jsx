import { useState, useEffect } from "react";
import api from "../api";
import SyncStatus from "../components/SyncStatus";
import ThemeToggle from "../components/ThemeToggle";

export default function Settings() {
  const [vaultPath, setVaultPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/settings").then((r) => setVaultPath(r.data.vault_path || "")),
      api.get("/settings/sync-status").then((r) => setSyncStatus(r.data)),
    ]).catch(() => setLoadError("Failed to load settings."));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaveError("");
    try {
      await api.put("/settings", { vault_path: vaultPath });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("Failed to save settings. Please try again.");
    }
  }

  async function handleSyncAll() {
    setSyncError("");
    try {
      await api.post("/settings/sync");
      setTimeout(() => api.get("/settings/sync-status").then((r) => setSyncStatus(r.data)).catch(() => {}), 3000);
    } catch {
      setSyncError("Failed to start sync. Is the vault path configured?");
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
      <h1>Settings</h1>
      {loadError && <p style={{ color: "#ef4444" }}>{loadError}</p>}
      <h2>Obsidian Vault</h2>
      <form onSubmit={handleSave} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          placeholder="C:/Users/You/ObsidianVault"
          value={vaultPath}
          onChange={(e) => setVaultPath(e.target.value)}
        />
        <button type="submit">Save</button>
      </form>
      {saved && <p style={{ color: "green" }}>Saved!</p>}
      {saveError && <p style={{ color: "#ef4444" }}>{saveError}</p>}
      {syncStatus && <SyncStatus status={syncStatus} onSyncAll={handleSyncAll} />}
      {syncError && <p style={{ color: "#ef4444" }}>{syncError}</p>}
      <h2 style={{ marginTop: 32 }}>Email Ingestion</h2>
      <p>Forward newsletters to: <code>read@localhost</code> (SMTP on port 2525)</p>
      <h2 style={{ marginTop: 32 }}>Appearance</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14 }}>Theme</span>
        <ThemeToggle />
      </div>
    </div>
  );
}
