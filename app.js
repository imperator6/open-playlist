const homePlaybackStatus = document.getElementById("home-playback-status");
const homePlaybackHint = document.getElementById("home-playback-hint");
const homeAutoplayToggle = document.getElementById("home-autoplay-toggle");
const homeDeviceSelect = document.getElementById("home-device-select");
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
const playbackWidget = document.querySelector(".playback-widget");
const playbackTrack = document.querySelector(".playback-track");
const playbackControls = document.querySelector(".playback-controls");
const homeQueueStatus = document.getElementById("home-queue-status");
const homeLoadQueueBtn = document.getElementById("home-load-queue-btn");
const homeClearQueueBtn = document.getElementById("home-clear-queue-btn");
const MENU_SESSION_PAGE = "session.html";

let homeSelectedDeviceId = null;
let homeProgressTimer = null;
let homeProgressState = null;
let homePlaybackSince = null;
let homeDevicesSince = null;
let homeQueueCount = null;

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
  if (homeProgressBar) {
    homeProgressBar.max = String(durationMs || 0);
    homeProgressBar.value = String(clamped);
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
  if (playbackTrack) {
    playbackTrack.style.display = hasPlayback ? "" : "none";
  }
  if (playbackControls) {
    playbackControls.style.display = hasPlayback ? "" : "none";
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
    const data = await response.json();
    if (!data.connected && !window.location.pathname.endsWith(MENU_SESSION_PAGE)) {
      window.location.href = MENU_SESSION_PAGE;
      return;
    }
  } catch (error) {
    console.error("Status check error", error);
  }
}

function setHomeQueueStatus(count) {
  if (!homeQueueStatus) return;
  const text = homeQueueStatus.querySelector(".queue-count-text");
  if (!text) return;
  homeQueueCount = typeof count === "number" ? count : null;
  if (!count) {
    text.textContent = "Queue is empty.";
    if (homeLoadQueueBtn) {
      homeLoadQueueBtn.style.display = "inline-flex";
    }
    if (homeClearQueueBtn) {
      homeClearQueueBtn.style.display = "none";
    }
    if (homeAutoplayToggle) {
      homeAutoplayToggle.disabled = true;
    }
    if (homeStartPlaybackBtn) {
      homeStartPlaybackBtn.disabled = true;
    }
    return;
  }
  text.textContent = `${count} track${count === 1 ? "" : "s"} in the queue.`;
  if (homeLoadQueueBtn) {
    homeLoadQueueBtn.style.display = "none";
  }
  if (homeClearQueueBtn) {
    homeClearQueueBtn.style.display = "inline-flex";
  }
  if (homeAutoplayToggle) {
    homeAutoplayToggle.disabled = false;
  }
  if (homeStartPlaybackBtn) {
    homeStartPlaybackBtn.disabled = false;
  }
}

function setHomeStartPlaybackVisibility(show) {
  if (!homeStartPlaybackBtn) return;
  homeStartPlaybackBtn.style.display = show ? "inline-flex" : "none";
}

function applyHomePlaybackPayload(data) {
  const playback = data.playback;
  const queuePlayback = data.queue?.currently_playing || null;
  const currentItem = playback?.item || queuePlayback;
  if (typeof data.queueCount === "number") {
    setHomeQueueStatus(data.queueCount);
  }
  if (homeAutoplayToggle && typeof data.autoPlayEnabled === "boolean") {
    homeAutoplayToggle.checked = data.autoPlayEnabled;
  }
  if (!currentItem) {
    setHomePlaybackStatus("Paused", false);
    setHomePlaybackHint("No active playback found.");
    setPlaybackVisibility(false);
    renderHomeTrackDetails(null);
    setHomeStartPlaybackVisibility(true);
    if (homeProgressBar) {
      homeProgressBar.value = "0";
      homeProgressBar.max = "100";
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
    isPlaying ? "Audio is live right now." : "Playback is currently paused."
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

async function startHomePlaybackLongPoll() {
  if (!homePlaybackStatus) return;
  try {
    const query = homePlaybackSince ? `?since=${encodeURIComponent(homePlaybackSince)}` : "";
    const response = await fetch(`/api/queue/stream${query}`);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = MENU_SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Home playback stream failed", response.status, text);
      setHomePlaybackStatus("Disconnected", false);
      setHomePlaybackHint("Connect Spotify on the Session page to load playback.");
      setTimeout(startHomePlaybackLongPoll, 2000);
      return;
    }

    const data = await response.json();
    homePlaybackSince = data.updatedAt || new Date().toISOString();
    applyHomePlaybackPayload(data);
    startHomePlaybackLongPoll();
  } catch (error) {
    console.error("Home playback stream error", error);
    setTimeout(startHomePlaybackLongPoll, 2000);
  }
}

function renderHomeDevices(devices, preferredId) {
  if (!homeDeviceSelect) return;
  homeDeviceSelect.innerHTML = "";
  if (!devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No devices found";
    homeDeviceSelect.appendChild(option);
    homeDeviceSelect.disabled = true;
    setHomeDeviceStatus("Open Spotify on a device to enable playback.");
    return;
  }

  const active = devices.find((device) => device.is_active);
  const effectivePreferred =
    preferredId || homeSelectedDeviceId || (active ? active.id : "");
  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = device.name;
    if (device.id === effectivePreferred) {
      option.selected = true;
    }
    homeDeviceSelect.appendChild(option);
  });
  homeDeviceSelect.disabled = false;
  setHomeDeviceStatus("");
}

async function startHomeDevicesLongPoll() {
  if (!homeDeviceSelect) return;
  try {
    const query = homeDevicesSince ? `?since=${encodeURIComponent(homeDevicesSince)}` : "";
    const response = await fetch(`/api/player/devices/stream${query}`);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = MENU_SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Home devices stream failed", response.status, text);
      setHomeDeviceStatus("Unable to load devices.");
      setTimeout(startHomeDevicesLongPoll, 2000);
      return;
    }

    const data = await response.json();
    homeDevicesSince = data.updatedAt || new Date().toISOString();
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const active = devices.find((device) => device.is_active);
    const preferred = data.preferredDeviceId || (active ? active.id : null);
    if (preferred && homeSelectedDeviceId !== preferred) {
      homeSelectedDeviceId = preferred;
    }
    renderHomeDevices(devices, preferred);
    startHomeDevicesLongPoll();
  } catch (error) {
    console.error("Home devices stream error", error);
    setTimeout(startHomeDevicesLongPoll, 2000);
  }
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
        window.location.href = MENU_SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Home devices refresh failed", response.status, text);
      setHomeDeviceStatus("Unable to refresh devices.");
      return;
    }
    setHomeDeviceStatus("Devices refreshed.");
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
  } catch (error) {
    console.error("Home autoplay update error", error);
  }
}


fetchStatus();
startHomePlaybackLongPoll();
startHomeDevicesLongPoll();

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

if (homeDeviceSelect) {
  homeDeviceSelect.addEventListener("change", async (event) => {
    const target = event.target;
    const deviceId = target.value;
    if (!deviceId) return;
    try {
      const response = await fetch("/api/player/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          deviceName: target.options[target.selectedIndex]?.textContent || "",
          play: true
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Home device transfer failed", response.status, text);
        setHomeDeviceStatus("Unable to switch device.");
        return;
      }

      homeSelectedDeviceId = deviceId;
      setHomeDeviceStatus("Device switched.");
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
        startHomePlaybackLongPoll();
        return;
      }
      startHomePlaybackLongPoll();
    } catch (error) {
      console.error("Home play toggle error", error);
      startHomePlaybackLongPoll();
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
