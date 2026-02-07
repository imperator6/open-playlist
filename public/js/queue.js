const playbackStatus = document.getElementById("playback-status");
const playbackHint = document.getElementById("playback-hint");
const nowPlaying = document.getElementById("now-playing");
const queueList = document.getElementById("queue-list");
const queueCardTemplate = document.getElementById("queue-card");
const queueStatus = document.getElementById("queue-status");
const queueError = document.getElementById("queue-error");
const queuePlacement = document.getElementById("queue-placement");
const playlistSelect = document.getElementById("playlist-select");
const playPlaylistBtn = document.getElementById("play-playlist-btn");
const searchForm = document.getElementById("queue-search-form");
const autoPlayToggle = document.getElementById("autoplay-toggle");
const deviceSelect = document.getElementById("device-select");
const deviceStatus = document.getElementById("device-status");
const searchInput = document.getElementById("queue-search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const searchResults = document.getElementById("queue-results");
const searchTemplate = document.getElementById("search-card");
const queueOverlay = document.getElementById("queue-overlay");
const queueOverlayClose = document.getElementById("queue-overlay-close");
const queueConfirmModal = document.getElementById("queue-confirm-modal");
const queueConfirmTitle = document.getElementById("queue-confirm-title");
const queueConfirmMessage = document.getElementById("queue-confirm-message");
const queueConfirmClose = document.getElementById("queue-confirm-close");
const queueConfirmCancel = document.getElementById("queue-confirm-cancel");
const queueConfirmAccept = document.getElementById("queue-confirm-accept");

const REFRESH_INTERVAL_MS = 8000;
const SESSION_PAGE = "session.html";
const PLAYLIST_KEY = "waiting_list_playlist";
const SEARCH_RESULTS_PAGE_SIZE = 12;

let currentPlaylistId = null;
let playlistTracks = [];
let isDragging = false;
let isReordering = false;
let currentPlaybackId = null;
let autoPlayEnabled = true;
let lastPlaybackIsPlaying = false;
let remainingTimerId = null;
let remainingState = null;
let lastRemainingText = "";
let selectedDeviceId = null;
let playbackSince = null;
let devicesSince = null;
let lastOverlayTrigger = null;
let pendingInsertIndex = null;
let pendingInsertLabel = "";
let queueConfirmResolver = null;
let queueConfirmLastFocus = null;
let currentSearchQuery = "";
let currentSearchOffset = 0;
let currentSearchTracks = [];
let hasMoreSearchResults = false;

function resolveQueueConfirm(result) {
  if (queueConfirmResolver) {
    const resolver = queueConfirmResolver;
    queueConfirmResolver = null;
    resolver(result);
  }
}

function closeQueueConfirmDialog(confirmed) {
  if (!queueConfirmModal) {
    resolveQueueConfirm(Boolean(confirmed));
    return;
  }
  queueConfirmModal.classList.remove("is-open");
  queueConfirmModal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.is-open")) {
    document.body.classList.remove("modal-open");
  }
  if (queueConfirmLastFocus && typeof queueConfirmLastFocus.focus === "function") {
    queueConfirmLastFocus.focus();
  }
  queueConfirmLastFocus = null;
  resolveQueueConfirm(Boolean(confirmed));
}

function openQueueConfirmDialog(options = {}) {
  const title = options.title || "Confirm action";
  const message = options.message || "Are you sure you want to continue?";
  const confirmLabel = options.confirmLabel || "Confirm";
  const confirmVariant = options.confirmVariant === "danger" ? "danger" : "primary";

  if (
    !queueConfirmModal ||
    !queueConfirmTitle ||
    !queueConfirmMessage ||
    !queueConfirmAccept
  ) {
    return Promise.resolve(window.confirm(message));
  }

  if (queueConfirmResolver) {
    closeQueueConfirmDialog(false);
  }

  queueConfirmLastFocus =
    document.activeElement && typeof document.activeElement.focus === "function"
      ? document.activeElement
      : null;

  queueConfirmTitle.textContent = title;
  queueConfirmMessage.textContent = message;
  queueConfirmAccept.textContent = confirmLabel;
  queueConfirmAccept.classList.remove("primary", "danger");
  queueConfirmAccept.classList.add(confirmVariant);

  queueConfirmModal.classList.add("is-open");
  queueConfirmModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    queueConfirmAccept.focus();
  });

  return new Promise((resolve) => {
    queueConfirmResolver = resolve;
  });
}

function setQueueStatus(message, showSaving) {
  if (showSaving) {
    queueStatus.innerHTML = '<span class="saving-badge">Saving...</span>';
    return;
  }
  queueStatus.textContent = message || "";
}

function setPlacementMessage(message) {
  queuePlacement.textContent = message || "";
}

function setQueueError(message) {
  if (!queueError) return;
  queueError.textContent = message || "";
}

function openSearchOverlay(trigger) {
  if (!queueOverlay) return;
  queueOverlay.classList.add("is-open");
  queueOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");
  lastOverlayTrigger = trigger || null;
  if (trigger && trigger.dataset && trigger.dataset.index !== undefined) {
    const index = Number(trigger.dataset.index);
    if (!Number.isNaN(index)) {
      pendingInsertIndex = index + 1;
      pendingInsertLabel = trigger.dataset.title
        ? `After "${trigger.dataset.title}"`
        : "After selected track";
    }
  } else {
    pendingInsertIndex = playlistTracks.length;
    pendingInsertLabel = "At the end of the list";
  }
  setPlacementMessage(`Inserting: ${pendingInsertLabel}`);
  if (searchInput) {
    requestAnimationFrame(() => {
      searchInput.focus();
    });
  }
}

function closeSearchOverlay() {
  if (!queueOverlay) return;
  queueOverlay.classList.remove("is-open");
  queueOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-open");
  setPlacementMessage("");
  pendingInsertIndex = null;
  pendingInsertLabel = "";
  if (lastOverlayTrigger && typeof lastOverlayTrigger.focus === "function") {
    lastOverlayTrigger.focus();
  }
}
function renderAutoplayState(enabled) {
  if (!autoPlayToggle) return;
  autoPlayToggle.checked = enabled;
}

function setDeviceStatus(message) {
  if (!deviceStatus) return;
  deviceStatus.textContent = message || "";
}

function renderDeviceOptions(devices, activeId, preferredId) {
  if (!deviceSelect) return;
  deviceSelect.innerHTML = "";
  if (!devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No devices found";
    deviceSelect.appendChild(option);
    deviceSelect.disabled = true;
    setDeviceStatus("Open Spotify on a device to enable playback.");
    return;
  }

  const effectivePreferred = preferredId || selectedDeviceId || activeId;
  devices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = device.name;
    if (device.id === effectivePreferred) {
      option.selected = true;
    }
    deviceSelect.appendChild(option);
  });
  deviceSelect.disabled = false;
  setDeviceStatus("");
}

async function startDevicesLongPoll() {
  if (!deviceSelect) return;
  try {
    const query = devicesSince ? `?since=${encodeURIComponent(devicesSince)}` : "";
    const response = await fetch(`/api/player/devices/stream${query}`);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Devices stream failed", response.status, text);
      setDeviceStatus("Unable to load devices.");
      setTimeout(startDevicesLongPoll, 2000);
      return;
    }

    const data = await response.json();
    devicesSince = data.updatedAt || new Date().toISOString();
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const active = devices.find((device) => device.is_active);
    const preferred = data.preferredDeviceId || (active ? active.id : null);
    if (preferred && selectedDeviceId !== preferred) {
      selectedDeviceId = preferred;
    }
    renderDeviceOptions(devices, active ? active.id : null, preferred);
    startDevicesLongPoll();
  } catch (error) {
    console.error("Devices stream error", error);
    setTimeout(startDevicesLongPoll, 2000);
  }
}

async function updateAutoplayState(enabled) {
  try {
    const response = await fetch("/api/queue/autoplay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Autoplay update failed", response.status, text);
      return false;
    }

    const data = await response.json();
    autoPlayEnabled = Boolean(data.autoPlayEnabled);
    renderAutoplayState(autoPlayEnabled);
    return true;
  } catch (error) {
    console.error("Autoplay update error", error);
    return false;
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return "";

  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function formatRemainingTime(playback, currentItem) {
  if (!playback || !currentItem) return "";
  const durationMs = currentItem.duration_ms;
  const progressMs = playback.progress_ms;
  if (typeof durationMs !== "number" || typeof progressMs !== "number") {
    return "";
  }
  const remainingMs = Math.max(0, durationMs - progressMs);
  return formatRemainingFromMs(remainingMs);
}

function formatRemainingFromMs(remainingMs) {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (remainingSeconds < 60) {
    return `${remainingSeconds}`;
  }
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateRemainingDisplay() {
  if (!remainingState) return;
  const meta = nowPlaying ? nowPlaying.querySelector(".queue-card .meta") : null;
  let remainingMs = remainingState.remainingMs;
  if (remainingState.isPlaying) {
    const elapsed = Date.now() - remainingState.startedAt;
    remainingMs = Math.max(0, remainingState.remainingMs - elapsed);
  }
  const remainingText = formatRemainingFromMs(remainingMs);
  if (meta) {
    meta.textContent = remainingText
      ? `${remainingState.label} - ${remainingText}`
      : remainingState.label;
  }
  if (currentPlaybackId) {
    const activeMeta = document.querySelector(
      `.queue-list .queue-card.is-current .meta`
    );
    if (activeMeta) {
      const activeLabel = "Now playing";
      activeMeta.textContent = remainingText
        ? `${activeLabel} - ${remainingText}`
        : activeLabel;
    }
  }
}
function formatArtists(artists = []) {
  return artists.map((artist) => artist.name).join(", ");
}

function parseTrack(track) {
  if (!track) return null;
  const title = track.name || track.title || "";
  const artist = track.artists
    ? formatArtists(track.artists)
    : track.artist || "";
  return {
    id: track.id,
    uri: track.uri,
    title,
    artist,
    image: track.album?.images?.[0]?.url || track.image || "",
    album: track.album?.name || track.album || "",
    source: track.source || null,
    duration_ms: track.duration_ms || null,
    addedTimestamp: track.addedTimestamp || null,
    addedBy: track.addedBy || null
  };
}

function createQueueCard(item, label, index, isPlaying, remainingText) {
  const node = queueCardTemplate.content.cloneNode(true);
  const card = node.querySelector(".queue-card");
  const cover = node.querySelector(".cover");
  const img = node.querySelector("img");
  const meta = node.querySelector(".meta");
  const title = node.querySelector("h3");
  const artist = node.querySelector(".artist");
  const playButton = node.querySelector('[data-action="play"]');
  const removeButton = node.querySelector('[data-action="remove"]');
  const insertButton = node.querySelector(".queue-insert");
  const userBadge = node.querySelector(".queue-user-badge");
  const userName = node.querySelector(".queue-user-name");
  const userTime = node.querySelector(".queue-user-time");

  img.src = item.image;
  img.alt = item.title;
  meta.textContent = remainingText ? `${label} - ${remainingText}` : label;
  title.textContent = item.title;
  artist.textContent = item.artist;

  card.dataset.index = String(index);
  card.draggable = true;
  card.classList.add("no-action");
  if (item.source === "user") {
    card.classList.add("is-user");
    if (userName && item.addedBy) {
      userName.textContent = item.addedBy.name || "Unknown";
    }
    if (userTime && item.addedTimestamp) {
      const relativeTime = formatRelativeTime(item.addedTimestamp);
      userTime.textContent = relativeTime ? ` · ${relativeTime}` : "";
    }
  }

  if (isPlaying) {
    card.classList.add("is-playing");
    if (cover) {
      const activity = document.createElement("span");
      activity.className = "activity";
      activity.setAttribute("aria-hidden", "true");
      card.insertBefore(activity, cover);
    }
  }

  if (label === "Now playing") {
    card.classList.add("is-current");
    if (playButton) {
      playButton.remove();
    }
    if (removeButton) {
      removeButton.remove();
    }
  }

  if (removeButton) {
    const currentUser = window.authAPI ? window.authAPI.getCurrentUser() : null;
    const isOwner = item.addedBy && currentUser && item.addedBy.sessionId === currentUser.sessionId;
    const isAdmin = currentUser && currentUser.role === "admin";
    const canRemove = isOwner || isAdmin;

    if (!canRemove) {
      removeButton.remove();
    } else {
      const icon = removeButton.querySelector(".icon");
      if (icon) {
        icon.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M7 7l10 10M17 7l-10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>' +
          "</svg>";
      }
      removeButton.addEventListener("click", () => {
        openQueueConfirmDialog({
          title: "Remove track?",
          message: `Remove "${item.title}" from the waiting list?`,
          confirmLabel: "Remove",
          confirmVariant: "danger"
        }).then((confirmed) => {
          if (!confirmed) return;
          removeTrackAt(index);
        });
      });
    }
  }

  if (playButton) {
    const currentUser = window.authAPI ? window.authAPI.getCurrentUser() : null;
    const isAdmin = currentUser && currentUser.role === "admin";

    if (!isAdmin) {
      playButton.remove();
    } else {
      playButton.addEventListener("click", () => {
        if (!item.uri) return;
        openQueueConfirmDialog({
          title: "Play this track now?",
          message: `Start "${item.title}" immediately on Spotify?`,
          confirmLabel: "Play now"
        }).then((confirmed) => {
          if (!confirmed) return;
          playSingleTrack(item.uri, item.id);
        });
      });
    }
  }

  if (insertButton) {
    insertButton.dataset.index = String(index);
    insertButton.dataset.title = item.title || "";
  }

  attachDragHandlers(card);

  return node;
}

function createSearchCard(item) {
  const node = searchTemplate.content.cloneNode(true);
  const card = node.querySelector(".queue-card");
  const img = node.querySelector("img");
  const meta = node.querySelector(".meta");
  const title = node.querySelector("h3");
  const artist = node.querySelector(".artist");
  const button = node.querySelector("button");

  img.src = item.image;
  img.alt = item.title;
  meta.textContent = "Track";
  title.textContent = item.title;
  artist.textContent = item.artist;

  card.classList.remove("no-action");
  button.textContent = "Place";
  button.addEventListener("click", () => {
    addTrackToPlaylist(item, pendingInsertIndex);
  });

  return node;
}

function clearDropTargets() {
  document
    .querySelectorAll(".queue-card.drop-target")
    .forEach((card) => card.classList.remove("drop-target"));
}

function attachDragHandlers(card) {
  card.addEventListener("dragstart", (event) => {
    isDragging = true;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.index);
  });

  card.addEventListener("dragend", () => {
    isDragging = false;
    card.classList.remove("dragging");
    clearDropTargets();
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    clearDropTargets();
    card.classList.add("drop-target");
    event.dataTransfer.dropEffect = "move";
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("drop-target");
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    const toIndex = Number(card.dataset.index);
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;
    reorderPlaylist(fromIndex, toIndex);
  });
}

queueList.addEventListener("dragover", (event) => {
  event.preventDefault();
});

queueList.addEventListener("drop", (event) => {
  const targetCard = event.target.closest(".queue-card");
  if (targetCard) return;
  const fromIndex = Number(event.dataTransfer.getData("text/plain"));
  if (Number.isNaN(fromIndex)) return;
  reorderPlaylist(fromIndex, playlistTracks.length - 1);
});

function renderPlayback(data) {
  const playback = data.playback;
  const queuePlayback = data.queue?.currently_playing || null;
  const currentItem = playback?.item || queuePlayback;
  if (autoPlayToggle && typeof data.autoPlayEnabled === "boolean") {
    autoPlayToggle.checked = data.autoPlayEnabled;
  }

  if (!currentItem) {
    currentPlaybackId = null;
    if (playbackStatus) {
      playbackStatus.textContent = "Paused";
      playbackStatus.style.color = "#ffd36a";
    }
    if (playbackHint) {
      playbackHint.textContent = "No active playback found.";
    }
    if (nowPlaying) {
      nowPlaying.innerHTML =
        '<p class="subtle">Nothing is playing right now.</p>';
    }
    if (remainingTimerId) {
      clearInterval(remainingTimerId);
      remainingTimerId = null;
    }
    remainingState = null;
    return;
  }

  const isPlaying =
    typeof playback?.is_playing === "boolean"
      ? playback.is_playing
      : Boolean(data.queue && data.queue.is_playing);
  lastPlaybackIsPlaying = isPlaying;
  const status = isPlaying ? "Playing" : "Paused";
  if (playbackStatus) {
    playbackStatus.textContent = status;
    playbackStatus.style.color =
      status === "Playing" ? "var(--accent)" : "#ffd36a";
  }
  if (playbackHint) {
    playbackHint.textContent = isPlaying
      ? "Audio is live right now."
      : "Playback is currently paused.";
  }

  const current = parseTrack(currentItem);
  currentPlaybackId = current?.id || null;
  if (nowPlaying) {
    nowPlaying.innerHTML = "";
  }
  const remainingText = formatRemainingTime(playback, currentItem);
  lastRemainingText = remainingText || "";
  if (nowPlaying) {
    nowPlaying.appendChild(
      createQueueCard(current, "Now playing", 0, isPlaying, remainingText)
    );
  }
  if (remainingTimerId) {
    clearInterval(remainingTimerId);
    remainingTimerId = null;
  }
  const durationMs =
    typeof currentItem.duration_ms === "number" ? currentItem.duration_ms : null;
  const progressMs =
    typeof playback?.progress_ms === "number" ? playback.progress_ms : null;
  if (durationMs !== null && progressMs !== null) {
    remainingState = {
      label: "Now playing",
      remainingMs: Math.max(0, durationMs - progressMs),
      isPlaying,
      startedAt: Date.now()
    };
    updateRemainingDisplay();
    remainingTimerId = setInterval(() => {
      updateRemainingDisplay();
    }, 1000);
  } else {
    remainingState = null;
  }
}

function formatTimelineBadge(ms) {
  if (typeof ms !== "number" || ms < 0) return null;
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderPlaylist(tracks) {
  queueList.innerHTML = "";
  if (!tracks.length) {
    queueList.innerHTML = '<p class="subtle">No tracks in this playlist.</p>';
    return;
  }

  let cumulativeMs = 0;
  let cumulativeValid = false;

  tracks.forEach((item, index) => {
    const source = item.track ? item.track : item;
    const track = parseTrack(source);
    if (!track) return;
    const isNowPlaying = currentPlaybackId && track.id === currentPlaybackId;
    const label = isNowPlaying ? "Now playing" : `Next ${index + 1}`;

    const node = createQueueCard(
      track,
      label,
      index,
      isNowPlaying && lastPlaybackIsPlaying,
      isNowPlaying ? lastRemainingText : ""
    );
    if (isNowPlaying && !lastPlaybackIsPlaying) {
      const card = node.querySelector(".queue-card");
      if (card) {
        card.classList.add("is-current");
      }
    }

    if (index === 0) {
      if (remainingState && typeof remainingState.remainingMs === "number") {
        let remaining = remainingState.remainingMs;
        if (remainingState.isPlaying) {
          remaining = Math.max(0, remaining - (Date.now() - remainingState.startedAt));
        }
        cumulativeMs = remaining;
        cumulativeValid = true;
      } else if (typeof track.duration_ms === "number") {
        cumulativeMs = track.duration_ms;
        cumulativeValid = true;
      }
    } else {
      if (typeof track.duration_ms === "number" && cumulativeValid) {
        cumulativeMs += track.duration_ms;
      }
    }

    const timelineTime = node.querySelector(".queue-timeline-time");
    if (timelineTime) {
      const timeText = cumulativeValid ? formatTimelineBadge(cumulativeMs) : null;
      timelineTime.textContent = timeText || "";
    }

    queueList.appendChild(node);
  });
}

function renderSearchResults(tracks) {
  searchResults.innerHTML = "";
  if (!tracks.length) {
    searchResults.innerHTML = '<p class="subtle">No tracks found.</p>';
    return;
  }

  tracks.forEach((track) => {
    const card = createSearchCard(track);
    searchResults.appendChild(card);
  });

  // Add "Show More" button if there are more results
  if (hasMoreSearchResults) {
    const showMoreBtn = document.createElement("button");
    showMoreBtn.className = "ghost show-more-btn";
    showMoreBtn.type = "button";
    showMoreBtn.textContent = "Show More";
    showMoreBtn.addEventListener("click", () => {
      const nextOffset = currentSearchOffset + SEARCH_RESULTS_PAGE_SIZE;
      searchTracks(currentSearchQuery, nextOffset);
    });
    searchResults.appendChild(showMoreBtn);
  }
}

function clearSearchResultsView() {
  searchResults.innerHTML = "";
}
function clearSearchResults() {
  searchResults.innerHTML = "";
  searchInput.value = "";
  currentSearchQuery = "";
  currentSearchOffset = 0;
  currentSearchTracks = [];
  hasMoreSearchResults = false;
}

async function removeTrackAt(index) {
  if (!Number.isInteger(index)) return;
  try {
    setQueueStatus("Removing track...", true);
    const response = await fetch("/api/queue/playlist/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Remove track failed", response.status, text);
      setQueueStatus("Unable to remove track.");
      return;
    }

    const data = await response.json();
    playlistTracks = data.tracks || [];
    renderPlaylist(playlistTracks);
    setQueueStatus("Track removed.");
  } catch (error) {
    console.error("Remove track error", error);
    setQueueStatus("Unable to remove track.");
  }
}

async function startPlaybackLongPoll() {
  try {
    const query = playbackSince ? `?since=${encodeURIComponent(playbackSince)}` : "";
    const response = await fetch(`/api/queue/stream${query}`);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playback stream failed", response.status, text);
      if (playbackStatus) {
        playbackStatus.textContent = "Disconnected";
        playbackStatus.style.color = "#ff7a6c";
      }
      if (playbackHint) {
        playbackHint.textContent =
          "Connect Spotify on the Session page to load playback.";
      }
      setTimeout(startPlaybackLongPoll, 2000);
      return;
    }

    const data = await response.json();
    playbackSince = data.updatedAt || new Date().toISOString();
    renderPlayback(data);
    startPlaybackLongPoll();
  } catch (error) {
    console.error("Playback stream error", error);
    setTimeout(startPlaybackLongPoll, 2000);
  }
}

async function fetchPlaylists() {
  if (!playlistSelect) {
    await fetchPlaylistTracks();
    return;
  }
  try {
    setQueueStatus("Loading playlists...", true);
    const response = await fetch("/api/playlists");
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playlist fetch failed", response.status, text);
      setQueueStatus("Unable to load playlists.");
      return;
    }

    const data = await response.json();
    const playlists = data.items || [];
    if (playlistSelect) {
      playlistSelect.innerHTML = "";
    }

    if (!playlists.length) {
      if (playlistSelect) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No playlists found";
        playlistSelect.appendChild(option);
        playlistSelect.disabled = true;
      }
      setQueueStatus(
        "No playlists found. Create a waiting list playlist to get started."
      );
      return;
    }

    if (playlistSelect) {
      playlistSelect.disabled = false;
      playlists.forEach((playlist) => {
        const option = document.createElement("option");
        option.value = playlist.id;
        option.textContent = playlist.name;
        playlistSelect.appendChild(option);
      });
    }

    const stored = localStorage.getItem(PLAYLIST_KEY);
    const selected = playlists.find((item) => item.id === stored)
      ? stored
      : playlists[0].id;

    if (playlistSelect) {
      playlistSelect.value = selected;
    }
    currentPlaylistId = selected;
    localStorage.setItem(PLAYLIST_KEY, selected);
    await fetchPlaylistTracks();
  } catch (error) {
    console.error("Playlist fetch error", error);
    setQueueStatus("Unable to load playlists.");
  }
}

async function fetchPlaylistTracks() {
  try {
    const response = await fetch("/api/queue/playlist");
    if (!response.ok) {
      const text = await response.text();
      console.error("Playlist tracks fetch failed", response.status, text);
      setQueueStatus("Unable to load playlist tracks.");
      return;
    }

    const data = await response.json();
    currentPlaylistId = data.playlistId || null;
    playlistTracks = data.tracks || [];
    autoPlayEnabled = Boolean(data.autoPlayEnabled);
    renderAutoplayState(autoPlayEnabled);
    selectedDeviceId = data.activeDeviceId || null;
    if (data.lastError && data.lastError.message) {
      setQueueError(`Auto-play error: ${data.lastError.message}`);
    } else {
      setQueueError("");
    }
    renderPlaylist(playlistTracks);
    if (!currentPlaylistId) {
      setQueueStatus("Select and load a playlist on the Playlist page.");
      return;
    }
    setQueueStatus("Drag tracks to reorder. Changes sync to all sessions.");
  } catch (error) {
    console.error("Playlist tracks fetch error", error);
    setQueueStatus("Unable to load playlist tracks.");
  }
}

async function searchTracks(query, offset = 0) {
  if (!query.trim()) return;
  try {
    setQueueStatus("Searching tracks...", true);
    const response = await fetch(
      `/api/track-search?q=${encodeURIComponent(query)}&offset=${offset}`
    );
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Track search failed", response.status, text);
      setQueueStatus("Unable to search tracks.");
      return;
    }

    const data = await response.json();
    const tracks = (data.tracks?.items || []).map((track) => ({
      id: track.id,
      uri: track.uri,
      title: track.name,
      artist: formatArtists(track.artists),
      image: track.album?.images?.[0]?.url || "",
      album: track.album?.name || "",
      duration_ms: track.duration_ms || null
    }));

    // Track pagination state
    currentSearchQuery = query;
    currentSearchOffset = offset;
    
    // Determine if there are more results
    const total = data.tracks?.total || 0;
    hasMoreSearchResults = (offset + tracks.length) < total;

    if (offset === 0) {
      // New search - replace results
      currentSearchTracks = tracks;
      renderSearchResults(currentSearchTracks);
    } else {
      // Load more - append results
      currentSearchTracks = [...currentSearchTracks, ...tracks];
      renderSearchResults(currentSearchTracks);
    }

    setQueueStatus("Select a track to place.");
  } catch (error) {
    console.error("Track search error", error);
    setQueueStatus("Unable to search tracks.");
  }
}

async function addTrackToPlaylist(track, position) {
  if (!currentPlaylistId) {
    setQueueStatus("Select and load a playlist on the Playlist page.");
    return;
  }
  if (!track || !track.uri) return;

  if (window.authAPI) {
    const userName = await window.authAPI.ensureUserHasName();
    if (!userName) {
      setQueueStatus("Name is required to add tracks.");
      return;
    }
  }

  const effectivePosition =
    typeof position === "number" && position >= 0
      ? Math.min(position, playlistTracks.length)
      : playlistTracks.length;
  try {
    setQueueStatus("Adding track...", true);
    const response = await fetch("/api/queue/playlist/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track,
        position: effectivePosition
      })
    });

    if (!response.ok) {
      const data = await response.json();
      const errorMessage = data.error || "Unable to add track.";
      console.error("Add track failed", response.status, errorMessage);
      setQueueStatus(errorMessage);

      if (response.status === 400 && errorMessage.includes("name")) {
        if (window.authAPI) {
          const userName = await window.authAPI.openNamePrompt();
          if (userName) {
            return addTrackToPlaylist(track, position);
          }
        }
      }
      return;
    }

    const data = await response.json();
    playlistTracks = data.tracks || [];
    renderPlaylist(playlistTracks);
    setQueueStatus("Track added.");
    clearSearchResults();
    closeSearchOverlay();
  } catch (error) {
    console.error("Add track error", error);
    setQueueStatus("Unable to add track.");
  }
}

async function playSingleTrack(uri, trackId) {
  if (!uri) return;
  try {
    setQueueStatus("Starting track...", true);
    const response = await fetch("/api/track-play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri, trackId })
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Play track failed", response.status, text);
      setQueueStatus("Unable to start track.");
      return;
    }

    setQueueStatus("Playback started on Spotify.");
  } catch (error) {
    console.error("Play track error", error);
    setQueueStatus("Unable to start track.");
  }
}

async function startPlaylistPlayback() {
  if (!currentPlaylistId) {
    setQueueStatus("Select a playlist first.");
    return;
  }

  try {
    setQueueStatus("Starting playlist...", true);
    const response = await fetch(`/api/playlists/${currentPlaylistId}/play`, {
      method: "POST"
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Play playlist failed", response.status, text);
      setQueueStatus(
        "Unable to start playback. Make sure a Spotify device is active."
      );
      return;
    }

    setQueueStatus("Playback started on Spotify.");
  } catch (error) {
    console.error("Play playlist error", error);
    setQueueStatus("Unable to start playback.");
  }
}

async function reorderPlaylist(fromIndex, toIndex) {
  if (isReordering || fromIndex === toIndex || !currentPlaylistId) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= playlistTracks.length || toIndex >= playlistTracks.length) {
    return;
  }

  isReordering = true;
  setQueueStatus("Updating order...", true);

  try {
    const response = await fetch("/api/queue/playlist/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromIndex,
        toIndex
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Playlist reorder failed", response.status, text);
      setQueueStatus("Unable to update order.");
      return;
    }

    const data = await response.json();
    playlistTracks = data.tracks || [];
    renderPlaylist(playlistTracks);
    setQueueStatus("Order updated.");
  } catch (error) {
    console.error("Playlist reorder error", error);
    setQueueStatus("Unable to update order.");
  } finally {
    isReordering = false;
  }
}

if (playlistSelect) {
  playlistSelect.addEventListener("change", async (event) => {
    currentPlaylistId = event.target.value;
    localStorage.setItem(PLAYLIST_KEY, currentPlaylistId);
    await fetchPlaylistTracks();
  });
}

if (playPlaylistBtn) {
  playPlaylistBtn.addEventListener("click", () => {
    startPlaylistPlayback();
  });
}


if (autoPlayToggle) {
  autoPlayToggle.addEventListener("change", async (event) => {
    const target = event.target;
    await updateAutoplayState(Boolean(target.checked));
  });
}

if (deviceSelect) {
  deviceSelect.addEventListener("change", async (event) => {
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
        console.error("Device transfer failed", response.status, text);
        setDeviceStatus("Unable to switch device.");
        return;
      }

      selectedDeviceId = deviceId;
      setDeviceStatus("Device switched.");
    } catch (error) {
      console.error("Device transfer error", error);
      setDeviceStatus("Unable to switch device.");
    }
  });
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  searchTracks(query);
});

clearSearchBtn.addEventListener("click", () => {
  clearSearchResults();
  setQueueStatus("Showing waiting list.");
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-open-search]");
  if (!target) return;
  event.preventDefault();
  openSearchOverlay(target);
});

if (queueOverlayClose) {
  queueOverlayClose.addEventListener("click", () => {
    closeSearchOverlay();
  });
}

if (queueOverlay) {
  queueOverlay.addEventListener("click", (event) => {
    if (event.target === queueOverlay) {
      closeSearchOverlay();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && queueConfirmModal && queueConfirmModal.classList.contains("is-open")) {
    closeQueueConfirmDialog(false);
    return;
  }
  if (event.key !== "Escape") return;
  if (!queueOverlay || !queueOverlay.classList.contains("is-open")) return;
  closeSearchOverlay();
});

if (queueConfirmClose) {
  queueConfirmClose.addEventListener("click", () => {
    closeQueueConfirmDialog(false);
  });
}

if (queueConfirmCancel) {
  queueConfirmCancel.addEventListener("click", () => {
    closeQueueConfirmDialog(false);
  });
}

if (queueConfirmAccept) {
  queueConfirmAccept.addEventListener("click", () => {
    closeQueueConfirmDialog(true);
  });
}

if (queueConfirmModal) {
  queueConfirmModal.addEventListener("click", (event) => {
    if (event.target === queueConfirmModal) {
      closeQueueConfirmDialog(false);
    }
  });
}

async function initializeQueue() {
  if (window.authAPI) {
    await window.authAPI.fetchUserStatus();
  }
  startPlaybackLongPoll();
  fetchPlaylists();
  startDevicesLongPoll();
  setInterval(() => {
    // Device updates are now long-polled.
  }, 15000);
  setInterval(async () => {
    if (!isDragging && !isReordering) {
      await fetchPlaylistTracks();
    }
  }, REFRESH_INTERVAL_MS);
}

initializeQueue();
