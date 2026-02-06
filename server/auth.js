const crypto = require("crypto");

/**
 * Authentication and session management utilities
 */

const SESSION_COOKIE_NAME = "spotify_codex_session";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "default-secret-change-in-production";

// In-memory session store (simple approach for party app)
// Maps sessionId -> { sessionId, role, name, createdAt }
const sessions = new Map();

/**
 * Generate a unique session ID
 * @returns {string} - UUID-like session ID
 */
function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Sign a session object for cookie storage
 * @param {Object} session - Session data
 * @returns {string} - Signed session string
 */
function signSession(session) {
  const payload = JSON.stringify(session);
  const signature = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${signature}`;
}

/**
 * Verify and parse a signed session cookie
 * @param {string} signedSession - Signed session string
 * @returns {Object|null} - Session object or null if invalid
 */
function verifySession(signedSession) {
  if (!signedSession || typeof signedSession !== "string") {
    return null;
  }

  const parts = signedSession.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;

  try {
    const payload = Buffer.from(payloadBase64, "base64").toString("utf-8");
    const expectedSignature = crypto
      .createHmac("sha256", COOKIE_SECRET)
      .update(payload)
      .digest("hex");

    if (signature !== expectedSignature) {
      return null;
    }

    const session = JSON.parse(payload);
    return session;
  } catch (err) {
    return null;
  }
}

/**
 * Parse session cookie from request headers
 * @param {Object} req - HTTP request object
 * @returns {Object|null} - Session object or null
 */
function parseSessionFromRequest(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});

  const signedSession = cookies[SESSION_COOKIE_NAME];
  if (!signedSession) {
    return null;
  }

  return verifySession(signedSession);
}

/**
 * Create or update a session
 * @param {string} sessionId - Session ID (or generate new if not provided)
 * @param {string} role - User role ('admin' or 'guest')
 * @param {string} name - User name
 * @returns {Object} - Session object
 */
function createSession(sessionId, role, name) {
  const id = sessionId || generateSessionId();
  const session = {
    sessionId: id,
    role: role || "guest",
    name: name || "",
    createdAt: Date.now()
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object|null} - Session object or null
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Update session data
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} - Updated session or null
 */
function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const updated = { ...session, ...updates };
  sessions.set(sessionId, updated);
  return updated;
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 */
function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Create Set-Cookie header value
 * @param {Object} session - Session object
 * @param {Object} options - Cookie options
 * @returns {string} - Set-Cookie header value
 */
function createSessionCookie(session, options = {}) {
  const signedSession = signSession(session);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedSession)}`,
    "Path=/",
    "SameSite=Lax"
  ];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.maxAge) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

/**
 * Create a Set-Cookie header to clear the session cookie
 * @returns {string} - Set-Cookie header value
 */
function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

/**
 * Get or create a guest session from request
 * Creates a new guest session if none exists
 * @param {Object} req - HTTP request object
 * @returns {Object} - Session object
 */
function getOrCreateGuestSession(req) {
  let session = parseSessionFromRequest(req);

  if (!session || !session.sessionId) {
    // Create new guest session
    session = createSession(null, "guest", "");
  } else {
    // Ensure session exists in store
    const stored = getSession(session.sessionId);
    if (!stored) {
      // Session was lost (server restart), recreate
      createSession(session.sessionId, session.role, session.name);
    }
  }

  return session;
}

module.exports = {
  SESSION_COOKIE_NAME,
  generateSessionId,
  signSession,
  verifySession,
  parseSessionFromRequest,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  createSessionCookie,
  clearSessionCookie,
  getOrCreateGuestSession
};
