const playlistSelect = document.getElementById("playlist-select");
const playPlaylistBtn = document.getElementById("play-playlist-btn");
const loadPlaylistBtn = document.getElementById("load-playlist-btn");
const playlistStatus = document.getElementById("playlist-status");
const playlistHint = document.getElementById("playlist-hint");
const playlistSearchForm = document.getElementById("playlist-search-form");
const playlistSearchInput = document.getElementById("playlist-search-input");
const playlistSearchStatus = document.getElementById("playlist-search-status");
const playlistSearchResults = document.getElementById(
  "playlist-search-results"
);

const SESSION_PAGE = "session.html";
const PLAYLIST_KEY = "waiting_list_playlist";

let currentPlaylistId = null;

function setStatus(message, showSaving) {
  if (showSaving) {
    playlistStatus.innerHTML = '<span class="saving-badge">Saving...</span>';
    return;
  }
  playlistStatus.textContent = message || "";
}

function setHint(message) {
  playlistHint.textContent = message || "";
}

function setSearchStatus(message, showSaving) {
  if (!playlistSearchStatus) return;
  if (showSaving) {
    playlistSearchStatus.innerHTML =
      '<span class="saving-badge">Searching...</span>';
    return;
  }
  playlistSearchStatus.textContent = message || "";
}

function clearSearchResults() {
  if (!playlistSearchResults) return;
  playlistSearchResults.innerHTML = "";
}

function renderSearchResults(items) {
  if (!playlistSearchResults) return;
  playlistSearchResults.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "playlist-empty";
    empty.textContent = "No public playlists found.";
    playlistSearchResults.appendChild(empty);
    return;
  }

  items.forEach((playlist) => {
    const item = document.createElement("li");
    item.className = "playlist-card";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "playlist-load-btn";
    loadButton.setAttribute("aria-label", "Load playlist");
    loadButton.title = "Load playlist";
    loadButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 3a1 1 0 0 1 1 1v8.17l2.59-2.58a1 1 0 1 1 1.41 1.41l-4.3 4.3a1 1 0 0 1-1.4 0l-4.3-4.3a1 1 0 1 1 1.41-1.41L11 12.17V4a1 1 0 0 1 1-1z"></path>' +
      '<path d="M5 14a1 1 0 0 1 1 1v3h12v-3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z"></path>' +
      "</svg>";
    loadButton.addEventListener("click", () => {
      loadPlaylistById(playlist.id, playlist.name);
    });

    const cover = document.createElement("div");
    cover.className = "playlist-cover";
    const imageUrl =
      playlist.images && playlist.images[0] ? playlist.images[0].url : "";
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = playlist.name || "Playlist cover";
      cover.appendChild(img);
    } else {
      const fallback = document.createElement("span");
      fallback.textContent = "♪";
      cover.appendChild(fallback);
    }

    const body = document.createElement("div");
    body.className = "playlist-body";

    const title = document.createElement("h3");
    title.textContent = playlist.name || "Untitled playlist";

    const owner =
      playlist.owner && playlist.owner.display_name
        ? playlist.owner.display_name
        : "Spotify";
    const tracks =
      playlist.tracks && Number.isInteger(playlist.tracks.total)
        ? `${playlist.tracks.total} tracks`
        : "Playlist";
    const meta = document.createElement("p");
    meta.className = "playlist-meta";
    meta.textContent = `By ${owner} · ${tracks}`;

    const description = document.createElement("p");
    description.className = "playlist-desc";
    description.textContent =
      playlist.description || "No description available.";

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(description);

    item.appendChild(cover);
    item.appendChild(body);
    item.appendChild(loadButton);
    playlistSearchResults.appendChild(item);
  });
}

async function loadPlaylistById(playlistId, playlistName) {
  if (!playlistId) {
    setStatus("Select a playlist first.");
    setHint("Pick a playlist from the dropdown.");
    return;
  }

  currentPlaylistId = playlistId;
  localStorage.setItem(PLAYLIST_KEY, playlistId);
  if (playlistSelect && playlistSelect.options.length) {
    const match = Array.from(playlistSelect.options).find(
      (option) => option.value === playlistId
    );
    if (match) {
      playlistSelect.value = playlistId;
    }
  }

  try {
    setStatus("Loading playlist...", true);
    const response = await fetch("/api/queue/playlist/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlistId,
        playlistName: playlistName || ""
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Load playlist failed", response.status, text);
      setStatus("Unable to load playlist.");
      setHint("Check your Spotify connection and try again.");
      return;
    }

    const data = await response.json();
    const count = Array.isArray(data.tracks) ? data.tracks.length : 0;
    setStatus("Playlist loaded.");
    setHint(`Loaded ${count} track${count === 1 ? "" : "s"} from Spotify.`);
  } catch (error) {
    console.error("Load playlist error", error);
    setStatus("Unable to load playlist.");
    setHint("Try again once Spotify is connected.");
  }
}

async function selectActivePlaylist() {
  if (!currentPlaylistId) return;
  try {
    await fetch("/api/queue/playlist/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlistId: currentPlaylistId,
        playlistName: playlistSelect.options[playlistSelect.selectedIndex]
          ?.textContent
      })
    });
  } catch (error) {
    console.error("Playlist select error", error);
  }
}

async function loadPlaylistFromSpotify() {
  if (!currentPlaylistId) {
    setStatus("Select a playlist first.");
    setHint("Pick a playlist from the dropdown.");
    return;
  }

  const selectedName =
    playlistSelect.options[playlistSelect.selectedIndex]?.textContent || "";
  await loadPlaylistById(currentPlaylistId, selectedName);
}
async function fetchPlaylists() {
  try {
    setStatus("Loading playlists...", true);
    const response = await fetch("/api/playlists");
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = SESSION_PAGE;
        return;
      }
      const text = await response.text();
      console.error("Playlist fetch failed", response.status, text);
      setStatus("Unable to load playlists.");
      setHint("Connect Spotify on the Session page and try again.");
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
      setStatus("No playlists found.");
      setHint("Create a waiting list playlist to get started.");
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
    const selected = playlists.find((item) => item.id === stored)
      ? stored
      : playlists[0].id;

    playlistSelect.value = selected;
    currentPlaylistId = selected;
    localStorage.setItem(PLAYLIST_KEY, selected);
    await selectActivePlaylist();
    setStatus("Playlist selected.");
    setHint("Press start to begin playback on Spotify.");
  } catch (error) {
    console.error("Playlist fetch error", error);
    setStatus("Unable to load playlists.");
    setHint("Connect Spotify on the Session page and try again.");
  }
}

async function startPlaylistPlayback() {
  if (!currentPlaylistId) {
    setStatus("Select a playlist first.");
    setHint("Pick a playlist from the dropdown.");
    return;
  }

  try {
    setStatus("Starting playlist...", true);
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
      setStatus("Unable to start playback.");
      setHint("Make sure a Spotify device is active.");
      return;
    }

    setStatus("Playback started on Spotify.");
    setHint("Switch to the Waiting List page to manage tracks.");
  } catch (error) {
    console.error("Play playlist error", error);
    setStatus("Unable to start playback.");
    setHint("Try again once a Spotify device is active.");
  }
}

playlistSelect.addEventListener("change", async (event) => {
  currentPlaylistId = event.target.value;
  localStorage.setItem(PLAYLIST_KEY, currentPlaylistId);
  await selectActivePlaylist();
  setStatus("Playlist updated.");
  setHint("Press start to begin playback on Spotify.");
});

playPlaylistBtn.addEventListener("click", () => {
  startPlaylistPlayback();
});

if (loadPlaylistBtn) {
  loadPlaylistBtn.addEventListener("click", () => {
    loadPlaylistFromSpotify();
  });
}

async function initializePlaylist() {
  await window.authAPI.fetchUserStatus();
  fetchPlaylists();
}

initializePlaylist();

if (playlistSearchForm && playlistSearchInput) {
  setSearchStatus("Search for a playlist to see results.");

  playlistSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = playlistSearchInput.value.trim();
    if (!query) {
      setSearchStatus("Enter a search term to find playlists.");
      clearSearchResults();
      return;
    }

    try {
      setSearchStatus("Searching...", true);
      clearSearchResults();
      const response = await fetch(
        `/api/playlists/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = SESSION_PAGE;
          return;
        }
        const text = await response.text();
        console.error("Playlist search failed", response.status, text);
        setSearchStatus("Unable to search playlists.");
        return;
      }

      const data = await response.json();
      const items =
        data && data.playlists && Array.isArray(data.playlists.items)
          ? data.playlists.items
          : [];
      renderSearchResults(items);
      setSearchStatus(
        items.length
          ? `Showing ${items.length} playlist${items.length === 1 ? "" : "s"}.`
          : "No public playlists found."
      );
    } catch (error) {
      console.error("Playlist search error", error);
      setSearchStatus("Unable to search playlists.");
    }
  });
}
