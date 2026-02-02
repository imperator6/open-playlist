const http = require("http");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");

const PORT = process.env.PORT || 5173;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/callback`;

const sessions = new Map();
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

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, item) => {
    const [key, value] = item.trim().split("=");
    acc[key] = decodeURIComponent(value || "");
    return acc;
  }, {});
}

function setCookie(res, name, value) {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}

function clearCookie(res, name) {
  const cookie = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}

function getSession(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies.sid;
  if (!sid || !sessions.has(sid)) {
    sid = crypto.randomBytes(16).toString("hex");
    sessions.set(sid, {});
    setCookie(res, "sid", sid);
  }
  return { sid, session: sessions.get(sid) };
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
      if (refreshed.refresh_token) {
        session.refreshToken = refreshed.refresh_token;
      }
      logInfo("Spotify token refreshed", {
        expiresIn: refreshed.expires_in
      });
    } catch (err) {
      logError("Spotify token refresh failed", null, err);
    }
  }
  return tokenValid(session);
}

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

  if (pathname === "/status") {
    const { session } = getSession(req, res);
    return sendJson(res, 200, {
      connected: tokenValid(session),
      expiresAt: session.expiresAt || null,
      hasToken: Boolean(session.token),
      hasRefreshToken: Boolean(session.refreshToken),
      hasRedirectUri: Boolean(session.redirectUri)
    });
  }

  if (pathname === "/login") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return sendJson(res, 500, {
        error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET"
      });
    }

    const { session } = getSession(req, res);
    const state = crypto.randomBytes(12).toString("hex");
    session.state = state;
    const redirectUri =
      process.env.SPOTIFY_REDIRECT_URI ||
      `http://${req.headers.host}/callback`;
    session.redirectUri = redirectUri;

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope:
        "user-read-playback-state user-read-currently-playing " +
        "playlist-read-private playlist-read-collaborative " +
        "playlist-modify-public playlist-modify-private " +
        "user-read-private",
      state
    });

    logInfo("Redirecting to Spotify authorize", {
      redirectUri,
      host: req.headers.host
    });
    res.writeHead(302, {
      Location: `https://accounts.spotify.com/authorize?${params}`
    });
    return res.end();
  }

  if (pathname === "/callback") {
    const { session } = getSession(req, res);
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

    if (!code || !state || state !== session.state) {
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
        session.redirectUri || REDIRECT_URI
      );
      session.token = token.access_token;
      session.expiresAt = Date.now() + token.expires_in * 1000;
      session.refreshToken = token.refresh_token || session.refreshToken;
      session.state = null;
      session.redirectUri = null;
      logInfo("Spotify token exchange success", {
        expiresIn: token.expires_in
      });
      res.writeHead(302, { Location: "/" });
      return res.end();
    } catch (err) {
      logError("Spotify token exchange failed", null, err);
      res.writeHead(302, { Location: "/?error=auth" });
      return res.end();
    }
  }

  if (pathname === "/logout") {
    const { sid } = getSession(req, res);
    sessions.delete(sid);
    clearCookie(res, "sid");
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  if (pathname === "/search") {
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
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
          Authorization: `Bearer ${session.token}`
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
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const headers = {
      Authorization: `Bearer ${session.token}`
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
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const response = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        headers: {
          Authorization: `Bearer ${session.token}`
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
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
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
          Authorization: `Bearer ${session.token}`
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

  const playlistTracksMatch = pathname.match(
    /^\/api\/playlists\/([^/]+)\/tracks$/
  );
  if (playlistTracksMatch) {
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    const playlistId = playlistTracksMatch[1];
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${session.token}`
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
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
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
    const payload = {
      uris: Array.isArray(body.uris) ? body.uris : []
    };

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
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

  if (pathname === "/api/playlists/create") {
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
      return sendJson(res, 401, { error: "Not connected" });
    }

    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (err) {
      logWarn("Invalid create payload", null, err);
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }

    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${session.token}`
      }
    });

    if (!meRes.ok) {
      const text = await meRes.text();
      logError("Spotify profile fetch failed", {
        status: meRes.status,
        body: text
      });
      return sendJson(res, 502, { error: "Spotify request failed" });
    }

    const me = await meRes.json();
    const payload = {
      name: body.name || "Waiting List",
      description: "Managed by spotify-codex waiting list",
      public: false
    };

    const response = await fetch(
      `https://api.spotify.com/v1/users/${me.id}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const text = await response.text();
      logError("Spotify playlist create failed", {
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
    const { session } = getSession(req, res);
    if (!(await ensureValidToken(session))) {
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
          Authorization: `Bearer ${session.token}`,
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

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  logInfo("Server listening", { port: Number(PORT) });
});
