const connectBtn = document.getElementById("connect-btn");
const clearBtn = document.getElementById("clear-btn");
const statusText = document.getElementById("status-text");
const errorText = document.getElementById("error-text");
const sessionStatus = document.getElementById("session-status");
const sessionStatusHint = document.getElementById("session-status-hint");
const sessionExpiry = document.getElementById("session-expiry");
const sessionExpiryRelative = document.getElementById(
  "session-expiry-relative"
);
const sessionInfo = document.getElementById("session-info");

function setError(message) {
  errorText.textContent = message || "";
}

function formatRelative(ms) {
  if (ms <= 0) return "Expired";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minutes from now`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m from now`;
}

function renderSessionInfo(data) {
  sessionInfo.innerHTML = "";
  const items = [
    ["Has access token", data.hasToken ? "Yes" : "No"],
    ["Has refresh token", data.hasRefreshToken ? "Yes" : "No"],
    ["Has redirect URI", data.hasRedirectUri ? "Yes" : "No"]
  ];

  items.forEach(([label, value]) => {
    const li = document.createElement("li");
    li.textContent = `${label}: ${value}`;
    sessionInfo.appendChild(li);
  });
}

function renderStatus(data) {
  statusText.textContent = data.connected ? "Connected" : "Not connected";
  statusText.style.color = data.connected ? "var(--accent)" : "var(--muted)";
  sessionStatus.textContent = data.connected ? "Connected" : "Disconnected";
  sessionStatusHint.textContent = data.connected
    ? "Spotify access is active."
    : "Connect to enable search and queue.";

  if (data.expiresAt) {
    const expiresAt = new Date(data.expiresAt);
    sessionExpiry.textContent = expiresAt.toLocaleString();
    const remaining = expiresAt.getTime() - Date.now();
    sessionExpiryRelative.textContent = formatRelative(remaining);
  } else {
    sessionExpiry.textContent = "—";
    sessionExpiryRelative.textContent = "";
  }

  renderSessionInfo(data);
}

async function fetchStatus() {
  try {
    const response = await fetch("/status");
    if (!response.ok) {
      setError("Unable to read session status.");
      renderStatus({
        connected: false,
        expiresAt: null,
        hasToken: false,
        hasRefreshToken: false,
        hasRedirectUri: false
      });
      return;
    }
    const data = await response.json();
    renderStatus(data);
  } catch (error) {
    console.error("Session status error", error);
    setError("Unable to read session status.");
  }
}

function readErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return;

  const messageMap = {
    state:
      "Login failed due to a session mismatch. Make sure you're using the same host for the whole flow.",
    auth: "Spotify rejected the authorization code exchange. Check server logs.",
    access_denied: "Spotify access was denied. Try connecting again."
  };

  const message = messageMap[error] || `Spotify error: ${error}`;
  setError(message);
  params.delete("error");
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState({}, "", url);
}

connectBtn.addEventListener("click", () => {
  setError("");
  window.location.href = "/login";
});

clearBtn.addEventListener("click", async () => {
  await fetch("/logout");
  setError("");
  fetchStatus();
});

readErrorFromUrl();
fetchStatus();
