const TOKEN_KEY = "rw_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  // Also sync to extension storage so the browser extension can read the JWT
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    chrome.storage.local.set({ rw_token: token });
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}
