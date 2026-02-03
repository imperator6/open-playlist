const playbackStatus = document.getElementById("playback-status");
const playbackHint = document.getElementById("playback-hint");
const nowPlaying = document.getElementById("now-playing");
const queueList = document.getElementById("queue-list");
const queueCardTemplate = document.getElementById("queue-card");
const queueStatus = document.getElementById("queue-status");
const queuePlacement = document.getElementById("queue-placement");
const playlistSelect = document.getElementById("playlist-select");
const playPlaylistBtn = document.getElementById("play-playlist-btn");
const searchForm = document.getElementById("queue-search-form");
const searchInput = document.getElementById("queue-search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const searchResults = document.getElementById("queue-results");
const searchTemplate = document.getElementById("search-card");

const REFRESH_INTERVAL_MS = 8000;
const SESSION_PAGE = "session.html";
const PLAYLIST_KEY = "waiting_list_playlist";

let currentPlaylistId = null;
let playlistTracks = [];
let isDragging = false;
let isReordering = false;
let placementTrack = null;
let defaultPlaylistId = null;
let currentPlaybackId = null;

function setQueueStatus(message, showSaving) {
  if (showSaving) {
    queueStatus.innerHTML = '<span class="saving-badge">Saving…</span>';
    return;
  }
  queueStatus.textContent = message || "";
}

function setPlacementMessage(message) {
  queuePlacement.textContent = message || "";
}

function formatArtists(artists = []) {
  return artists.map((artist) => artist.name).join(", ");
}

function parseTrack(track) {
  if (!track) return null;
  return {
    id: track.id,
    title: track.name,
    artist: formatArtists(track.artists),
    image: track.album?.images?.[0]?.url || "",
    album: track.album?.name || ""
  };
}

function createQueueCard(item, label, index, isPlaying) {
  const node = queueCardTemplate.content.cloneNode(true);
  const card = node.querySelector(".queue-card");
  const img = node.querySelector("img");
  const meta = node.querySelector(".meta");
  const title = node.querySelector("h3");
  const artist = node.querySelector(".artist");
  const actions = node.querySelector(".queue-actions");

  img.src = item.image;
  img.alt = item.title;
  meta.textContent = label;
  title.textContent = item.title;
  artist.textContent = item.artist;

  card.dataset.index = String(index);
  card.draggable = !placementTrack;
  card.classList.add("no-action");

  if (isPlaying) {
    card.classList.add("is-playing");
  }

  if (placementTrack) {
    card.classList.add("placement-mode");
    card.classList.remove("no-action");
    actions
      .querySelector('[data-action="before"]')
      .addEventListener("click", () => placeTrackAt(index, "before"));
    actions
      .querySelector('[data-action="after"]')
      .addEventListener("click", () => placeTrackAt(index, "after"));
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
  button.addEventListener("click", () => enterPlacementMode(item));

  return node;
}

function clearDropTargets() {
  document
    .querySelectorAll(".queue-card.drop-target")
    .forEach((card) => card.classList.remove("drop-target"));
}

function attachDragHandlers(card) {
  card.addEventListener("dragstart", (event) => {
    if (placementTrack) return;
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
    if (placementTrack) return;
    event.preventDefault();
    clearDropTargets();
    card.classList.add("drop-target");
    event.dataTransfer.dropEffect = "move";
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-target");
  });

  card.addEventListener("drop", (event) => {
    if (placementTrack) return;
    event.preventDefault();
    card.classList.remove("drop-target");
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    const toIndex = Number(card.dataset.index);
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;
    reorderPlaylist(fromIndex, toIndex);
  });
}

queueList.addEventListener("dragover", (event) => {
  if (placementTrack) return;
  event.preventDefault();
});

queueList.addEventListener("drop", (event) => {
  if (placementTrack) return;
  const targetCard = event.target.closest(".queue-card");
  if (targetCard) return;
  const fromIndex = Number(event.dataTransfer.getData("text/plain"));
  if (Number.isNaN(fromIndex)) return;
  reorderPlaylist(fromIndex, playlistTracks.length - 1);
});

function enterPlacementMode(item) {
  placementTrack = item;
  setPlacementMessage(
    `Choose where to add "${item.title}". Tap Add before/after on a track.`
  );
  renderPlaylist(playlistTracks);
}

function exitPlacementMode() {
  placementTrack = null;
  setPlacementMessage("");
  renderPlaylist(playlistTracks);
}

function renderPlayback(data) {
  const playback = data.playback;
  if (!playback || !playback.item) {
    currentPlaybackId = null;
    playbackStatus.textContent = "Paused";
    playbackStatus.style.color = "#ffd36a";
    playbackHint.textContent = "No active playback found.";
    nowPlaying.innerHTML =
      '<p class="subtle">Nothing is playing right now.</p>';
    return;
  }

  const status = playback.is_playing ? "Playing" : "Paused";
  playbackStatus.textContent = status;
  playbackStatus.style.color =
    status === "Playing" ? "var(--accent)" : "#ffd36a";
  playbackHint.textContent =
    status === "Playing"
      ? "Audio is live right now."
      : "Playback is currently paused.";

  const current = parseTrack(playback.item);
  currentPlaybackId = current?.id || null;
  nowPlaying.innerHTML = "";
  nowPlaying.appendChild(createQueueCard(current, "Now playing", 0, true));
}

function renderPlaylist(tracks) {
  queueList.innerHTML = "";
  if (!tracks.length) {
    if (placementTrack) {
      const emptyWrap = document.createElement("div");
      emptyWrap.className = "queue-empty";
      const text = document.createElement("p");
      text.className = "subtle";
      text.textContent = "Playlist is empty. Add the selected track to start.";
      const button = document.createElement("button");
      button.className = "ghost";
      button.type = "button";
      button.textContent = "Add to start";
      button.addEventListener("click", async () => {
        await addTrackToPlaylist(placementTrack.uri, 0);
        exitPlacementMode();
      });
      emptyWrap.appendChild(text);
      emptyWrap.appendChild(button);
      queueList.appendChild(emptyWrap);
      return;
    }
    queueList.innerHTML = '<p class="subtle">No tracks in this playlist.</p>';
    return;
  }

  tracks.forEach((item, index) => {
    const track = parseTrack(item.track);
    if (!track) return;
    const isNowPlaying = currentPlaybackId && track.id === currentPlaybackId;
    const label = isNowPlaying ? "Now playing" : `Next ${index + 1}`;
    queueList.appendChild(createQueueCard(track, label, index, isNowPlaying));
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
}

function clearSearchResults() {
  searchResults.innerHTML = "";
  searchInput.value = "";
  exitPlacementMode();
}

async function fetchPlayback() {
  try {
    const response = await fetch("/api/queue");
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playback fetch failed", response.status, text);
      playbackStatus.textContent = "Disconnected";
      playbackStatus.style.color = "#ff7a6c";
      playbackHint.textContent =
        "Connect Spotify on the Session page to load playback.";
      return;
    }

    const data = await response.json();
    renderPlayback(data);
  } catch (error) {
    console.error("Playback fetch error", error);
    playbackStatus.textContent = "Error";
    playbackStatus.style.color = "#ff7a6c";
    playbackHint.textContent = "Unable to load playback right now.";
  }
}

async function fetchDefaultPlaylistId() {
  try {
    const response = await fetch("/status");
    if (!response.ok) return;
    const data = await response.json();
    defaultPlaylistId = data.defaultPlaylistId || null;
  } catch (error) {
    console.error("Default playlist fetch error", error);
  }
}

async function fetchPlaylists() {
  try {
    setQueueStatus("Loading playlists…", true);
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
    playlistSelect.innerHTML = "";

    if (!playlists.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No playlists found";
      playlistSelect.appendChild(option);
      playlistSelect.disabled = true;
      setQueueStatus(
        "No playlists found. Create a waiting list playlist to get started."
      );
      return;
    }

    playlistSelect.disabled = false;
    playlists.forEach((playlist) => {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = playlist.name;
      playlistSelect.appendChild(option);
    });

    const stored = localStorage.getItem(PLAYLIST_KEY);
    let selected = null;
    if (defaultPlaylistId) {
      selected = playlists.find((item) => item.id === defaultPlaylistId)
        ? defaultPlaylistId
        : null;
    }
    if (!selected) {
      selected = playlists.find((item) => item.id === stored)
        ? stored
        : playlists[0].id;
    }

    playlistSelect.value = selected;
    currentPlaylistId = selected;
    localStorage.setItem(PLAYLIST_KEY, selected);
    await fetchPlaylistTracks(selected);
  } catch (error) {
    console.error("Playlist fetch error", error);
    setQueueStatus("Unable to load playlists.");
  }
}

async function fetchPlaylistTracks(playlistId) {
  if (!playlistId) return;
  try {
    const response = await fetch(`/api/playlists/${playlistId}/tracks`);
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playlist tracks fetch failed", response.status, text);
      setQueueStatus("Unable to load playlist tracks.");
      return;
    }

    const data = await response.json();
    playlistTracks = data.items || [];
    renderPlaylist(playlistTracks);
    setQueueStatus("Drag tracks to reorder. Changes sync to Spotify.");
  } catch (error) {
    console.error("Playlist tracks fetch error", error);
    setQueueStatus("Unable to load playlist tracks.");
  }
}

async function searchTracks(query) {
  if (!query.trim()) return;
  try {
    setQueueStatus("Searching tracks…", true);
    const response = await fetch(
      `/api/track-search?q=${encodeURIComponent(query)}`
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
      uri: track.uri,
      title: track.name,
      artist: formatArtists(track.artists),
      image: track.album?.images?.[0]?.url || ""
    }));

    renderSearchResults(tracks);
    setQueueStatus("Select a track to place.");
  } catch (error) {
    console.error("Track search error", error);
    setQueueStatus("Unable to search tracks.");
  }
}

async function addTrackToPlaylist(uri, position) {
  if (!currentPlaylistId || !uri) return;
  try {
    setQueueStatus("Adding track…", true);
    const response = await fetch(`/api/playlists/${currentPlaylistId}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [uri], position })
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Add track failed", response.status, text);
      setQueueStatus("Unable to add track.");
      return;
    }

    await fetchPlaylistTracks(currentPlaylistId);
    setQueueStatus("Track added.");
  } catch (error) {
    console.error("Add track error", error);
    setQueueStatus("Unable to add track.");
  }
}

async function placeTrackAt(index, placement) {
  if (!placementTrack) return;
  const position = placement === "before" ? index : index + 1;
  await addTrackToPlaylist(placementTrack.uri, position);
  exitPlacementMode();
}

async function startPlaylistPlayback() {
  if (!currentPlaylistId) {
    setQueueStatus("Select a playlist first.");
    return;
  }

  try {
    setQueueStatus("Starting playlist…", true);
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

function calculateInsertBefore(fromIndex, toIndex) {
  if (fromIndex < toIndex) {
    return toIndex + 1;
  }
  return toIndex;
}

async function reorderPlaylist(fromIndex, toIndex) {
  if (isReordering || fromIndex === toIndex || !currentPlaylistId) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= playlistTracks.length || toIndex >= playlistTracks.length) {
    return;
  }

  isReordering = true;
  setQueueStatus("Updating order…", true);
  const insertBefore = calculateInsertBefore(fromIndex, toIndex);

  try {
    const response = await fetch(
      `/api/playlists/${currentPlaylistId}/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          range_start: fromIndex,
          insert_before: insertBefore
        })
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playlist reorder failed", response.status, text);
      setQueueStatus("Unable to update order.");
      return;
    }

    await fetchPlaylistTracks(currentPlaylistId);
    setQueueStatus("Order updated.");
  } catch (error) {
    console.error("Playlist reorder error", error);
    setQueueStatus("Unable to update order.");
  } finally {
    isReordering = false;
  }
}

playlistSelect.addEventListener("change", async (event) => {
  currentPlaylistId = event.target.value;
  localStorage.setItem(PLAYLIST_KEY, currentPlaylistId);
  await fetchPlaylistTracks(currentPlaylistId);
});

playPlaylistBtn.addEventListener("click", () => {
  startPlaylistPlayback();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  searchTracks(query);
});

clearSearchBtn.addEventListener("click", () => {
  clearSearchResults();
  setQueueStatus("Showing waiting list.");
});

fetchPlayback();
fetchDefaultPlaylistId().then(fetchPlaylists);
setInterval(async () => {
  await fetchPlayback();
  if (currentPlaylistId && !isDragging && !isReordering && !placementTrack) {
    await fetchPlaylistTracks(currentPlaylistId);
  }
}, REFRESH_INTERVAL_MS);
