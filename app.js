const statusText = document.getElementById("status-text");
const searchForm = document.getElementById("search-form");
const queryInput = document.getElementById("query");
const resultsGrid = document.getElementById("results-grid");
const searchHint = document.getElementById("search-hint");
const cardTemplate = document.getElementById("card-template");
const MENU_SESSION_PAGE = "session.html";

function setStatus(text, isConnected) {
  if (statusText) {
    statusText.textContent = text;
    statusText.style.color = isConnected ? "var(--accent)" : "var(--muted)";
  }
  searchForm.querySelector("button").disabled = !isConnected;
  queryInput.disabled = !isConnected;
  searchHint.textContent = isConnected
    ? "Search for tracks, albums, or artists."
    : "Connect first to enable search.";
}

async function fetchStatus() {
  try {
    const response = await fetch("/status");
    if (!response.ok) {
      console.error("Status check failed", response.status);
      setStatus("Not connected", false);
      return;
    }
    const data = await response.json();
    setStatus(data.connected ? "Connected" : "Not connected", data.connected);
    if (!data.connected && !window.location.pathname.endsWith(MENU_SESSION_PAGE)) {
      window.location.href = MENU_SESSION_PAGE;
      return;
    }
  } catch (error) {
    console.error("Status check error", error);
    setStatus("Not connected", false);
  }
}

function normalizeResults(items, kind) {
  return items.map((item) => {
    const image =
      kind === "track"
        ? item.album.images?.[0]?.url
        : item.images?.[0]?.url || item.album?.images?.[0]?.url;

    const title = item.name;
    const artistName =
      kind === "artist"
        ? "Artist"
        : item.artists?.map((artist) => artist.name).join(", ");

    return {
      type: kind,
      title,
      artist: artistName || "Unknown",
      image
    };
  });
}

function renderResults(results) {
  resultsGrid.innerHTML = "";
  if (!results.length) {
    resultsGrid.innerHTML = '<p class="subtle">No results found.</p>';
    return;
  }

  results.forEach((result) => {
    const node = cardTemplate.content.cloneNode(true);
    const img = node.querySelector("img");
    const meta = node.querySelector(".meta");
    const title = node.querySelector("h3");
    const artist = node.querySelector(".artist");

    img.src = result.image || "";
    img.alt = result.title;
    if (!result.image) {
      img.style.opacity = "0.3";
    }
    meta.textContent = result.type.toUpperCase();
    title.textContent = result.title;
    artist.textContent = result.artist;

    resultsGrid.appendChild(node);
  });
}

async function performSearch(query) {
  try {
    const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      const text = await response.text();
      console.error("Search failed", response.status, text);
      setStatus("Search failed. Please reconnect.", false);
      return;
    }

    const data = await response.json();
    const results = [
      ...normalizeResults(data.tracks?.items || [], "track"),
      ...normalizeResults(data.albums?.items || [], "album"),
      ...normalizeResults(data.artists?.items || [], "artist")
    ];

    renderResults(results);
  } catch (error) {
    console.error("Search error", error);
    setStatus("Search failed. Please reconnect.", false);
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;
  performSearch(query);
});

fetchStatus();
