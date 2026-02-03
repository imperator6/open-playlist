const playlistSelect = document.getElementById("playlist-select");
const playPlaylistBtn = document.getElementById("play-playlist-btn");
const playlistStatus = document.getElementById("playlist-status");
const playlistHint = document.getElementById("playlist-hint");

const SESSION_PAGE = "session.html";
const PLAYLIST_KEY = "waiting_list_playlist";

let currentPlaylistId = null;
let defaultPlaylistId = null;

function setStatus(message, showSaving) {
  if (showSaving) {
    playlistStatus.innerHTML = '<span class="saving-badge">Saving…</span>';
    return;
  }
  playlistStatus.textContent = message || "";
}

function setHint(message) {
  playlistHint.textContent = message || "";
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
    setStatus("Loading playlists…", true);
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
    setStatus("Starting playlist…", true);
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

playlistSelect.addEventListener("change", (event) => {
  currentPlaylistId = event.target.value;
  localStorage.setItem(PLAYLIST_KEY, currentPlaylistId);
  setStatus("Playlist updated.");
  setHint("Press start to begin playback on Spotify.");
});

playPlaylistBtn.addEventListener("click", () => {
  startPlaylistPlayback();
});

fetchDefaultPlaylistId().then(fetchPlaylists);
