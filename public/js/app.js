const homePlaybackStatus = document.getElementById("home-playback-status");
const homePlaybackHint = document.getElementById("home-playback-hint");
const homeAutoplayToggle = document.getElementById("home-autoplay-toggle");
const homeDeviceList = document.getElementById("device-list");
const homeDeviceStatus = document.getElementById("home-device-status");
const homeDeviceRefreshBtn = document.getElementById("home-device-refresh");
const homeTrackImage = document.getElementById("home-track-image");
const homeTrackTitle = document.getElementById("home-track-title");
const homeTrackArtist = document.getElementById("home-track-artist");
const homeTrackAlbum = document.getElementById("home-track-album");
const homePlayToggle = document.getElementById("home-play-toggle");
const homeProgressBar = document.getElementById("home-progress-bar");
const homeElapsed = document.getElementById("home-elapsed");
const homeRemaining = document.getElementById("home-remaining");
const homeStartPlaybackBtn = document.getElementById("home-start-playback-btn");
const homeSessionError = document.getElementById("queue-error");
const playbackWidget = document.querySelector(".playback-widget");
const playbackTrack = document.querySelector(".playback-track");
const playbackControls = document.querySelector(".playback-controls");
const homeQueueStatus = document.getElementById("home-queue-status");

function updateProgressFill() {
  if (!homeProgressBar) return;
  const max = Number(homeProgressBar.max) || 100;
  const val = Number(homeProgressBar.value) || 0;
  const pct = max > 0 ? (val / max) * 100 : 0;
  homeProgressBar.style.setProperty("--progress", pct + "%");
}
const homeLoadQueueBtn = document.getElementById("home-load-queue-btn");
const homeClearQueueBtn = document.getElementById("home-clear-queue-btn");

let homeSelectedDeviceId = null;
let homeProgressTimer = null;
let homeProgressState = null;
let homeUnifiedSubscribed = false;
let homeQueueCount = null;
let homeIsSeeking = false;

function setHomePlaybackStatus(text, isPlaying) {
  if (!homePlaybackStatus) return;
  homePlaybackStatus.textContent = text || "";
  if (text) {
    homePlaybackStatus.style.color = isPlaying ? "var(--accent)" : "#ffd36a";
  }
}

function setHomePlaybackHint(text) {
  if (!homePlaybackHint) return;
  homePlaybackHint.textContent = text || "";
}

function setHomeDeviceStatus(text) {
  if (!homeDeviceStatus) return;
  homeDeviceStatus.textContent = text || "";
}

function setHomeSessionError(text) {
  if (!homeSessionError) return;
  homeSessionError.textContent = text || "";
}

function formatArtists(artists = []) {
  return artists.map((artist) => artist.name).join(", ");
}

function parseTrack(item) {
  if (!item) return null;
  return {
    title: item.name || item.title || "",
    artist: item.artists ? formatArtists(item.artists) : item.artist || "",
    image: item.album?.images?.[0]?.url || item.image || "",
    album: item.album?.name || item.album || ""
  };
}

function formatTimeFromMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateHomeProgress() {
  if (!homeProgressState) return;
  const now = Date.now();
  let progressMs = homeProgressState.progressMs;
  if (homeProgressState.isPlaying) {
    progressMs += now - homeProgressState.startedAt;
  }
  const durationMs = homeProgressState.durationMs;
  const clamped = Math.min(Math.max(progressMs, 0), durationMs);
  if (homeProgressBar && !homeIsSeeking) {
    homeProgressBar.max = String(durationMs || 0);
    homeProgressBar.value = String(clamped);
    updateProgressFill();
  }
  if (homeElapsed) {
    homeElapsed.textContent = formatTimeFromMs(clamped);
  }
  if (homeRemaining) {
    homeRemaining.textContent = `-${formatTimeFromMs(durationMs - clamped)}`;
  }
}

function renderHomeTrackDetails(track) {
  const cover = homeTrackImage ? homeTrackImage.closest(".home-cover") : null;
  if (!track || !track.image) {
    if (cover) cover.style.display = "none";
  } else if (cover) {
    cover.style.display = "";
  }
  if (homeTrackImage) {
    homeTrackImage.src = track?.image || "";
    homeTrackImage.alt = track?.title || "Track cover";
  }
  if (homeTrackTitle) {
    homeTrackTitle.textContent = track?.title || "Nothing playing";
  }
  if (homeTrackArtist) {
    homeTrackArtist.textContent = track?.artist || " ";
  }
  if (homeTrackAlbum) {
    homeTrackAlbum.textContent = track?.album || " ";
  }
}

function setPlaybackVisibility(hasPlayback) {
  const canControl = window.authAPI && window.authAPI.hasPermission("playback:pause");
  if (playbackTrack) {
    playbackTrack.style.display = hasPlayback ? "" : "none";
  }
  if (playbackControls) {
    playbackControls.style.display = hasPlayback && canControl ? "" : "none";
  }
  if (playbackWidget) {
    playbackWidget.classList.toggle("is-empty", !hasPlayback);
  }
}

async function fetchStatus() {
  try {
    const response = await fetch("/status");
    if (!response.ok) {
      console.error("Status check failed", response.status);
      return;
    }
  } catch (error) {
    console.error("Status check error", error);
  }
}

function setHomeQueueStatus(count) {
  homeQueueCount = typeof count === "number" ? count : null;

  if (homeQueueStatus) {
    const text = homeQueueStatus.querySelector(".queue-count-text");
    if (text) {
      const canLoad = window.authAPI && window.authAPI.hasPermission("queue:playlist:load");
      const canClear = window.authAPI && window.authAPI.hasPermission("queue:clear");
      if (!count) {
        text.textContent = "Queue is empty.";
        if (homeLoadQueueBtn && canLoad) homeLoadQueueBtn.style.display = "inline-flex";
        if (homeClearQueueBtn) homeClearQueueBtn.style.display = "none";
      } else {
        text.textContent = `${count} track${count === 1 ? "" : "s"} in the queue.`;
        if (homeLoadQueueBtn) homeLoadQueueBtn.style.display = "none";
        if (homeClearQueueBtn && canClear) homeClearQueueBtn.style.display = "inline-flex";
      }
    }
  }

  if (homeAutoplayToggle) {
    homeAutoplayToggle.disabled = !count;
  }
  if (homeStartPlaybackBtn) {
    homeStartPlaybackBtn.disabled = !count;
  }
}

function setHomeStartPlaybackVisibility(show) {
  if (!homeStartPlaybackBtn) return;

  const canPlay = window.authAPI && window.authAPI.hasPermission("playback:play");

  if (canPlay) {
    homeStartPlaybackBtn.style.display = show ? "inline-flex" : "none";
  } else {
    homeStartPlaybackBtn.style.display = "none";
  }
}

function applyHomePlaybackPayload(data) {
  const playback = data.playback;
  const queuePlayback = data.queue?.currently_playing || null;
  const currentItem = playback?.item || queuePlayback;
  if (typeof data.queueCount === "number") {
    setHomeQueueStatus(data.queueCount);
  }
  var autoPlayOn = true;
  if (homeAutoplayToggle && typeof data.autoPlayEnabled === "boolean") {
    homeAutoplayToggle.checked = data.autoPlayEnabled;
    autoPlayOn = data.autoPlayEnabled;
  }
  var autoPlayOffNotice = !autoPlayOn
    ? " Auto-play is not active \u2013 active title will not be updated."
    : "";
  if (!currentItem) {
    setHomePlaybackStatus("Paused", false);
    setHomePlaybackHint("No active playback found." + autoPlayOffNotice);
    setPlaybackVisibility(false);
    renderHomeTrackDetails(null);
    setHomeStartPlaybackVisibility(true);
    if (homeProgressBar) {
      homeProgressBar.value = "0";
      homeProgressBar.max = "100";
      homeProgressBar.disabled = true;
      updateProgressFill();
    }
    if (homeElapsed) homeElapsed.textContent = "0:00";
    if (homeRemaining) homeRemaining.textContent = "-0:00";
    if (homeProgressTimer) {
      clearInterval(homeProgressTimer);
      homeProgressTimer = null;
    }
    homeProgressState = null;
    return;
  }

  const isPlaying =
    typeof playback?.is_playing === "boolean"
      ? playback.is_playing
      : Boolean(data.queue && data.queue.is_playing);
  setHomePlaybackStatus(isPlaying ? "Playing" : "Paused", isPlaying);
  setHomePlaybackHint(
    (isPlaying ? "Audio is live right now." : "Playback is currently paused.") + autoPlayOffNotice
  );
  const track = parseTrack(currentItem);
  setPlaybackVisibility(true);
  renderHomeTrackDetails(track);
  setHomeStartPlaybackVisibility(false);

  const durationMs =
    typeof currentItem.duration_ms === "number" ? currentItem.duration_ms : 0;
  const progressMs =
    typeof playback?.progress_ms === "number" ? playback.progress_ms : 0;
  if (durationMs > 0) {
    homeProgressState = {
      durationMs,
      progressMs,
      isPlaying,
      startedAt: Date.now()
    };
    if (homeProgressBar) {
      homeProgressBar.disabled = false;
    }
    updateHomeProgress();
    if (homeProgressTimer) {
      clearInterval(homeProgressTimer);
    }
    homeProgressTimer = setInterval(() => {
      updateHomeProgress();
    }, 1000);
  }

  if (homePlayToggle) {
    const icon = homePlayToggle.querySelector(".icon");
    if (icon) {
      icon.innerHTML = isPlaying
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"></path></svg>';
    }
    homePlayToggle.setAttribute(
      "aria-label",
      isPlaying ? "Pause" : "Play"
    );
  }
}

function startHomeUnifiedLongPoll() {
  if (homeUnifiedSubscribed || !window.streamLeader) return;
  homeUnifiedSubscribed = true;
  window.streamLeader.subscribe((data) => {
    if (!data) return;
    if (data.authOk === false) {
      setHomeSessionError("No active session. Connect Spotify on the Session page.");
      setHomePlaybackStatus("Disconnected", false);
      setHomePlaybackHint("No active session. Connect Spotify on the Session page.");
      setHomeDeviceStatus("No active session. Connect Spotify on the Session page.");
      return;
    }
    setHomeSessionError("");
    if (data.playback) {
      applyHomePlaybackPayload(data.playback);
    }
    if (data.devices) {
      const devices = Array.isArray(data.devices.devices) ? data.devices.devices : [];
      const active = devices.find((device) => device.is_active);
      const preferred = data.devices.preferredDeviceId || (active ? active.id : null);
      if (preferred && homeSelectedDeviceId !== preferred) {
        homeSelectedDeviceId = preferred;
      }
      renderHomeDevices(devices, preferred);
    }
    if (data.activeSessions) {
      updateSessionCounter(data.activeSessions);
    }
  });
  window.streamLeader.start();
}

function renderHomeDevices(devices, preferredId) {
  if (!homeDeviceList) return;
  homeDeviceList.innerHTML = "";
  if (!devices.length) {
    const li = document.createElement("li");
    li.className = "device-item device-item--empty";
    li.textContent = "No devices found";
    homeDeviceList.appendChild(li);
    setHomeDeviceStatus("Open Spotify on a device to enable playback.");
    return;
  }

  const active = devices.find((device) => device.is_active);
  const effectivePreferred =
    preferredId || homeSelectedDeviceId || (active ? active.id : "");
  devices.forEach((device) => {
    const li = document.createElement("li");
    li.className = "device-item";
    if (device.id === effectivePreferred) {
      li.classList.add("device-item--active");
    }
    li.dataset.deviceId = device.id;
    li.dataset.deviceName = device.name;
    li.innerHTML =
      '<svg class="device-item-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 17H7V5h10v14zm-5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>' +
      '<span class="device-item-name">' + device.name + "</span>" +
      (device.id === effectivePreferred ? '<span class="device-item-badge">Active</span>' : "");
    homeDeviceList.appendChild(li);
  });
  setHomeDeviceStatus("");
}

async function refreshHomeDevices() {
  if (!homeDeviceRefreshBtn) return;
  homeDeviceRefreshBtn.disabled = true;
  setHomeDeviceStatus("Refreshing devices...");
  try {
    const response = await fetch("/api/player/devices/refresh", {
      method: "POST"
    });
    if (!response.ok) {
      if (response.status === 401) {
        setHomeSessionError("No active session. Connect Spotify on the Session page.");
        setHomeDeviceStatus("No active session. Connect Spotify on the Session page.");
        return;
      }
      const text = await response.text();
      console.error("Home devices refresh failed", response.status, text);
      setHomeDeviceStatus("Unable to refresh devices.");
      return;
    }
    setHomeDeviceStatus("Devices refreshed.");
    setHomeSessionError("");
  } catch (error) {
    console.error("Home devices refresh error", error);
    setHomeDeviceStatus("Unable to refresh devices.");
  } finally {
    homeDeviceRefreshBtn.disabled = false;
  }
}

async function updateHomeAutoplay(enabled) {
  try {
    const response = await fetch("/api/queue/autoplay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    if (!response.ok) {
      const text = await response.text();
      console.error("Home autoplay update failed", response.status, text);
      return;
    }
    const data = await response.json();
    homeAutoplayToggle.checked = Boolean(data.autoPlayEnabled);
    setHomeSessionError("");
  } catch (error) {
    console.error("Home autoplay update error", error);
  }
}


async function initializeApp() {
  await window.authAPI.fetchUserStatus();
  fetchStatus();
  startHomeUnifiedLongPoll();
}

initializeApp();

if (homeAutoplayToggle) {
  homeAutoplayToggle.disabled = true;
}

if (homeStartPlaybackBtn) {
  homeStartPlaybackBtn.disabled = true;
}

if (homeAutoplayToggle) {
  homeAutoplayToggle.addEventListener("change", (event) => {
    updateHomeAutoplay(Boolean(event.target.checked));
  });
}

if (homeDeviceList) {
  homeDeviceList.addEventListener("click", async (event) => {
    const li = event.target.closest(".device-item[data-device-id]");
    if (!li) return;
    const deviceId = li.dataset.deviceId;
    const deviceName = li.dataset.deviceName || "";
    if (!deviceId || li.classList.contains("device-item--active")) return;
    try {
      const response = await fetch("/api/player/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, deviceName, play: true })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Home device transfer failed", response.status, text);
        setHomeDeviceStatus("Unable to switch device.");
        return;
      }

      homeSelectedDeviceId = deviceId;
      setHomeDeviceStatus("Device switched.");
      homeDeviceList.querySelectorAll(".device-item").forEach((el) => {
        el.classList.toggle("device-item--active", el.dataset.deviceId === deviceId);
        const badge = el.querySelector(".device-item-badge");
        if (el.dataset.deviceId === deviceId && !badge) {
          el.insertAdjacentHTML("beforeend", '<span class="device-item-badge">Active</span>');
        } else if (el.dataset.deviceId !== deviceId && badge) {
          badge.remove();
        }
      });
    } catch (error) {
      console.error("Home device transfer error", error);
      setHomeDeviceStatus("Unable to switch device.");
    }
  });
}

if (homeDeviceRefreshBtn) {
  homeDeviceRefreshBtn.addEventListener("click", () => {
    refreshHomeDevices();
  });
}

if (homePlayToggle) {
  homePlayToggle.addEventListener("click", async () => {
    if (!homeProgressState) return;
    const isPlaying = homeProgressState.isPlaying;
    const nextIsPlaying = !isPlaying;
    if (homeProgressState) {
      const now = Date.now();
      if (isPlaying) {
        homeProgressState.progressMs += now - homeProgressState.startedAt;
      }
      homeProgressState.isPlaying = nextIsPlaying;
      homeProgressState.startedAt = now;
    }
    if (homePlayToggle) {
      const icon = homePlayToggle.querySelector(".icon");
      if (icon) {
        icon.innerHTML = nextIsPlaying
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"></path></svg>';
      }
      homePlayToggle.setAttribute(
        "aria-label",
        nextIsPlaying ? "Pause" : "Play"
      );
    }
    setHomePlaybackStatus(nextIsPlaying ? "Playing" : "Paused", nextIsPlaying);
    setHomePlaybackHint(
      nextIsPlaying ? "Audio is live right now." : "Playback is currently paused."
    );
    updateHomeProgress();
    try {
      const response = await fetch(
        isPlaying ? "/api/player/pause" : "/api/player/resume",
        { method: "POST" }
      );
      if (!response.ok) {
        const text = await response.text();
        console.error("Home play toggle failed", response.status, text);
        startHomeUnifiedLongPoll();
        return;
      }
      startHomeUnifiedLongPoll();
    } catch (error) {
      console.error("Home play toggle error", error);
      startHomeUnifiedLongPoll();
    }
  });
}

if (homeLoadQueueBtn) {
  homeLoadQueueBtn.addEventListener("click", () => {
    window.location.href = "playlist.html";
  });
}

if (homeStartPlaybackBtn) {
  homeStartPlaybackBtn.addEventListener("click", async () => {
    if (homeQueueCount !== null && homeQueueCount <= 0) return;
    if (homeAutoplayToggle) {
      homeAutoplayToggle.checked = true;
    }
    setHomePlaybackStatus("Starting...", true);
    setHomePlaybackHint("Turning on auto-play to start the queue.");
    await updateHomeAutoplay(true);
  });
}

if (homeClearQueueBtn) {
  homeClearQueueBtn.addEventListener("click", async () => {
    const confirmClear = window.confirm(
      "Clear the waiting list queue? This will remove all tracks."
    );
    if (!confirmClear) return;

    try {
      const response = await fetch("/api/queue/playlist/clear", {
        method: "POST"
      });
      if (!response.ok) {
        const text = await response.text();
        console.error("Clear queue failed", response.status, text);
        return;
      }
    } catch (error) {
      console.error("Clear queue error", error);
    }
  });
}

if (homeProgressBar) {
  homeProgressBar.addEventListener("input", (event) => {
    if (!homeProgressState) return;
    homeIsSeeking = true;
    const positionMs = Number(event.target.value);
    if (homeElapsed) {
      homeElapsed.textContent = formatTimeFromMs(positionMs);
    }
    if (homeRemaining) {
      homeRemaining.textContent = `-${formatTimeFromMs(homeProgressState.durationMs - positionMs)}`;
    }
    updateProgressFill();
  });

  homeProgressBar.addEventListener("change", async (event) => {
    if (!homeProgressState) return;
    const positionMs = Number(event.target.value);
    homeIsSeeking = false;

    try {
      const response = await fetch("/api/player/seek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_ms: positionMs })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Seek failed", response.status, text);
        return;
      }

      homeProgressState.progressMs = positionMs;
      homeProgressState.startedAt = Date.now();
      updateHomeProgress();
    } catch (error) {
      console.error("Seek error", error);
    }
  });
}

// --- Session Counter ---

const sessionCounterBtn = document.getElementById("session-counter-btn");
const sessionCounterCountEl = document.getElementById("session-counter-count");
const sessionPopup = document.getElementById("session-popup");
const sessionPopupList = document.getElementById("session-popup-list");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSessionAge(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - Date.parse(isoString);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1m ago";
  return `${minutes}m ago`;
}

function updateSessionCounter(activeSessions) {
  if (!activeSessions) return;
  const sessions = Array.isArray(activeSessions.sessions) ? activeSessions.sessions : [];
  if (sessionCounterCountEl) {
    sessionCounterCountEl.textContent = sessions.length;
  }
  if (!sessionPopupList) return;
  if (sessions.length === 0) {
    sessionPopupList.innerHTML = '<li class="session-popup-empty">No active users</li>';
    return;
  }
  sessionPopupList.innerHTML = sessions.map((s) => {
    const name = s.name || "Guest";
    const role = s.role || "guest";
    const time = formatSessionAge(s.lastActivityAt);
    const roleTag = role !== "guest"
      ? `<span class="session-popup-role">${escapeHtml(role)}</span>`
      : "";
    return `<li class="session-popup-item">
      <span class="session-popup-dot"></span>
      <span class="session-popup-name">${escapeHtml(name)}</span>
      ${roleTag}
      <span class="session-popup-time">${escapeHtml(time)}</span>
    </li>`;
  }).join("");
}

function toggleSessionPopup(open) {
  if (!sessionPopup || !sessionCounterBtn) return;
  const isOpen = open !== undefined ? open : !sessionPopup.classList.contains("is-open");
  sessionPopup.classList.toggle("is-open", isOpen);
  sessionPopup.setAttribute("aria-hidden", String(!isOpen));
  sessionCounterBtn.setAttribute("aria-expanded", String(isOpen));
}

if (sessionCounterBtn) {
  sessionCounterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSessionPopup();
  });
  document.addEventListener("click", (e) => {
    if (sessionPopup && !sessionPopup.contains(e.target) && e.target !== sessionCounterBtn) {
      toggleSessionPopup(false);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleSessionPopup(false);
  });
}

async function pingSession() {
  try {
    await fetch("/api/session/ping", { method: "POST" });
  } catch (_) {
    // non-critical
  }
}

pingSession();
setInterval(pingSession, 2 * 60 * 1000);
