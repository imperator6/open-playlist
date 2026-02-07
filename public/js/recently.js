const recentList = document.getElementById("recent-list");
const recentStatus = document.getElementById("recent-status");
const recentHint = document.getElementById("recent-hint");
const refreshBtn = document.getElementById("recent-refresh-btn");
const recentTemplate = document.getElementById("recent-card");

function setStatus(message, showSaving) {
  if (showSaving) {
    recentStatus.innerHTML = '<span class="saving-badge">Loading...</span>';
    return;
  }
  recentStatus.textContent = message || "";
}

function setHint(message) {
  recentHint.textContent = message || "";
}

function formatPlayedAt(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function renderRecent(items) {
  if (!recentList) return;
  recentList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "playlist-empty";
    empty.textContent = "No recently played tracks found.";
    recentList.appendChild(empty);
    return;
  }

  items.forEach((entry) => {
    const track = entry.track || {};
    const card = recentTemplate.content.firstElementChild.cloneNode(true);
    const img = card.querySelector("img");
    const meta = card.querySelector(".meta");
    const title = card.querySelector("h3");
    const artist = card.querySelector(".artist");
    const time = card.querySelector(".recent-time");
    const addBtn = card.querySelector(".recent-add");

    const album = track.album || {};
    const image =
      album.images && album.images[0] ? album.images[0].url : "";

    img.src = image || "";
    img.alt = track.name || "Track cover";
    meta.textContent = album.name || "Recently played";
    title.textContent = track.name || "Unknown track";
    artist.textContent = (track.artists || [])
      .map((item) => item.name)
      .join(", ");
    time.textContent = formatPlayedAt(entry.played_at);
    if (addBtn) {
      addBtn.textContent = "Play next";
      addBtn.addEventListener("click", () => {
        addRecentToQueue(entry);
      });
    }

    recentList.appendChild(card);
  });
}

async function addRecentToQueue(entry) {
  const track = entry && entry.track ? entry.track : null;
  if (!track || !track.uri) {
    setStatus("Unable to add track.");
    setHint("This track is missing data from Spotify.");
    return;
  }

  let insertPosition = null;
  try {
    const queueRes = await fetch("/api/queue/playlist");
    if (queueRes.ok) {
      const queueData = await queueRes.json();
      if (Number.isInteger(queueData.currentIndex)) {
        insertPosition = queueData.currentIndex + 1;
      }
    }
  } catch (error) {
    console.error("Queue position fetch error", error);
  }

  try {
    setStatus("Adding to queue...", true);
    const response = await fetch("/api/queue/playlist/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: insertPosition,
        track: {
          id: track.id || null,
          uri: track.uri,
          title: track.name || "Unknown title",
          artist: (track.artists || []).map((item) => item.name).join(", "),
          image:
            track.album && track.album.images && track.album.images[0]
              ? track.album.images[0].url
              : "",
          album: track.album ? track.album.name : ""
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Add to queue failed", response.status, text);
      setStatus("Unable to add track.");
      setHint("Check the waiting list playlist and try again.");
      return;
    }

    setStatus("Added to the waiting list.");
    setHint("Switch to the Waiting List page to manage the queue.");
  } catch (error) {
    console.error("Add to queue error", error);
    setStatus("Unable to add track.");
    setHint("Try again once Spotify is connected.");
  }
}

async function loadRecentlyPlayed() {
  try {
    setStatus("Loading recently played...", true);
    const response = await fetch("/api/recently-played");
    if (!response.ok) {
      if (response.status === 401) {
        setStatus("No active session.");
        setHint("Connect Spotify on the Session page and try again.");
        return;
      }
      const text = await response.text();
      console.error("Recently played fetch failed", response.status, text);
      setStatus("Unable to load recently played.");
      setHint("Connect Spotify on the Session page and try again.");
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    renderRecent(items);
    setStatus(
      items.length
        ? `Showing ${items.length} recently played track${
            items.length === 1 ? "" : "s"
          }.`
        : "No recently played tracks found."
    );
    setHint(items.length ? "Pull again to refresh the list." : "");
  } catch (error) {
    console.error("Recently played fetch error", error);
    setStatus("Unable to load recently played.");
    setHint("Try again once Spotify is connected.");
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadRecentlyPlayed();
  });
}

async function initializeRecently() {
  await window.authAPI.fetchUserStatus();
  loadRecentlyPlayed();
}

initializeRecently();
