/**
 * Centralized permission definitions
 *
 * Each action is mapped to the minimum required role.
 * Roles: 'guest' (default) or 'admin'
 *
 * Admin users can perform all actions.
 * Guest users can only perform actions marked as 'guest'.
 */

const PERMISSIONS = {
  // Queue management
  "queue:add": "guest",
  "queue:remove:own": "guest",
  "queue:remove:any": "admin",
  "queue:clear": "admin",
  "queue:reorder": "admin",
  "queue:playlist:select": "admin",
  "queue:playlist:load": "admin",
  "queue:autoplay": "admin",

  // Playback control
  "playback:pause": "admin",
  "playback:resume": "admin",
  "playback:seek": "admin",
  "track:play": "admin",
  "playback:play": "admin",

  // Device management
  "device:transfer": "admin",
  "device:refresh": "admin",

  // Session management
  "session:connect": "admin",
  "session:logout": "admin",

  // Playlist management (Spotify playlists)
  "playlist:view": "guest",
  "playlist:play": "admin",
  "playlist:add": "admin",
  "playlist:reorder": "admin"
};

/**
 * Check if a user has permission to perform an action
 * @param {string} action - The action to check (e.g., 'queue:add')
 * @param {string} userRole - The user's role ('admin' or 'guest')
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

  // Admin can do everything
  if (userRole === "admin") {
    return true;
  }

  // For guest, check if the action allows guest access
  return requiredRole === "guest";
}

/**
 * Get all permissions for a specific role
 * @param {string} role - The role to get permissions for
 * @returns {string[]} - Array of allowed actions
 */
function getPermissionsForRole(role) {
  if (role === "admin") {
    return Object.keys(PERMISSIONS);
  }

  return Object.keys(PERMISSIONS).filter(
    (action) => PERMISSIONS[action] === "guest"
  );
}

module.exports = {
  PERMISSIONS,
  hasPermission,
  getPermissionsForRole
};
