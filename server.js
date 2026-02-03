const http = require("http");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");

const PORT = process.env.PORT || 5173;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const HOST_PIN = process.env.HOST_PIN || "";
const AUTO_REFRESH =
  String(process.env.AUTO_REFRESH || "1").toLowerCase() === "1";
const SESSION_STORE = path.join(__dirname, "session_store.json");
const QUEUE_STORE = path.join(__dirname, "queue_store.json");
const DEFAULT_PLAYLIST_ID = process.env.DEFAULT_PLAYLIST_ID || "";
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/callback`;

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
  tracks: [],
  updatedAt: null,
  currentIndex: 0,
  autoPlayEnabled: true,
  lastSeenTrackId: null,
  lastAdvanceAt: null,
  lastError: null
};
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
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message
  };

  if (context && typeof context === "object") {
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined) {
        payload[key] = value;
      }
    });
  }

  if (err) {
    payload.error = {
      message: err.message,
      stack: err.stack
    };
  }

  const line = JSON.stringify(payload);
  writeLog(line, level === "ERROR");
}

function logInfo(message, context) {
  log("INFO", message, context);
}

function logWarn(message, context, err) {
  log("WARN", message, context, err);
}

function logError(message, context, err) {
  log("ERROR", message, context, err);
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
    sharedQueue.tracks = Array.isArray(data.tracks) ? data.tracks : [];
    sharedQueue.updatedAt = data.updatedAt || null;
    sharedQueue.currentIndex =
      Number.isInteger(data.currentIndex) && data.currentIndex >= 0
        ? data.currentIndex
        : 0;
    sharedQueue.autoPlayEnabled =
      typeof data.autoPlayEnabled === "boolean" ? data.autoPlayEnabled : true;
    sharedQueue.lastSeenTrackId = data.lastSeenTrackId || null;
    sharedQueue.lastAdvanceAt = data.lastAdvanceAt || null;
    sharedQueue.lastError = data.lastError || null;
    logInfo("Loaded queue store", {
      hasActivePlaylist: Boolean(sharedQueue.activePlaylistId),
      trackCount: sharedQueue.tracks.length,
      autoPlayEnabled: sharedQueue.autoPlayEnabled
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
      tracks: sharedQueue.tracks,
      updatedAt: sharedQueue.updatedAt,
      currentIndex: sharedQueue.currentIndex,
      autoPlayEnabled: sharedQueue.autoPlayEnabled,
      lastSeenTrackId: sharedQueue.lastSeenTrackId,
      lastAdvanceAt: sharedQueue.lastAdvanceAt,
      lastError: sharedQueue.lastError
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
  const envPath = path.join(__dirname, ".env");
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

if (!HOST_PIN) {
  logWarn("HOST_PIN is not set; host actions are unsecured");
}

readSessionStore();
readQueueStore();

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function verifyHostPin(pin) {
  if (!HOST_PIN) return true;
  return pin === HOST_PIN;
}

function readStaticFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType =
    ext === ".css"
      ? "text/css"
      : ext === ".js"
      ? "text/javascript"
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

function getServerTrack(index) {
  if (!Array.isArray(sharedQueue.tracks)) return null;
  if (index < 0 || index >= sharedQueue.tracks.length) return null;
  return sharedQueue.tracks[index];
}

async function playTrackUri(uri) {
  const response = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${sharedSession.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uris: [uri] })
  });

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

async function autoPlayTick() {
  logInfo("Auto play tick", {
    autoPlayEnabled: sharedQueue.autoPlayEnabled,
    hasPlaylist: Boolean(sharedQueue.activePlaylistId),
    trackCount: sharedQueue.tracks.length
  });
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

  const response = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
    }
  );

  if (response.status === 204) {
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
      const started = await playTrackUri(currentTrack.uri);
      if (started) {
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
    const started = await playTrackUri(nextTrack.uri);
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
      sharedQueue.updatedAt = new Date().toISOString();
      persistQueueStore();
      logInfo("Auto play: next track sent to Spotify", {
        index: sharedQueue.currentIndex,
        trackId: nextTrack.id || null
      });
    }
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    logWarn("Spotify playback poll failed", { status: response.status, body: text });
    return;
  }

  const data = await response.json();
  const item = data && data.item ? data.item : null;
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
      isPlaying: Boolean(data.is_playing)
    });
    if (sharedQueue.lastSeenTrackId !== item.id) {
      sharedQueue.lastSeenTrackId = item.id || null;
      persistQueueStore();
    }

    if (!data.is_playing) {
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
      const started = await playTrackUri(nextTrack.uri);
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
        sharedQueue.updatedAt = new Date().toISOString();
        persistQueueStore();
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
    return readStaticFile(path.join(__dirname, "index.html"), res);
  }
  if (pathname === "/session" || pathname === "/session.html") {
    return readStaticFile(path.join(__dirname, "session.html"), res);
  }
  if (pathname === "/queue" || pathname === "/queue.html") {
    return readStaticFile(path.join(__dirname, "queue.html"), res);
  }
  if (pathname === "/playlist" || pathname === "/playlist.html") {
    return readStaticFile(path.join(__dirname, "playlist.html"), res);
  }
  if (pathname === "/styles.css") {
    return readStaticFile(path.join(__dirname, "styles.css"), res);
  }
  if (pathname === "/app.js") {
    return readStaticFile(path.join(__dirname, "app.js"), res);
  }
  if (pathname === "/session.js") {
    return readStaticFile(path.join(__dirname, "session.js"), res);
  }
  if (pathname === "/queue.js") {
    return readStaticFile(path.join(__dirname, "queue.js"), res);
  }
  if (pathname === "/playlist.js") {
    return readStaticFile(path.join(__dirname, "playlist.js"), res);
  }

  if (pathname === "/status") {
    return sendJson(res, 200, {
      connected: tokenValid(sharedSession),
      expiresAt: sharedSession.expiresAt || null,
      lastRefreshAt: sharedSession.lastRefreshAt || null,
      hasToken: Boolean(sharedSession.token),
      hasRefreshToken: Boolean(sharedSession.refreshToken),
      hasRedirectUri: Boolean(sharedSession.redirectUri),
      hostPinRequired: Boolean(HOST_PIN),
      defaultPlaylistId: DEFAULT_PLAYLIST_ID || null
    });
  }

  if (pathname === "/api/host/connect") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return sendJson(res, 500, {
        error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET"
      });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid host connect payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    if (!verifyHostPin(body.pin || "")) {
      logWarn("Host connect denied");
      return sendJson(res, 403, { error: "Invalid PIN" });
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
        "user-read-private user-modify-playback-state",
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
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid host logout payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    if (!verifyHostPin(body.pin || "")) {
      logWarn("Host logout denied");
      return sendJson(res, 403, { error: "Invalid PIN" });
    }

    sharedSession.token = null;
    sharedSession.refreshToken = null;
    sharedSession.expiresAt = null;
    sharedSession.lastRefreshAt = null;
    sharedSession.state = null;
    sharedSession.redirectUri = null;
    persistSessionStore();
    logInfo("Host logged out");
    return sendJson(res, 200, { ok: true });
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

    const headers = {
      Authorization: `Bearer ${sharedSession.token}`
    };

    const [playbackRes, queueRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        headers
      }),
      fetch("https://api.spotify.com/v1/me/player/queue", { headers })
    ]);

    if (!playbackRes.ok && playbackRes.status !== 204) {
      const text = await playbackRes.text();
      logError("Spotify playback failed", {
        status: playbackRes.status,
        body: text
      });
      return sendJson(res, 502, { error: "Playback request failed" });
    }

    if (!queueRes.ok) {
      const text = await queueRes.text();
      logError("Spotify queue failed", {
        status: queueRes.status,
        body: text
      });
      return sendJson(res, 502, { error: "Queue request failed" });
    }

    const playback =
      playbackRes.status === 204 ? null : await playbackRes.json();
    const queue = await queueRes.json();

    return sendJson(res, 200, {
      playback,
      queue
    });
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

  if (pathname === "/api/track-search") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      return sendJson(res, 400, { error: "Missing query" });
    }

    const params = new URLSearchParams({
      q: query,
      type: "track",
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

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid play track payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const uri = body.uri || "";
    const trackId = body.trackId || "";
    if (!uri) {
      return sendJson(res, 400, { error: "Missing track uri" });
    }

    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uris: [uri] })
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify track play failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    if (trackId && Array.isArray(sharedQueue.tracks)) {
      const index = sharedQueue.tracks.findIndex((track) => track.id === trackId);
      if (index >= 0) {
        sharedQueue.currentIndex = index;
        sharedQueue.lastSeenTrackId = trackId;
        sharedQueue.lastAdvanceAt = Date.now();
        sharedQueue.updatedAt = new Date().toISOString();
        persistQueueStore();
      }
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/pause") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const response = await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify pause failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    sharedQueue.autoPlayEnabled = false;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/devices") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

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
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const data = await response.json();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/player/transfer") {
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

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/player/resume") {
    if (!(await ensureValidToken(sharedSession))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sharedSession.token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify resume failed", {
        status: response.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    sharedQueue.autoPlayEnabled = true;
    sharedQueue.updatedAt = new Date().toISOString();
    persistQueueStore();

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/queue/playlist") {
    return sendJson(res, 200, {
      playlistId: sharedQueue.activePlaylistId,
      playlistName: sharedQueue.activePlaylistName,
      tracks: sharedQueue.tracks,
      updatedAt: sharedQueue.updatedAt,
      currentIndex: sharedQueue.currentIndex,
      autoPlayEnabled: sharedQueue.autoPlayEnabled,
      lastError: sharedQueue.lastError
    });
  }

  if (pathname === "/api/queue/autoplay") {
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
              const started = await playTrackUri(first.uri);
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
                const started = await playTrackUri(first.uri);
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

  if (pathname === "/api/queue/playlist/select") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid playlist select payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const playlistId = body.playlistId || "";
    const playlistName = body.playlistName || "";
    if (!playlistId) {
      return sendJson(res, 400, { error: "Missing playlistId" });
    }

    sharedQueue.activePlaylistId = playlistId;
    sharedQueue.activePlaylistName = playlistName || null;
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
      playlistName: sharedQueue.activePlaylistName
    });
  }

  if (pathname === "/api/queue/playlist/load") {
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
    const playlistName = body.playlistName || "";
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
    const items = Array.isArray(data.items) ? data.items : [];
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
        album: track.album ? track.album.name : ""
      }));

    sharedQueue.activePlaylistId = playlistId;
    sharedQueue.activePlaylistName = playlistName || null;
    sharedQueue.tracks = tracks;
    sharedQueue.updatedAt = new Date().toISOString();
    sharedQueue.currentIndex = 0;
    sharedQueue.lastSeenTrackId = null;
    sharedQueue.lastAdvanceAt = null;
    persistQueueStore();

    return sendJson(res, 200, {
      ok: true,
      playlistId: sharedQueue.activePlaylistId,
      playlistName: sharedQueue.activePlaylistName,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/playlist/add") {
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
      album: track.album || ""
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

    return sendJson(res, 200, {
      ok: true,
      tracks: sharedQueue.tracks
    });
  }

  if (pathname === "/api/queue/playlist/reorder") {
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

    return sendJson(res, 200, { ok: true });
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  logInfo("Server listening", { port: Number(PORT) });
});
