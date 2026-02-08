const http = require("http");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodeFetch = require("node-fetch");
const { hasPermission, getPermissionsForRole } = require("./permissions");
const auth = require("./auth");

const PORT = process.env.PORT || 5173;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DJ_PASSWORD = process.env.DJ_PASSWORD || "";
const AUTO_REFRESH =
  String(process.env.AUTO_REFRESH || "1").toLowerCase() === "1";
const SESSION_STORE = process.env.SESSION_STORE || path.join(__dirname, "..", "storage", "session_store.json");
const QUEUE_STORE = process.env.QUEUE_STORE || path.join(__dirname, "..", "storage", "queue_store.json");
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const LOG_LEVEL_NAME = String(process.env.LOG_LEVEL || "INFO").toUpperCase();
const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};
const ACTIVE_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL_NAME] || LOG_LEVELS.INFO;
const SEARCH_RESULTS_PAGE_SIZE = 12;

const sharedSession = {
  token: null,
  refreshToken: null,
  expiresAt: null,
  lastRefreshAt: null,
  state: null,
  redirectUri: null
};
const sharedQueue = {
  activePlaylistId: null,
  activePlaylistName: null,
  activePlaylistImage: null,
  activePlaylistOwner: null,
  activePlaylistTrackCount: null,
  activePlaylistDescription: null,
  tracks: [],
  updatedAt: null,
  currentIndex: 0,
  autoPlayEnabled: false,
  lastSeenTrackId: null,
  lastAdvanceAt: null,
  lastError: null,
  activeDeviceId: null,
  activeDeviceName: null,
  voteSortEnabled: false
};
const sharedPlaybackCache = {
  playback: null,
  updatedAt: null,
  lastError: null
};
const playbackSubscribers = [];
const sharedDevicesCache = {
  devices: [],
  updatedAt: null,
  lastError: null,
  preferredDeviceId: null
};
const deviceSubscribers = [];
const SERVICE_NAME = "spotify-server";

function writeLog(line, isError) {
  const output = `${line}\n`;
  if (isError) {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
}

function log(level, message, context, err) {
  const levelWeight = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  if (levelWeight < ACTIVE_LOG_LEVEL) {
    return;
  }

  const values = [new Date().toISOString(), level, SERVICE_NAME, message];

  if (context && typeof context === "object") {
    Object.values(context).forEach((value) => {
      if (value === undefined) {
        return;
      }
      if (value === null) {
        values.push("null");
        return;
      }
      if (typeof value === "object") {
        values.push(JSON.stringify(value));
        return;
      }
      values.push(String(value));
    });
  }

  if (err) {
    values.push(err.message || String(err));
    if (err.stack) {
      values.push(err.stack);
    }
  }

  const line = values.join(" | ");
  writeLog(line, level === "ERROR");
}

function logInfo(message, context) {
  log("INFO", message, context);
}

function logDebug(message, context) {
  log("DEBUG", message, context);
}

function logWarn(message, context, err) {
  log("WARN", message, context, err);
}

function logError(message, context, err) {
  log("ERROR", message, context, err);
}

function isSpotifyUrl(url) {
  return typeof url === "string" && url.includes("spotify.com");
}

async function fetch(url, options = {}) {
  if (isSpotifyUrl(url)) {
    const method = options.method || "GET";
    logDebug("Connecting to Spotify API", {
      method,
      url
    });
  }
  return nodeFetch(url, options);
}

function readSessionStore() {
  try {
    if (!fs.existsSync(SESSION_STORE)) return;
    const raw = fs.readFileSync(SESSION_STORE, "utf-8");
    const data = JSON.parse(raw);
    sharedSession.token = data.token || null;
    sharedSession.refreshToken = data.refreshToken || null;
    sharedSession.expiresAt = data.expiresAt || null;
    sharedSession.lastRefreshAt = data.lastRefreshAt || null;
    logInfo("Loaded session store", {
      hasToken: Boolean(sharedSession.token),
      hasRefreshToken: Boolean(sharedSession.refreshToken)
    });
  } catch (err) {
    logWarn("Failed to read session store", null, err);
  }
}

function persistSessionStore() {
  try {
    const data = {
      token: sharedSession.token,
      refreshToken: sharedSession.refreshToken,
      expiresAt: sharedSession.expiresAt,
      lastRefreshAt: sharedSession.lastRefreshAt
    };
    fs.writeFileSync(SESSION_STORE, JSON.stringify(data, null, 2));
  } catch (err) {
    logWarn("Failed to persist session store", null, err);
  }
}

function readQueueStore() {
  try {
    if (!fs.existsSync(QUEUE_STORE)) return;
    const raw = fs.readFileSync(QUEUE_STORE, "utf-8");
    const data = JSON.parse(raw);
    sharedQueue.activePlaylistId = data.activePlaylistId || null;
    sharedQueue.activePlaylistName = data.activePlaylistName || null;
    const newImage = data.activePlaylistImage || null;
    if (sharedQueue.activePlaylistImage !== newImage) {
      logDebug("activePlaylistImage overwrite in readQueueStore", {
        old: sharedQueue.activePlaylistImage,
        new: newImage,
        playlistId: data.activePlaylistId
      });
    }
    sharedQueue.activePlaylistImage = newImage;
    sharedQueue.activePlaylistOwner = data.activePlaylistOwner || null;
    sharedQueue.activePlaylistTrackCount = data.activePlaylistTrackCount != null ? data.activePlaylistTrackCount : null;
    sharedQueue.activePlaylistDescription = data.activePlaylistDescription || null;
    let didNormalize = false;
    sharedQueue.tracks = Array.isArray(data.tracks)
      ? data.tracks.map((track) => {
          if (!track || typeof track !== "object") return track;
          let normalized = { ...track };
          if (!normalized.source) {
            normalized.source = "playlist";
            didNormalize = true;
          }
          if (!normalized.addedTimestamp) {
            normalized.addedTimestamp = data.updatedAt || new Date().toISOString();
            didNormalize = true;
          }
          if (!normalized.votes) {
            normalized.votes = { up: [], down: [] };
            didNormalize = true;
          }
          return normalized;
        })
      : [];
    sharedQueue.updatedAt = data.updatedAt || null;
    sharedQueue.currentIndex =
      Number.isInteger(data.currentIndex) && data.currentIndex >= 0
        ? data.currentIndex
        : 0;
    sharedQueue.autoPlayEnabled = typeof data.autoPlayEnabled === "boolean"
      ? data.autoPlayEnabled
      : false;
    sharedQueue.voteSortEnabled = typeof data.voteSortEnabled === "boolean"
      ? data.voteSortEnabled
      : false;
    sharedQueue.lastSeenTrackId = data.lastSeenTrackId || null;
    sharedQueue.lastAdvanceAt = data.lastAdvanceAt || null;
    sharedQueue.lastError = data.lastError || null;
    sharedQueue.activeDeviceId = data.activeDeviceId || null;
    sharedQueue.activeDeviceName = data.activeDeviceName || null;
    if (didNormalize) {
      persistQueueStore();
    }

    logInfo("Loaded queue store", {
      hasActivePlaylist: Boolean(sharedQueue.activePlaylistId),
      trackCount: sharedQueue.tracks.length,
      autoPlayEnabled: sharedQueue.autoPlayEnabled,
      voteSortEnabled: sharedQueue.voteSortEnabled
    });
  } catch (err) {
    logWarn("Failed to read queue store", null, err);
  }
}

function persistQueueStore() {
  try {
    const data = {
      activePlaylistId: sharedQueue.activePlaylistId,
      activePlaylistName: sharedQueue.activePlaylistName,
      activePlaylistImage: sharedQueue.activePlaylistImage,
      activePlaylistOwner: sharedQueue.activePlaylistOwner,
      activePlaylistTrackCount: sharedQueue.activePlaylistTrackCount,
      activePlaylistDescription: sharedQueue.activePlaylistDescription,
      tracks: sharedQueue.tracks,
      updatedAt: sharedQueue.updatedAt,
      currentIndex: sharedQueue.currentIndex,
      autoPlayEnabled: sharedQueue.autoPlayEnabled,
      voteSortEnabled: sharedQueue.voteSortEnabled,
      lastSeenTrackId: sharedQueue.lastSeenTrackId,
      lastAdvanceAt: sharedQueue.lastAdvanceAt,
      lastError: sharedQueue.lastError,
      activeDeviceId: sharedQueue.activeDeviceId,
      activeDeviceName: sharedQueue.activeDeviceName
    };
    fs.writeFileSync(QUEUE_STORE, JSON.stringify(data, null, 2));
  } catch (err) {
    logWarn("Failed to persist queue store", null, err);
  }
}

const missingEnv = [];
if (!CLIENT_ID) missingEnv.push("SPOTIFY_CLIENT_ID");
if (!CLIENT_SECRET) missingEnv.push("SPOTIFY_CLIENT_SECRET");

if (missingEnv.length) {
  const envPath = path.join(__dirname, "..", ".env");
  const hasEnvFile = fs.existsSync(envPath);
  logError("Missing required environment variables", {
    missing: missingEnv,
    hasEnvFile
  });
  logInfo(
    hasEnvFile
      ? "Update your .env file with the missing values"
      : "Create a .env file from .env.example and add your credentials"
  );
  logInfo("Then run: node server.js");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  logWarn("ADMIN_PASSWORD is not set; admin authentication is disabled");
}

if (!DJ_PASSWORD) {
  logWarn("DJ_PASSWORD is not set; DJ authentication is disabled");
}

readSessionStore();
readQueueStore();

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function verifyAdminPassword(password) {
  if (!ADMIN_PASSWORD) return false;
  return password === ADMIN_PASSWORD;
}

function verifyDjPassword(password) {
  if (!DJ_PASSWORD) return false;
  return password === DJ_PASSWORD;
}

function getUserSession(req) {
  return auth.getOrCreateGuestSession(req);
}

function checkPermission(req, action) {
  const session = getUserSession(req);
  return hasPermission(action, session.role);
}

function requirePermission(req, res, action) {
  if (!checkPermission(req, action)) {
    const session = getUserSession(req);
    logWarn("Permission denied", {
      action,
      role: session.role,
      sessionId: session.sessionId
    });
    sendJson(res, 403, { error: "Insufficient permissions" });
    return false;
  }
  return true;
}

function readStaticFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType =
    ext === ".css"
      ? "text/css"
      : ext === ".js"
      ? "text/javascript"
      : ext === ".webmanifest"
      ? "application/manifest+json"
      : ext === ".png"
      ? "image/png"
      : "text/html";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function exchangeToken(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Token exchange failed with ${response.status}`);
  }

  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Refresh failed with ${response.status}`);
  }

  return response.json();
}

function tokenValid(session) {
  return session.token && session.expiresAt && Date.now() < session.expiresAt;
}

async function ensureValidToken(session) {
  if (tokenValid(session)) return true;
  if (session.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken);
      session.token = refreshed.access_token;
      session.expiresAt = Date.now() + refreshed.expires_in * 1000;
      session.lastRefreshAt = Date.now();
      if (refreshed.refresh_token) {
        session.refreshToken = refreshed.refresh_token;
      }
      persistSessionStore();
      logInfo("Spotify token refreshed", {
        expiresIn: refreshed.expires_in
      });
    } catch (err) {
      logError("Spotify token refresh failed", null, err);
    }
  }
  return tokenValid(session);
}

function scheduleAutoRefresh() {
  if (!AUTO_REFRESH) {
    logInfo("Auto refresh disabled");
    return;
  }
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    if (!sharedSession.refreshToken) return;
    if (!sharedSession.expiresAt) return;
    const msRemaining = sharedSession.expiresAt - Date.now();
    if (msRemaining > 10 * 60 * 1000) return;
    await ensureValidToken(sharedSession);
  }, REFRESH_INTERVAL_MS);
}

scheduleAutoRefresh();

function enrichVoteNames(votes) {
  if (!votes) return { up: [], down: [] };
  const enrich = (arr) =>
    (arr || []).map((v) => {
      const stored = auth.getSession(v.sessionId);
      return {
        sessionId: v.sessionId,
        name: (stored && stored.name) || v.name || ""
      };
    });
  return { up: enrich(votes.up), down: enrich(votes.down) };
}

function enrichedTracks() {
  return sharedQueue.tracks.map((track) => ({
    ...track,
    votes: enrichVoteNames(track.votes)
  }));
}

function getServerTrack(index) {
  if (!Array.isArray(sharedQueue.tracks)) return null;
  if (index < 0 || index >= sharedQueue.tracks.length) return null;
  return sharedQueue.tracks[index];
}

async function refreshPlaybackCache() {
  if (!(await ensureValidToken(sharedSession))) {
    sharedPlaybackCache.lastError = "Not connected";
    return false;
  }

  const headers = {
    Authorization: `Bearer ${sharedSession.token}`
  };

  try {
    const playbackRes = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers }
    );

    if (!playbackRes.ok && playbackRes.status !== 204) {
      const text = await playbackRes.text();
      logError("Spotify playback failed", {
        status: playbackRes.status,
        body: text
      });
      sharedPlaybackCache.lastError = "Playback request failed";
      return false;
    }

    const playback =
      playbackRes.status === 204 ? null : await playbackRes.json();

    sharedPlaybackCache.playback = playback;
    sharedPlaybackCache.updatedAt = new Date().toISOString();
    sharedPlaybackCache.lastError = null;
    notifyPlaybackSubscribers();
    return true;
  } catch (error) {
    logWarn("Spotify playback cache refresh failed", null, error);
    sharedPlaybackCache.lastError = "Playback refresh failed";
    return false;
  }
}

function updatePlaybackCachePlaying(isPlaying) {
  if (!sharedPlaybackCache.playback) {
    sharedPlaybackCache.updatedAt = new Date().toISOString();
    sharedPlaybackCache.lastError = null;
    notifyPlaybackSubscribers();
    return;
  }

  const now = Date.now();
  const playback = sharedPlaybackCache.playback;
  const previousTimestamp = typeof playback.timestamp === "number"
    ? playback.timestamp
    : now;
  const previousProgress = typeof playback.progress_ms === "number"
    ? playback.progress_ms
    : 0;

  if (!playback.is_playing && isPlaying) {
    playback.is_playing = true;
    playback.timestamp = now;
  } else if (playback.is_playing && !isPlaying) {
    const elapsed = Math.max(0, now - previousTimestamp);
    playback.progress_ms = previousProgress + elapsed;
    playback.is_playing = false;
    playback.timestamp = now;
  } else {
    playback.is_playing = Boolean(isPlaying);
    playback.timestamp = now;
  }

  sharedPlaybackCache.updatedAt = new Date().toISOString();
  sharedPlaybackCache.lastError = null;
  notifyPlaybackSubscribers();
}

async function refreshDevicesCache() {
  if (!(await ensureValidToken(sharedSession))) {
    sharedDevicesCache.lastError = "Not connected";
    return false;
  }

  try {
    const response = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify devices fetch failed", {
        status: response.status,
        body: text
      });
      sharedDevicesCache.lastError = "Devices request failed";
      return false;
    }

    const data = await response.json();
    const devices = Array.isArray(data.devices) ? data.devices : [];
    sharedDevicesCache.devices = devices;
    sharedDevicesCache.preferredDeviceId = null;
    if (devices.length) {
      const preferredName = sharedQueue.activeDeviceName;
      if (preferredName) {
        const match = devices.find(
          (device) =>
            device.name &&
            device.name.toLowerCase() === preferredName.toLowerCase()
        );
        if (match) {
          sharedDevicesCache.preferredDeviceId = match.id;
        }
      }
      if (!sharedDevicesCache.preferredDeviceId) {
        sharedDevicesCache.preferredDeviceId = devices[0].id;
      }
    }
    sharedDevicesCache.updatedAt = new Date().toISOString();
    sharedDevicesCache.lastError = null;
    notifyDeviceSubscribers();
    return true;
  } catch (error) {
    logWarn("Spotify devices cache refresh failed", null, error);
    sharedDevicesCache.lastError = "Devices refresh failed";
    return false;
  }
}

function notifyPlaybackSubscribers() {
  if (!playbackSubscribers.length) return;
  const payload = {
    playback: sharedPlaybackCache.playback,
    updatedAt: sharedPlaybackCache.updatedAt,
    lastError: sharedPlaybackCache.lastError,
    autoPlayEnabled: sharedQueue.autoPlayEnabled,
    queueCount: Array.isArray(sharedQueue.tracks) ? sharedQueue.tracks.length : 0,
    stale:
      !sharedPlaybackCache.updatedAt ||
      Date.now() - Date.parse(sharedPlaybackCache.updatedAt) >
        PLAYBACK_CACHE_STALE_MS
  };

  const subscribers = playbackSubscribers.splice(0, playbackSubscribers.length);
  subscribers.forEach(({ res, timeoutId }) => {
    clearTimeout(timeoutId);
    sendJson(res, 200, payload);
  });
}

function notifyDeviceSubscribers() {
  if (!deviceSubscribers.length) return;
  const payload = {
    devices: sharedDevicesCache.devices,
    updatedAt: sharedDevicesCache.updatedAt,
    lastError: sharedDevicesCache.lastError,
    preferredDeviceId: sharedDevicesCache.preferredDeviceId
  };

  const subscribers = deviceSubscribers.splice(0, deviceSubscribers.length);
  subscribers.forEach(({ res, timeoutId }) => {
    clearTimeout(timeoutId);
    sendJson(res, 200, payload);
  });
}

const PLAYBACK_CACHE_INTERVAL_MS = 8000;
const PLAYBACK_CACHE_STALE_MS = 15000;
setInterval(() => {
  if (!sharedQueue.autoPlayEnabled) {
    return;
  }
  if (!sharedSession.token && !sharedSession.refreshToken) {
    sharedPlaybackCache.lastError = "Not connected";
    return;
  }
  refreshPlaybackCache().catch((err) => {
    logWarn("Playback cache refresh failed", null, err);
  });
}, PLAYBACK_CACHE_INTERVAL_MS);

async function playTrackUri(uri, deviceId) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play${query}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uris: [uri] })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    logError("Spotify track play failed", {
      status: response.status,
      body: text
    });
    let message = "Unable to start playback.";
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.error && parsed.error.message) {
        message = parsed.error.message;
      }
    } catch (err) {
      message = text || message;
    }
    sharedQueue.lastError = {
      message,
      status: response.status,
      at: new Date().toISOString()
    };
    persistQueueStore();
    return false;
  }

  if (sharedQueue.lastError) {
    sharedQueue.lastError = null;
    persistQueueStore();
  }
  return true;
}

function ensureTrackAtFront(trackId) {
  if (!trackId || !Array.isArray(sharedQueue.tracks)) return;
  const index = sharedQueue.tracks.findIndex((t) => t.id === trackId);
  if (index <= 0) {
    sharedQueue.currentIndex = 0;
    return;
  }
  const [track] = sharedQueue.tracks.splice(index, 1);
  sharedQueue.tracks.unshift(track);
  sharedQueue.currentIndex = 0;
  sharedQueue.updatedAt = new Date().toISOString();
  persistQueueStore();
  logInfo("ensureTrackAtFront: moved track to position 0", {
    trackId,
    fromIndex: index
  });
}

async function autoPlayTick() {
  if (!sharedQueue.autoPlayEnabled) {
    logInfo("Auto play tick skipped: disabled");
    return;
  }
  if (!sharedQueue.activePlaylistId) {
    logInfo("Auto play tick skipped: no active playlist");
    return;
  }
  if (!sharedQueue.tracks.length) {
    logInfo("Auto play tick skipped: no tracks");
    return;
  }
  if (!(await ensureValidToken(sharedSession))) {
    logWarn("Auto play tick skipped: no valid token");
    return;
  }

  if (
    !Number.isInteger(sharedQueue.currentIndex) ||
    sharedQueue.currentIndex < 0
  ) {
    sharedQueue.currentIndex = 0;
  }

  if (sharedQueue.currentIndex >= sharedQueue.tracks.length) {
    sharedQueue.currentIndex = sharedQueue.tracks.length - 1;
  }

  const playback = sharedPlaybackCache.playback;

  if (!playback || !playback.item) {
    logInfo("Auto play tick: no active playback", {
      currentIndex: sharedQueue.currentIndex,
      trackCount: sharedQueue.tracks.length,
      autoPlayEnabled: sharedQueue.autoPlayEnabled
    });
    const now = Date.now();
    const currentTrack = getServerTrack(sharedQueue.currentIndex);
    if (!currentTrack) return;

    if (!sharedQueue.lastSeenTrackId) {
      logInfo("Auto play: starting first track", {
        index: sharedQueue.currentIndex,
        trackId: currentTrack.id || null,
        title: currentTrack.title || null
      });
      const started = await playTrackUri(
        currentTrack.uri,
        sharedQueue.activeDeviceId
      );
      if (started) {
        ensureTrackAtFront(currentTrack.id);
        sharedQueue.lastSeenTrackId = currentTrack.id || null;
        sharedQueue.lastAdvanceAt = now;
        persistQueueStore();
        logInfo("Auto play: track sent to Spotify", {
          index: sharedQueue.currentIndex,
          trackId: currentTrack.id || null
        });
      }
      return;
    }

    if (sharedQueue.lastSeenTrackId !== (currentTrack.id || null)) {
      return;
    }

    if (sharedQueue.lastAdvanceAt && now - sharedQueue.lastAdvanceAt < 6000) {
      logInfo("Auto play: debounce active", {
        currentIndex: sharedQueue.currentIndex,
        msSinceLastAdvance: now - sharedQueue.lastAdvanceAt
      });
      return;
    }

    const nextIndex = sharedQueue.currentIndex + 1;
    if (nextIndex >= sharedQueue.tracks.length) {
      logInfo("Auto play reached end of list", {
        trackCount: sharedQueue.tracks.length
      });
      return;
    }

    const nextTrack = getServerTrack(nextIndex);
    if (!nextTrack) return;

    logInfo("Auto play: advancing to next track", {
      fromIndex: sharedQueue.currentIndex,
      toIndex: nextIndex,
      trackId: nextTrack.id || null,
      title: nextTrack.title || null
    });
    const started = await playTrackUri(
      nextTrack.uri,
      sharedQueue.activeDeviceId
    );
    if (started) {
      const previousIndex = sharedQueue.currentIndex;
      sharedQueue.currentIndex = nextIndex;
      sharedQueue.lastSeenTrackId = nextTrack.id || null;
      sharedQueue.lastAdvanceAt = now;
      if (
        Number.isInteger(previousIndex) &&
        previousIndex >= 0 &&
        previousIndex < sharedQueue.tracks.length
      ) {
        sharedQueue.tracks.splice(previousIndex, 1);
        if (sharedQueue.currentIndex > previousIndex) {
          sharedQueue.currentIndex -= 1;
        }
      }
      ensureTrackAtFront(nextTrack.id);
      sharedQueue.updatedAt = new Date().toISOString();
      persistQueueStore();
      logInfo("Auto play: next track sent to Spotify", {
        index: sharedQueue.currentIndex,
        trackId: nextTrack.id || null
      });
    }
    return;
  }

  const item = playback.item;
  if (!item) {
    logInfo("Auto play tick skipped: no currently-playing item");
    return;
  }

  if (sharedQueue.lastError) {
    sharedQueue.lastError = null;
    persistQueueStore();
  }

  const currentTrack = getServerTrack(sharedQueue.currentIndex);
  if (!currentTrack) {
    logInfo("Auto play tick skipped: current index out of range", {
      currentIndex: sharedQueue.currentIndex,
      trackCount: sharedQueue.tracks.length
    });
    return;
  }

  if (item.id === currentTrack.id) {
    logInfo("Auto play tick: current track observed", {
      index: sharedQueue.currentIndex,
      trackId: item.id || null,
      isPlaying: Boolean(playback.is_playing)
    });
    if (sharedQueue.lastSeenTrackId !== item.id) {
      sharedQueue.lastSeenTrackId = item.id || null;
      persistQueueStore();
    }

    if (!playback.is_playing) {
      const now = Date.now();
      if (sharedQueue.lastAdvanceAt && now - sharedQueue.lastAdvanceAt < 6000) {
        logInfo("Auto play: debounce active", {
          currentIndex: sharedQueue.currentIndex,
          msSinceLastAdvance: now - sharedQueue.lastAdvanceAt
        });
        return;
      }

      const nextIndex = sharedQueue.currentIndex + 1;
      if (nextIndex >= sharedQueue.tracks.length) {
        logInfo("Auto play reached end of list", {
          trackCount: sharedQueue.tracks.length
        });
        return;
      }

      const nextTrack = getServerTrack(nextIndex);
      if (!nextTrack) return;

      logInfo("Auto play: advancing to next track (paused)", {
        fromIndex: sharedQueue.currentIndex,
        toIndex: nextIndex,
        trackId: nextTrack.id || null,
        title: nextTrack.title || null
      });
      const started = await playTrackUri(
        nextTrack.uri,
        sharedQueue.activeDeviceId
      );
      if (started) {
        const previousIndex = sharedQueue.currentIndex;
        sharedQueue.currentIndex = nextIndex;
        sharedQueue.lastSeenTrackId = nextTrack.id || null;
        sharedQueue.lastAdvanceAt = now;
        if (
          Number.isInteger(previousIndex) &&
          previousIndex >= 0 &&
          previousIndex < sharedQueue.tracks.length
        ) {
          sharedQueue.tracks.splice(previousIndex, 1);
          if (sharedQueue.currentIndex > previousIndex) {
            sharedQueue.currentIndex -= 1;
          }
        }
        ensureTrackAtFront(nextTrack.id);
        logInfo("Auto play: next track sent to Spotify", {
          index: sharedQueue.currentIndex,
          trackId: nextTrack.id || null
        });
      }
    } else {
      logInfo("Auto play tick skipped: track still playing");
    }
  } else {
    logInfo("Auto play tick skipped: Spotify track differs from server index", {
      spotifyTrackId: item.id || null,
      serverTrackId: currentTrack.id || null,
      index: sharedQueue.currentIndex
    });
  }
}

const AUTO_PLAY_INTERVAL_MS = 4000;
setInterval(() => {
  autoPlayTick().catch((err) => {
    logWarn("Auto play tick failed", null, err);
  });
}, AUTO_PLAY_INTERVAL_MS);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/" || pathname === "/index.html") {
    return readStaticFile(path.join(__dirname, "..", "public", "index.html"), res);
  }
  if (pathname === "/session" || pathname === "/session.html") {
    return readStaticFile(path.join(__dirname, "..", "public", "session.html"), res);
  }
  if (pathname === "/recently" || pathname === "/recently.html") {
    return readStaticFile(path.join(__dirname, "..", "public", "recently.html"), res);
  }
  if (pathname === "/playlist" || pathname === "/playlist.html") {
    return readStaticFile(path.join(__dirname, "..", "public", "playlist.html"), res);
  }
  if (pathname === "/css/styles.css") {
    return readStaticFile(path.join(__dirname, "..", "public", "css", "styles.css"), res);
  }
  if (pathname === "/js/auth.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "auth.js"), res);
  }
  if (pathname === "/js/app.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "app.js"), res);
  }
  if (pathname === "/js/session.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "session.js"), res);
  }
  if (pathname === "/js/queue.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "queue.js"), res);
  }
  if (pathname === "/js/recently.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "recently.js"), res);
  }
  if (pathname === "/js/playlist.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "playlist.js"), res);
  }
  if (pathname === "/js/menu.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "menu.js"), res);
  }
  if (pathname === "/js/pwa.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "js", "pwa.js"), res);
  }
  if (pathname === "/sw.js") {
    return readStaticFile(path.join(__dirname, "..", "public", "sw.js"), res);
  }
  if (pathname === "/manifest.webmanifest") {
    return readStaticFile(path.join(__dirname, "..", "public", "manifest.webmanifest"), res);
  }
  if (pathname === "/icons/icon-192.png") {
    return readStaticFile(path.join(__dirname, "..", "public", "icons", "icon-192.png"), res);
  }
  if (pathname === "/icons/icon-512.png") {
    return readStaticFile(path.join(__dirname, "..", "public", "icons", "icon-512.png"), res);
  }
  if (pathname === "/icons/apple-touch-icon.png") {
    return readStaticFile(path.join(__dirname, "..", "public", "icons", "apple-touch-icon.png"), res);
  }

  if (pathname === "/status") {
    return sendJson(res, 200, {
      connected: tokenValid(sharedSession),
      expiresAt: sharedSession.expiresAt || null,
      lastRefreshAt: sharedSession.lastRefreshAt || null,
      hasToken: Boolean(sharedSession.token),
      hasRefreshToken: Boolean(sharedSession.refreshToken),
      hasRedirectUri: Boolean(sharedSession.redirectUri)
    });
  }

  if (pathname === "/api/auth/status") {
    const session = getUserSession(req);
    const permissions = getPermissionsForRole(session.role);
    res.setHeader("Set-Cookie", auth.createSessionCookie(session));
    return sendJson(res, 200, {
      role: session.role,
      name: session.name,
      sessionId: session.sessionId,
      permissions
    });
  }

  if (pathname === "/api/auth/admin") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid admin login payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const password = body.password || "";
    if (!verifyAdminPassword(password)) {
      logWarn("Admin login failed", { hasPassword: Boolean(password) });
      return sendJson(res, 401, { error: "Invalid password" });
    }

    const session = getUserSession(req);
    const adminSession = auth.updateSession(session.sessionId, {
      role: "admin",
      name: session.name || "Admin"
    });

    if (!adminSession) {
      return sendJson(res, 500, { error: "Failed to create admin session" });
    }

    res.setHeader("Set-Cookie", auth.createSessionCookie(adminSession));
    logInfo("Admin login successful", { sessionId: adminSession.sessionId });
    return sendJson(res, 200, {
      role: adminSession.role,
      name: adminSession.name,
      sessionId: adminSession.sessionId
    });
  }

  if (pathname === "/api/auth/dj") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid DJ login payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const password = body.password || "";
    if (!verifyDjPassword(password)) {
      logWarn("DJ login failed", { hasPassword: Boolean(password) });
      return sendJson(res, 401, { error: "Invalid password" });
    }

    const session = getUserSession(req);
    const djSession = auth.updateSession(session.sessionId, {
      role: "dj",
      name: session.name || "DJ"
    });

    if (!djSession) {
      return sendJson(res, 500, { error: "Failed to create DJ session" });
    }

    res.setHeader("Set-Cookie", auth.createSessionCookie(djSession));
    logInfo("DJ login successful", { sessionId: djSession.sessionId });
    return sendJson(res, 200, {
      role: djSession.role,
      name: djSession.name,
      sessionId: djSession.sessionId
    });
  }

  if (pathname === "/api/auth/guest/name") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid guest name payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const name = (body.name || "").trim();
    if (!name) {
      return sendJson(res, 400, { error: "Name is required" });
    }

    if (name.length > 50) {
      return sendJson(res, 400, { error: "Name is too long (max 50 characters)" });
    }

    const session = getUserSession(req);
    const updatedSession = auth.updateSession(session.sessionId, { name });

    if (!updatedSession) {
      return sendJson(res, 500, { error: "Failed to update session" });
    }

    // Retroactively update voter name on all existing votes
    for (const track of sharedQueue.tracks) {
      for (const dir of ["up", "down"]) {
        for (const vote of (track.votes && track.votes[dir]) || []) {
          if (vote.sessionId === updatedSession.sessionId) {
            vote.name = name;
          }
        }
      }
    }
    persistQueueStore();

    res.setHeader("Set-Cookie", auth.createSessionCookie(updatedSession));
    logInfo("Guest name updated", {
      sessionId: updatedSession.sessionId,
      name: updatedSession.name
    });
    return sendJson(res, 200, {
      role: updatedSession.role,
      name: updatedSession.name,
      sessionId: updatedSession.sessionId
    });
  }

  if (pathname === "/api/auth/logout") {
    const session = getUserSession(req);

    if (session.role !== "guest") {
      const guestSession = auth.updateSession(session.sessionId, {
        role: "guest"
      });

      if (guestSession) {
        res.setHeader("Set-Cookie", auth.createSessionCookie(guestSession));
        logInfo(`${session.role} logged out`, { sessionId: guestSession.sessionId });
        return sendJson(res, 200, {
          role: guestSession.role,
          name: guestSession.name,
          sessionId: guestSession.sessionId
        });
      }
    }

    return sendJson(res, 200, {
      role: session.role,
      name: session.name,
      sessionId: session.sessionId
    });
  }

  if (pathname === "/api/host/connect") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return sendJson(res, 500, {
        error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET"
      });
    }

    const state = crypto.randomBytes(12).toString("hex");
    sharedSession.state = state;
    const redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      `http://${req.headers.host}/callback`;
    sharedSession.redirectUri = redirectUri;

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope:
        "user-read-playback-state user-read-currently-playing " +
        "playlist-read-private playlist-read-collaborative " +
        "playlist-modify-public playlist-modify-private " +
        "user-read-private user-modify-playback-state " +
        "user-read-recently-played",
      state
    });

    logInfo("Providing Spotify authorize URL", {
      redirectUri,
      host: req.headers.host
    });
    return sendJson(res, 200, {
      authorizeUrl: `https://accounts.spotify.com/authorize?${params}`
    });
  }

  if (pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const spotifyError = url.searchParams.get("error");

    if (spotifyError) {
      logError(
        "Spotify returned error on callback",
        { spotifyError },
        new Error(spotifyError)
      );
      res.writeHead(302, { Location: `/?error=${spotifyError}` });
      return res.end();
    }

    if (!code || !state || state !== sharedSession.state) {
      logWarn("State mismatch on callback", {
        hasCode: Boolean(code),
        hasState: Boolean(state)
      });
      res.writeHead(302, { Location: "/?error=state" });
      return res.end();
    }

    try {
      const token = await exchangeToken(
        code,
        sharedSession.redirectUri || REDIRECT_URI
      );
      sharedSession.token = token.access_token;
      sharedSession.expiresAt = Date.now() + token.expires_in * 1000;
      sharedSession.refreshToken =
        token.refresh_token || sharedSession.refreshToken;
      sharedSession.lastRefreshAt = Date.now();
      sharedSession.state = null;
      sharedSession.redirectUri = null;
      persistSessionStore();
      logInfo("Spotify token exchange success", {
        expiresIn: token.expires_in
      });
      res.writeHead(302, { Location: "/session.html?connected=1" });
      return res.end();
    } catch (err) {
      logError("Spotify token exchange failed", null, err);
      res.writeHead(302, { Location: "/?error=auth" });
      return res.end();
    }
  }

  if (pathname === "/api/host/logout") {
    sharedSession.token = null;
    sharedSession.refreshToken = null;
    sharedSession.expiresAt = null;
    sharedSession.lastRefreshAt = null;
    sharedSession.state = null;
    sharedSession.redirectUri = null;
    persistSessionStore();
    logInfo("Host logged out");
    return sendJson(res, 200, {
      ok: true,
      activeDeviceId: sharedQueue.activeDeviceId,
      activeDeviceName: sharedQueue.activeDeviceName
    });
  }

  if (pathname === "/search") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      return sendJson(res, 400, { error: "Missing query" });
    }

    const params = new URLSearchParams({
      q: query,
      type: "track,album,artist",
      limit: "12"
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify search failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/queue") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    if (!sharedPlaybackCache.updatedAt) {
      await refreshPlaybackCache();
    }

    const stale =
      !sharedPlaybackCache.updatedAt ||
      Date.now() - Date.parse(sharedPlaybackCache.updatedAt) >
        PLAYBACK_CACHE_STALE_MS;

    return sendJson(res, 200, {
      playback: sharedPlaybackCache.playback,
      updatedAt: sharedPlaybackCache.updatedAt,
      lastError: sharedPlaybackCache.lastError,
      stale
    });
  }

  if (pathname === "/api/queue/stream") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const since = url.searchParams.get("since");
    const sinceMs = since ? Date.parse(since) : null;
    if (
      sharedPlaybackCache.updatedAt &&
      (!sinceMs || Date.parse(sharedPlaybackCache.updatedAt) > sinceMs)
    ) {
      const stale =
        !sharedPlaybackCache.updatedAt ||
        Date.now() - Date.parse(sharedPlaybackCache.updatedAt) >
          PLAYBACK_CACHE_STALE_MS;
      return sendJson(res, 200, {
        playback: sharedPlaybackCache.playback,
        updatedAt: sharedPlaybackCache.updatedAt,
        lastError: sharedPlaybackCache.lastError,
        stale,
        autoPlayEnabled: sharedQueue.autoPlayEnabled,
        queueCount: Array.isArray(sharedQueue.tracks)
          ? sharedQueue.tracks.length
          : 0
      });
    }

    const timeoutId = setTimeout(() => {
      const index = playbackSubscribers.findIndex((item) => item.res === res);
      if (index >= 0) {
        playbackSubscribers.splice(index, 1);
      }
      const stale =
        !sharedPlaybackCache.updatedAt ||
        Date.now() - Date.parse(sharedPlaybackCache.updatedAt) >
          PLAYBACK_CACHE_STALE_MS;
      sendJson(res, 200, {
        playback: sharedPlaybackCache.playback,
        updatedAt: sharedPlaybackCache.updatedAt,
        lastError: sharedPlaybackCache.lastError,
        stale,
        autoPlayEnabled: sharedQueue.autoPlayEnabled,
        queueCount: Array.isArray(sharedQueue.tracks)
          ? sharedQueue.tracks.length
          : 0
      });
    }, 25000);

    playbackSubscribers.push({ res, timeoutId });
    res.on("close", () => {
      const index = playbackSubscribers.findIndex((item) => item.res === res);
      if (index >= 0) {
        clearTimeout(playbackSubscribers[index].timeoutId);
        playbackSubscribers.splice(index, 1);
      }
    });
    return;
  }

  if (pathname === "/api/recently-played") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const limitRaw = Number(url.searchParams.get("limit"));
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 50
        ? limitRaw
        : 25;

    const params = new URLSearchParams({
      limit: String(limit)
    });

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?${params}`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify recently played fetch failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/playlists") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const response = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlists fetch failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/playlists/search") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      return sendJson(res, 400, { error: "Missing query" });
    }

    const limitRaw = Number(url.searchParams.get("limit"));
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 50
        ? limitRaw
        : 12;

    const offsetRaw = Number(url.searchParams.get("offset"));
    const offset =
      Number.isInteger(offsetRaw) && offsetRaw >= 0
        ? offsetRaw
        : 0;

    const params = new URLSearchParams({
      q: query,
      type: "playlist",
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist search failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname.match(/^\/api\/playlists\/([^/]+)\/follow$/) && req.method === "PUT") {
    if (!requirePermission(req, res, "playlist:follow")) {
      return;
    }
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const playlistId = pathname.split("/")[3];
    if (!playlistId) {
      return sendJson(res, 400, { error: "Missing playlist ID" });
    }

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/followers`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sharedSession.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ public: false })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist follow failed", {
        status: response.status,
        playlistId,
        body: text
      });
      return sendJson(res, 502, { error: "Failed to save playlist" });
    }

    logInfo("Playlist followed", { playlistId });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/track-search") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      return sendJson(res, 400, { error: "Missing query" });
    }

    const offset = url.searchParams.get("offset") || "0";
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(SEARCH_RESULTS_PAGE_SIZE),
      offset: offset
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify track search failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/track-play") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    if (!checkPermission(req, "track:play")) {
      return sendJson(res, 403, { error: "Permission denied" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid play track payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const uri = body.uri || "";
    const trackId = body.trackId || "";
    const deviceId = body.deviceId || sharedQueue.activeDeviceId || "";
    if (!uri) {
      return sendJson(res, 400, { error: "Missing track uri" });
    }

    const playQuery = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play${playQuery}`,
      {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uris: [uri] })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify track play failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    if (sharedPlaybackCache.playback) {
      sharedPlaybackCache.playback.progress_ms = 0;
      sharedPlaybackCache.playback.timestamp = Date.now();
    }
    updatePlaybackCachePlaying(true);

    if (trackId && Array.isArray(sharedQueue.tracks)) {
      const index = sharedQueue.tracks.findIndex((track) => track.id === trackId);
      if (index >= 0) {
        sharedQueue.lastSeenTrackId = trackId;
        sharedQueue.lastAdvanceAt = Date.now();
        ensureTrackAtFront(trackId);
      }
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/pause") {
    if (!requirePermission(req, res, "playback:pause")) {
      return;
    }

    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const pauseQuery = sharedQueue.activeDeviceId
      ? `?device_id=${encodeURIComponent(sharedQueue.activeDeviceId)}`
      : "";
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/pause${pauseQuery}`,
      {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify pause failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    updatePlaybackCachePlaying(false);
    sharedQueue.autoPlayEnabled = false;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/devices") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    if (!sharedDevicesCache.updatedAt) {
      await refreshDevicesCache();
    }

    return sendJson(res, 200, {
      devices: sharedDevicesCache.devices,
      updatedAt: sharedDevicesCache.updatedAt,
      lastError: sharedDevicesCache.lastError,
      preferredDeviceId: sharedDevicesCache.preferredDeviceId
    });
  }

  if (pathname === "/api/player/devices/refresh") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const refreshed = await refreshDevicesCache();
    if (!refreshed) {
      return sendJson(res, 502, { error: "Unable to refresh devices" });
    }

    logInfo("Devices cache refreshed on demand");
    return sendJson(res, 200, {
      ok: true,
      updatedAt: sharedDevicesCache.updatedAt
    });
  }

  if (pathname === "/api/player/devices/stream") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const since = url.searchParams.get("since");
    const sinceMs = since ? Date.parse(since) : null;
    if (
      sharedDevicesCache.updatedAt &&
      (!sinceMs || Date.parse(sharedDevicesCache.updatedAt) > sinceMs)
    ) {
      return sendJson(res, 200, {
        devices: sharedDevicesCache.devices,
        updatedAt: sharedDevicesCache.updatedAt,
        lastError: sharedDevicesCache.lastError,
        preferredDeviceId: sharedDevicesCache.preferredDeviceId
      });
    }

    const timeoutId = setTimeout(() => {
      const index = deviceSubscribers.findIndex((item) => item.res === res);
      if (index >= 0) {
        deviceSubscribers.splice(index, 1);
      }
      sendJson(res, 200, {
        devices: sharedDevicesCache.devices,
        updatedAt: sharedDevicesCache.updatedAt,
        lastError: sharedDevicesCache.lastError,
        preferredDeviceId: sharedDevicesCache.preferredDeviceId
      });
    }, 25000);

    deviceSubscribers.push({ res, timeoutId });
    res.on("close", () => {
      const index = deviceSubscribers.findIndex((item) => item.res === res);
      if (index >= 0) {
        clearTimeout(deviceSubscribers[index].timeoutId);
        deviceSubscribers.splice(index, 1);
      }
    });
    return;
  }

  if (pathname === "/api/player/transfer") {
    if (!requirePermission(req, res, "device:transfer")) {
      return;
    }

    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid transfer payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const deviceId = body.deviceId || "";
    const play = typeof body.play === "boolean" ? body.play : true;
    if (!deviceId) {
      return sendJson(res, 400, { error: "Missing deviceId" });
    }

    const response = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ device_ids: [deviceId], play })
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify device transfer failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    sharedQueue.activeDeviceId = deviceId;
    sharedQueue.activeDeviceName = body.deviceName || null;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    if (Array.isArray(sharedDevicesCache.devices) && sharedDevicesCache.devices.length) {
      sharedDevicesCache.devices = sharedDevicesCache.devices.map((device) => ({
        ...device,
        is_active: device.id === deviceId
      }));
      sharedDevicesCache.updatedAt = new Date().toISOString();
      sharedDevicesCache.lastError = null;
      sharedDevicesCache.preferredDeviceId = deviceId;
      notifyDeviceSubscribers();
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/resume") {
    if (!requirePermission(req, res, "playback:resume")) {
      return;
    }

    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const resumeQuery = sharedQueue.activeDeviceId
      ? `?device_id=${encodeURIComponent(sharedQueue.activeDeviceId)}`
      : "";
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play${resumeQuery}`,
      {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify resume failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    updatePlaybackCachePlaying(true);
    sharedQueue.autoPlayEnabled = true;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/seek") {
    if (!requirePermission(req, res, "playback:seek")) {
      return;
    }

    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid seek payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const positionMs = Number(body.position_ms);
    if (!Number.isInteger(positionMs) || positionMs < 0) {
      return sendJson(res, 400, { error: "Invalid position_ms" });
    }

    const seekQuery = `?position_ms=${positionMs}`;
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/seek${seekQuery}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify seek failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    if (sharedPlaybackCache.playback) {
      sharedPlaybackCache.playback.progress_ms = positionMs;
      sharedPlaybackCache.playback.timestamp = Date.now();
      sharedPlaybackCache.updatedAt = new Date().toISOString();
      notifyPlaybackSubscribers();
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/queue/playlist") {
    return sendJson(res, 200, {
      playlistId: sharedQueue.activePlaylistId,
      playlistName: sharedQueue.activePlaylistName,
      playlistImage: sharedQueue.activePlaylistImage,
      playlistOwner: sharedQueue.activePlaylistOwner,
      playlistTrackCount: sharedQueue.activePlaylistTrackCount,
      playlistDescription: sharedQueue.activePlaylistDescription,
      tracks: enrichedTracks(),
      updatedAt: sharedQueue.updatedAt,
      currentIndex: sharedQueue.currentIndex,
      autoPlayEnabled: sharedQueue.autoPlayEnabled,
      voteSortEnabled: sharedQueue.voteSortEnabled,
      lastError: sharedQueue.lastError,
      activeDeviceId: sharedQueue.activeDeviceId,
      activeDeviceName: sharedQueue.activeDeviceName
    });
  }

  if (pathname === "/api/queue/autoplay") {
    if (!requirePermission(req, res, "queue:autoplay")) {
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid autoplay payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const enabled = Boolean(body.enabled);
    sharedQueue.autoPlayEnabled = enabled;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();
    notifyPlaybackSubscribers();

    if (enabled) {
      try {
        if (
          sharedQueue.activePlaylistId &&
          Array.isArray(sharedQueue.tracks) &&
          sharedQueue.tracks.length
        ) {
          if (!(await ensureValidToken(sharedSession))) {
            return sendJson(res, 401, { error: "Not connected" });
          }

          const playbackRes = await fetch(
            "https://api.spotify.com/v1/me/player/currently-playing",
            {
              headers: {
                Authorization: `Bearer ${sharedSession.token}`
              }
            }
          );

          if (playbackRes.status === 204) {
            const first = sharedQueue.tracks[0];
            if (first && first.uri) {
              const started = await playTrackUri(
                first.uri,
                sharedQueue.activeDeviceId
              );
              if (started) {
                sharedQueue.currentIndex = 0;
                sharedQueue.lastSeenTrackId = first.id || null;
                sharedQueue.lastAdvanceAt = Date.now();
                sharedQueue.updatedAt = new Date().toISOString();
                persistQueueStore();
                logInfo("Auto play: started first track after enable", {
                  trackId: first.id || null
                });
              }
            }
          } else if (playbackRes.ok) {
            const playback = await playbackRes.json();
            const currentId =
              playback && playback.item ? playback.item.id : null;
            const matchIndex = sharedQueue.tracks.findIndex(
              (track) => track.id === currentId
            );
            if (matchIndex === -1) {
              const first = sharedQueue.tracks[0];
              if (first && first.uri) {
                const started = await playTrackUri(
                  first.uri,
                  sharedQueue.activeDeviceId
                );
                if (started) {
                  sharedQueue.currentIndex = 0;
                  sharedQueue.lastSeenTrackId = first.id || null;
                  sharedQueue.lastAdvanceAt = Date.now();
                  sharedQueue.updatedAt = new Date().toISOString();
                  persistQueueStore();
                  logInfo("Auto play: started first track after enable", {
                    trackId: first.id || null
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        logWarn("Auto play enable check failed", null, error);
      }
    }

    return sendJson(res, 200, {
      ok: true,
      autoPlayEnabled: sharedQueue.autoPlayEnabled
    });
  }

  if (pathname === "/api/queue/votesort") {
    if (!requirePermission(req, res, "queue:votesort")) {
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid vote-sort payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const enabled = Boolean(body.enabled);
    sharedQueue.voteSortEnabled = enabled;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();
    notifyPlaybackSubscribers();

    logInfo("Vote sort toggled", { voteSortEnabled: enabled });

    return sendJson(res, 200, {
      ok: true,
      voteSortEnabled: sharedQueue.voteSortEnabled
    });
  }

  if (pathname === "/api/queue/playlist/select") {
    if (!requirePermission(req, res, "queue:playlist:select")) {
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist select payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const playlistId = body.playlistId || "";
    const playlistName = body.playlistName || "";
    const playlistImage = body.playlistImage || "";
    if (!playlistId) {
      return sendJson(res, 400, { error: "Missing playlistId" });
    }

    sharedQueue.activePlaylistId = playlistId;
    sharedQueue.activePlaylistName = playlistName || null;
    const newImage = playlistImage || null;
    if (sharedQueue.activePlaylistImage !== newImage) {
      logDebug("activePlaylistImage overwrite in /api/queue/playlist/activate", {
        old: sharedQueue.activePlaylistImage,
        new: newImage,
        playlistId: playlistId
      });
    }
    sharedQueue.activePlaylistImage = newImage;
    sharedQueue.updatedAt = new Date().toISOString();
    if (
      !Number.isInteger(sharedQueue.currentIndex) ||
      sharedQueue.currentIndex < 0
    ) {
      sharedQueue.currentIndex = 0;
    }
    persistQueueStore();

    return sendJson(res, 200, {
      ok: true,
      playlistId: sharedQueue.activePlaylistId,
      playlistName: sharedQueue.activePlaylistName,
      playlistImage: sharedQueue.activePlaylistImage
    });
  }

  if (pathname === "/api/queue/playlist/load") {
    if (!requirePermission(req, res, "queue:playlist:load")) {
      return;
    }

    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist load payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const playlistId = body.playlistId || "";
    let playlistName = body.playlistName || "";
    let playlistImage = body.playlistImage || "";
    if (!playlistId) {
      return sendJson(res, 400, { error: "Missing playlistId" });
    }

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist tracks load failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    let playlistOwner = body.playlistOwner || "";
    let playlistTrackCount = body.playlistTrackCount != null ? body.playlistTrackCount : null;
    let playlistDescription = body.playlistDescription || "";

    const needsMeta = !playlistName || !playlistImage || !playlistOwner;
    if (needsMeta) {
      try {
        const playlistMetaRes = await fetch(
          `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images,owner(display_name),description,tracks(total)`,
          {
            headers: {
              Authorization: `Bearer ${sharedSession.token}`
            }
          }
        );
        if (playlistMetaRes.ok) {
          const playlistMeta = await playlistMetaRes.json();
          if (!playlistName) {
            playlistName = playlistMeta.name || "";
          }
          if (!playlistImage) {
            playlistImage =
              playlistMeta.images &&
              playlistMeta.images[0] &&
              playlistMeta.images[0].url
                ? playlistMeta.images[0].url
                : "";
          }
          if (!playlistOwner) {
            playlistOwner =
              playlistMeta.owner && playlistMeta.owner.display_name
                ? playlistMeta.owner.display_name
                : "";
          }
          if (playlistTrackCount === null) {
            playlistTrackCount =
              playlistMeta.tracks && Number.isInteger(playlistMeta.tracks.total)
                ? playlistMeta.tracks.total
                : null;
          }
          if (!playlistDescription) {
            playlistDescription = playlistMeta.description || "";
          }
        }
      } catch (error) {
        logWarn("Playlist metadata fetch failed", { playlistId }, error);
      }
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const addedAt = new Date().toISOString();
    const tracks = items
      .map((item) => item.track)
      .filter(Boolean)
      .map((track) => ({
        id: track.id,
        uri: track.uri,
        title: track.name,
        artist: (track.artists || []).map((artist) => artist.name).join(", "),
        image:
          track.album && track.album.images && track.album.images[0]
            ? track.album.images[0].url
            : "",
        album: track.album ? track.album.name : "",
        duration_ms: track.duration_ms || null,
        source: "playlist",
        addedTimestamp: addedAt,
        votes: { up: [], down: [] }
      }));

    sharedQueue.activePlaylistId = playlistId;
    sharedQueue.activePlaylistName = playlistName || null;
    const newImage = playlistImage || null;
    if (sharedQueue.activePlaylistImage !== newImage) {
      logDebug("activePlaylistImage overwrite in /api/queue/playlist/load", {
        old: sharedQueue.activePlaylistImage,
        new: newImage,
        playlistId: playlistId
      });
    }
    sharedQueue.activePlaylistImage = newImage;
    sharedQueue.activePlaylistOwner = playlistOwner || null;
    sharedQueue.activePlaylistTrackCount = playlistTrackCount;
    sharedQueue.activePlaylistDescription = playlistDescription || null;

    // Preserve the currently playing track at position 0
    var currentTrack = null;
    if (
      Array.isArray(sharedQueue.tracks) &&
      Number.isInteger(sharedQueue.currentIndex) &&
      sharedQueue.currentIndex >= 0 &&
      sharedQueue.currentIndex < sharedQueue.tracks.length
    ) {
      currentTrack = sharedQueue.tracks[sharedQueue.currentIndex];
    }

    if (currentTrack && currentTrack.id) {
      var dupeIndex = tracks.findIndex(function (t) { return t.id === currentTrack.id; });
      if (dupeIndex >= 0) {
        tracks.splice(dupeIndex, 1);
      }
      tracks.unshift(currentTrack);
      logInfo("Playlist load: preserved current track at position 0", {
        trackId: currentTrack.id,
        title: currentTrack.title
      });
    }

    sharedQueue.tracks = tracks;
    sharedQueue.updatedAt = new Date().toISOString();
    sharedQueue.currentIndex = 0;
    sharedQueue.lastSeenTrackId = currentTrack ? (currentTrack.id || null) : null;
    sharedQueue.lastAdvanceAt = currentTrack ? Date.now() : null;
    persistQueueStore();

    return sendJson(res, 200, {
      ok: true,
      playlistId: sharedQueue.activePlaylistId,
      playlistName: sharedQueue.activePlaylistName,
      playlistImage: sharedQueue.activePlaylistImage,
      playlistOwner: sharedQueue.activePlaylistOwner,
      playlistTrackCount: sharedQueue.activePlaylistTrackCount,
      playlistDescription: sharedQueue.activePlaylistDescription,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/playlist/add") {
    if (!requirePermission(req, res, "queue:add")) {
      return;
    }

    const session = getUserSession(req);

    if (!session.name || session.name.trim() === "") {
      return sendJson(res, 400, {
        error: "Name is required to add tracks. Please set your name first."
      });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist add payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const track = body.track || null;
    const position =
      Number.isInteger(body.position) && body.position >= 0
        ? body.position
        : null;

    if (!track || !track.uri) {
      return sendJson(res, 400, { error: "Missing track data" });
    }

    const normalized = {
      id: track.id || null,
      uri: track.uri,
      title: track.title || "Unknown title",
      artist: track.artist || "Unknown artist",
      image: track.image || "",
      album: track.album || "",
      duration_ms: track.duration_ms || null,
      source: "user",
      addedTimestamp: new Date().toISOString(),
      addedBy: {
        sessionId: session.sessionId,
        name: session.name,
        role: session.role
      },
      votes: { up: [], down: [] }
    };

    if (position === null || position >= sharedQueue.tracks.length) {
      sharedQueue.tracks.push(normalized);
    } else {
      sharedQueue.tracks.splice(position, 0, normalized);
      if (
        Number.isInteger(sharedQueue.currentIndex) &&
        position <= sharedQueue.currentIndex
      ) {
        sharedQueue.currentIndex += 1;
      }
    }

    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    logInfo("Track added to queue", {
      trackId: normalized.id,
      addedBy: session.name,
      role: session.role
    });

    return sendJson(res, 200, {
      ok: true,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/vote") {
    if (!requirePermission(req, res, "queue:vote")) {
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid vote payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const trackId = body.trackId || "";
    const direction = body.direction;
    if (!trackId || (direction !== "up" && direction !== "down")) {
      return sendJson(res, 400, { error: "Missing trackId or invalid direction (up/down)" });
    }

    const track = sharedQueue.tracks.find((t) => t.id === trackId);
    if (!track) {
      return sendJson(res, 404, { error: "Track not found in queue" });
    }

    if (!track.votes) {
      track.votes = { up: [], down: [] };
    }

    const session = getUserSession(req);
    const isAdmin = session.role === "admin";
    const voter = { sessionId: session.sessionId, name: session.name || "" };

    if (isAdmin) {
      track.votes[direction].push(voter);
    } else {
      const prevUp = track.votes.up.findIndex((v) => v.sessionId === session.sessionId);
      const prevDown = track.votes.down.findIndex((v) => v.sessionId === session.sessionId);
      const wasSameDirection =
        (direction === "up" && prevUp >= 0) || (direction === "down" && prevDown >= 0);

      if (prevUp >= 0) track.votes.up.splice(prevUp, 1);
      if (prevDown >= 0) track.votes.down.splice(prevDown, 1);

      if (!wasSameDirection) {
        track.votes[direction].push(voter);
      }
    }

    // Resort upcoming window by net votes if vote-sort is enabled
    const VOTE_SORT_WINDOW = 10;
    let didSort = false;
    if (sharedQueue.voteSortEnabled && sharedQueue.tracks.length > 2) {
      const windowEnd = Math.min(1 + VOTE_SORT_WINDOW, sharedQueue.tracks.length);
      const window = sharedQueue.tracks.slice(1, windowEnd);
      window.sort((a, b) => {
        const aVotes = a.votes ? (a.votes.up.length - a.votes.down.length) : 0;
        const bVotes = b.votes ? (b.votes.up.length - b.votes.down.length) : 0;
        return bVotes - aVotes;
      });
      sharedQueue.tracks = [
        sharedQueue.tracks[0],
        ...window,
        ...sharedQueue.tracks.slice(windowEnd)
      ];
      didSort = true;
    }

    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    const userVoteUp = track.votes.up.some((v) => v.sessionId === session.sessionId);
    const userVoteDown = track.votes.down.some((v) => v.sessionId === session.sessionId);

    logDebug("Vote recorded", {
      trackId,
      direction,
      sessionId: session.sessionId,
      upCount: track.votes.up.length,
      downCount: track.votes.down.length,
      didSort
    });

    return sendJson(res, 200, {
      ok: true,
      sorted: didSort,
      votes: {
        up: track.votes.up.length,
        down: track.votes.down.length,
        userVote: userVoteUp ? "up" : userVoteDown ? "down" : null
      }
    });
  }

  if (pathname === "/api/queue/playlist/clear") {
    if (!requirePermission(req, res, "queue:clear")) {
      return;
    }

    sharedQueue.tracks = [];
    sharedQueue.updatedAt = new Date().toISOString();
    sharedQueue.currentIndex = 0;
    sharedQueue.lastSeenTrackId = null;
    sharedQueue.lastAdvanceAt = null;
    persistQueueStore();
    notifyPlaybackSubscribers();

    const session = getUserSession(req);
    logInfo("Queue cleared", {
      clearedBy: session.name,
      role: session.role
    });

    return sendJson(res, 200, {
      ok: true,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/playlist/remove") {
    const session = getUserSession(req);

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist remove payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const index = Number(body.index);
    if (
      Number.isNaN(index) ||
      index < 0 ||
      index >= sharedQueue.tracks.length
    ) {
      return sendJson(res, 400, { error: "Invalid index" });
    }

    const track = sharedQueue.tracks[index];
    const isOwner = track.addedBy && track.addedBy.sessionId === session.sessionId;
    const canRemoveAny = hasPermission("queue:remove:any", session.role);

    if (!isOwner && !canRemoveAny) {
      logWarn("Remove denied: not owner", {
        trackIndex: index,
        trackAddedBy: track.addedBy && track.addedBy.name,
        requestedBy: session.name,
        role: session.role
      });
      return sendJson(res, 403, {
        error: "You can only remove tracks you added"
      });
    }

    const removed = sharedQueue.tracks.splice(index, 1)[0];
    if (Number.isInteger(sharedQueue.currentIndex)) {
      if (index < sharedQueue.currentIndex) {
        sharedQueue.currentIndex -= 1;
      } else if (index === sharedQueue.currentIndex) {
        sharedQueue.lastSeenTrackId = null;
      }
      if (sharedQueue.currentIndex >= sharedQueue.tracks.length) {
        sharedQueue.currentIndex = Math.max(sharedQueue.tracks.length - 1, 0);
      }
    }
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    logInfo("Track removed from queue", {
      trackId: removed.id,
      removedBy: session.name,
      role: session.role,
      wasOwner: isOwner
    });

    return sendJson(res, 200, {
      ok: true,
      removed: removed ? removed.id : null,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/playlist/reorder") {
    if (!requirePermission(req, res, "queue:reorder")) {
      return;
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist reorder payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const fromIndex = Number(body.fromIndex);
    const toIndex = Number(body.toIndex);
    if (
      Number.isNaN(fromIndex) ||
      Number.isNaN(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sharedQueue.tracks.length ||
      toIndex >= sharedQueue.tracks.length
    ) {
      return sendJson(res, 400, { error: "Invalid indices" });
    }

    const [moved] = sharedQueue.tracks.splice(fromIndex, 1);
    sharedQueue.tracks.splice(toIndex, 0, moved);
    if (sharedQueue.currentIndex === fromIndex) {
      sharedQueue.currentIndex = toIndex;
    } else if (fromIndex < sharedQueue.currentIndex && toIndex >= sharedQueue.currentIndex) {
      sharedQueue.currentIndex -= 1;
    } else if (fromIndex > sharedQueue.currentIndex && toIndex <= sharedQueue.currentIndex) {
      sharedQueue.currentIndex += 1;
    }
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    return sendJson(res, 200, {
      ok: true,
      tracks: sharedQueue.tracks
    });
  }

  const playlistTracksMatch = pathname.match(
    /^\/api\/playlists\/([^/]+)\/tracks$/
  );
  if (playlistTracksMatch) {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const playlistId = playlistTracksMatch[1];
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${sharedSession.token}`
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist tracks fetch failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  const playlistAddMatch = pathname.match(/^\/api\/playlists\/([^/]+)\/add$/);
  if (playlistAddMatch) {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid add payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const playlistId = playlistAddMatch[1];
    const position =
      Number.isInteger(body.position) && body.position >= 0
        ? body.position
        : null;
    const payload = {
      uris: Array.isArray(body.uris) ? body.uris : []
    };

    const positionQuery =
      position === null ? "" : `?position=${encodeURIComponent(position)}`;

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks${positionQuery}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sharedSession.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify add track failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }


  const playlistReorderMatch = pathname.match(
    /^\/api\/playlists\/([^/]+)\/reorder$/
  );
  if (playlistReorderMatch) {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid reorder payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const playlistId = playlistReorderMatch[1];
    const payload = {
      range_start: body.range_start,
      insert_before: body.insert_before,
      range_length: body.range_length || 1
    };

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sharedSession.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist reorder failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  const playlistPlayMatch = pathname.match(
    /^\/api\/playlists\/([^/]+)\/play$/
  );
  if (playlistPlayMatch) {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const playlistId = playlistPlayMatch[1];
    const payload = {
      context_uri: `spotify:playlist:${playlistId}`
    };

    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist play failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    if (sharedPlaybackCache.playback) {
      sharedPlaybackCache.playback.progress_ms = 0;
      sharedPlaybackCache.playback.timestamp = Date.now();
    }
    updatePlaybackCachePlaying(true);
    return sendJson(res, 200, { ok: true });
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, async () => {
  logInfo("Server listening", { port: Number(PORT) });

  if (sharedSession.token || sharedSession.refreshToken) {
    try {
      await refreshDevicesCache();
      logInfo("Initial devices cache loaded on startup");
    } catch (err) {
      logWarn("Initial devices cache refresh failed", null, err);
    }
  }
});
