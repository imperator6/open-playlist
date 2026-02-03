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
const sessionRefresh = document.getElementById("session-refresh");
const sessionRefreshRelative = document.getElementById(
  "session-refresh-relative"
);
const sessionInfo = document.getElementById("session-info");
const hostPinInput = document.getElementById("host-pin");

let hostPinRequired = true;

function setError(message) {
  errorText.textContent = message || "";
}

function setHostControlsEnabled(enabled) {
  connectBtn.disabled = !enabled;
  clearBtn.disabled = !enabled;
  connectBtn.setAttribute("aria-disabled", String(!enabled));
  clearBtn.setAttribute("aria-disabled", String(!enabled));
}

function updateHostControls() {
  if (!hostPinRequired) {
    setHostControlsEnabled(true);
    return;
  }
  const hasPin = hostPinInput.value.trim().length > 0;
  setHostControlsEnabled(hasPin);
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
    ["Has redirect URI", data.hasRedirectUri ? "Yes" : "No"],
    ["Host PIN required", data.hostPinRequired ? "Yes" : "No"]
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
    ? "Spotify access is active for all guests."
    : "Host must connect to enable party access.";

  if (data.expiresAt) {
    const expiresAt = new Date(data.expiresAt);
    sessionExpiry.textContent = expiresAt.toLocaleString();
    const remaining = expiresAt.getTime() - Date.now();
    sessionExpiryRelative.textContent = formatRelative(remaining);
  } else {
    sessionExpiry.textContent = "-";
    sessionExpiryRelative.textContent = "";
  }

  if (data.lastRefreshAt) {
    const refreshedAt = new Date(data.lastRefreshAt);
    sessionRefresh.textContent = refreshedAt.toLocaleString();
    const elapsed = Date.now() - refreshedAt.getTime();
    sessionRefreshRelative.textContent = `${Math.round(elapsed / 60000)} minutes ago`;
  } else {
    sessionRefresh.textContent = "-";
    sessionRefreshRelative.textContent = "";
  }

  hostPinRequired = Boolean(data.hostPinRequired);
  updateHostControls();
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
        lastRefreshAt: null,
        hasToken: false,
        hasRefreshToken: false,
        hasRedirectUri: false,
        hostPinRequired: true
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

async function connectHost() {
  setError("");
  const pin = hostPinInput.value.trim();
  try {
    const response = await fetch("/api/host/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });

    if (!response.ok) {
      if (response.status === 403) {
        setError("Invalid host PIN.");
        return;
      }
      setError("Unable to start Spotify login.");
      return;
    }

    const data = await response.json();
    window.location.href = data.authorizeUrl;
  } catch (error) {
    console.error("Host connect error", error);
    setError("Unable to start Spotify login.");
  }
}

async function disconnectHost() {
  setError("");
  const pin = hostPinInput.value.trim();
  try {
    const response = await fetch("/api/host/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });

    if (!response.ok) {
      if (response.status === 403) {
        setError("Invalid host PIN.");
        return;
      }
      setError("Unable to disconnect.");
      return;
    }

    fetchStatus();
  } catch (error) {
    console.error("Host logout error", error);
    setError("Unable to disconnect.");
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

hostPinInput.addEventListener("input", updateHostControls);

connectBtn.addEventListener("click", () => {
  connectHost();
});

clearBtn.addEventListener("click", () => {
  disconnectHost();
});

readErrorFromUrl();
fetchStatus();
setInterval(fetchStatus, 15000);
