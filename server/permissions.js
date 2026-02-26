/**
 * Centralized permission definitions
 *
 * Each action is mapped to the minimum required role.
 * Roles (hierarchy): 'guest' (default), 'dj', or 'admin'
 *
 * Admin users can perform all actions.
 * DJ users can perform actions marked as 'dj' or 'guest'.
 * Guest users can only perform actions marked as 'guest'.
 */

const ROLE_LEVELS = {
  guest: 0,
  dj: 1,
  admin: 2
};

const PERMISSIONS = {
  // Queue management
  "queue:add": "guest",
  "queue:remove:own": "guest",
  "queue:remove:any": "dj",
  "queue:clear": "admin",
  "queue:reorder": "dj",
  "queue:playlist:select": "dj",
  "queue:playlist:load": "dj",
  "queue:vote": "guest",
  "queue:autoplay": "admin",
  "queue:votesort": "admin",
  "admin:settings": "admin",

  // Playback control
  "playback:pause": "dj",
  "playback:resume": "dj",
  "playback:seek": "dj",
  "track:play": "dj",
  "playback:play": "dj",

  // Device management
  "device:transfer": "admin",
  "device:refresh": "admin",

  // Session management
  "session:connect": "admin",
  "session:logout": "admin",

  // Playlist management (Spotify playlists)
  "playlist:view": "guest",
  "playlist:play": "dj",
  "playlist:add": "dj",
  "playlist:reorder": "dj",
  "playlist:follow": "admin"
};

/**
 * Check if a user has permission to perform an action
 * @param {string} action - The action to check (e.g., 'queue:add')
 * @param {string} userRole - The user's role ('admin', 'dj', or 'guest')
 * @returns {boolean} - True if user has permission
 */
function hasPermission(action, userRole) {
  if (!action || typeof action !== "string") {
    return false;
  }

  const requiredRole = PERMISSIONS[action];

  // If action is not defined, deny by default
  if (!requiredRole) {
    return false;
  }

  const userLevel = ROLE_LEVELS[userRole] !== undefined ? ROLE_LEVELS[userRole] : 0;
  const requiredLevel = ROLE_LEVELS[requiredRole] !== undefined ? ROLE_LEVELS[requiredRole] : ROLE_LEVELS.admin;

  return userLevel >= requiredLevel;
}

/**
 * Get all permissions for a specific role
 * @param {string} role - The role to get permissions for
 * @returns {string[]} - Array of allowed actions
 */
function getPermissionsForRole(role) {
  const roleLevel = ROLE_LEVELS[role] !== undefined ? ROLE_LEVELS[role] : 0;

  return Object.keys(PERMISSIONS).filter((action) => {
    const requiredLevel =
      ROLE_LEVELS[PERMISSIONS[action]] !== undefined
        ? ROLE_LEVELS[PERMISSIONS[action]]
        : ROLE_LEVELS.admin;
    return roleLevel >= requiredLevel;
  });
}

module.exports = {
  PERMISSIONS,
  ROLE_LEVELS,
  hasPermission,
  getPermissionsForRole
};
