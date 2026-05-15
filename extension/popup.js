const API_BASE = "http://localhost:8000/api";
const TOKEN_KEY = "rw_token";

document.getElementById("save-btn").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Saving...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    status.textContent = "No active tab found.";
    return;
  }
  let html = null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });
    html = results[0]?.result || null;
  } catch {
    html = null;
  }

  const token = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
  if (!token) {
    status.textContent = "Not logged in. Open the app first.";
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: tab.url, html }),
    });
    if (resp.ok) {
      status.textContent = "Saved! Processing in background.";
    } else {
      status.textContent = "Error saving page.";
    }
  } catch {
    status.textContent = "Could not reach Reader app. Is it running?";
  }
});
