/**
 * Client-side authentication and authorization
 */

console.log("auth.js loading...");

const ROLE_LEVELS = { guest: 0, dj: 1, admin: 2 };

let currentUser = {
  role: "guest",
  name: "",
  sessionId: null,
  permissions: []
};

const adminModal = document.getElementById("admin-login-modal");
const adminPasswordInput = document.getElementById("admin-password");
const adminLoginForm = document.getElementById("admin-login-form");
const adminLoginError = document.getElementById("admin-login-error");
const adminCloseBtn = document.getElementById("admin-login-close");

const djModal = document.getElementById("dj-login-modal");
const djPasswordInput = document.getElementById("dj-password");
const djLoginForm = document.getElementById("dj-login-form");
const djLoginError = document.getElementById("dj-login-error");
const djCloseBtn = document.getElementById("dj-login-close");

console.log("auth.js DOM elements found:");
console.log("- adminModal:", adminModal);
console.log("- adminPasswordInput:", adminPasswordInput);
console.log("- adminLoginForm:", adminLoginForm);
console.log("- djModal:", djModal);

const nameModal = document.getElementById("name-prompt-modal");
const nameInput = document.getElementById("guest-name-input");
const nameForm = document.getElementById("name-prompt-form");
const nameError = document.getElementById("name-prompt-error");
const nameCloseBtn = document.getElementById("name-prompt-close");

const userBadge = document.getElementById("user-badge");
const userRoleText = document.getElementById("user-role");
const userNameText = document.getElementById("user-name");
const adminMenuLink = document.getElementById("admin-menu-link");
const djMenuLink = document.getElementById("dj-menu-link");
const logoutMenuLink = document.getElementById("logout-menu-link");

console.log("- adminMenuLink:", adminMenuLink);
console.log("- djMenuLink:", djMenuLink);
console.log("- logoutMenuLink:", logoutMenuLink);
console.log("- userBadge:", userBadge);

/**
 * Fetch current user status from server
 * @returns {Promise<Object>} User object
 */
async function fetchUserStatus() {
  try {
    const response = await fetch("/api/auth/status");
    if (!response.ok) {
      console.error("Failed to fetch user status", response.status);
      return currentUser;
    }

    const data = await response.json();
    currentUser = {
      role: data.role || "guest",
      name: data.name || "",
      sessionId: data.sessionId || null,
      permissions: data.permissions || []
    };

    updateUserBadge();
    updateUIBasedOnRole();
    return currentUser;
  } catch (error) {
    console.error("Error fetching user status", error);
    return currentUser;
  }
}

/**
 * Update the user badge display
 */
function updateUserBadge() {
  console.log("updateUserBadge called, currentUser:", currentUser);
  if (!userBadge) return;

  if (userRoleText) {
    const roleLabels = { admin: "Admin", dj: "DJ", guest: "Guest" };
    userRoleText.textContent = roleLabels[currentUser.role] || "Guest";
  }

  if (userNameText) {
    if (currentUser.name) {
      console.log("Setting user name to:", currentUser.name);
      userNameText.textContent = currentUser.name;
      userNameText.style.display = "";
    } else {
      console.log("No user name, hiding name element");
      userNameText.textContent = "";
      userNameText.style.display = "none";
    }
  }

  userBadge.style.display = "flex";
}

/**
 * Check if current user's role meets the required role level
 * @param {string} requiredRole - The minimum role required
 * @returns {boolean}
 */
function meetsRoleLevel(requiredRole) {
  const userLevel = ROLE_LEVELS[currentUser.role] ?? 0;
  const requiredLevel = ROLE_LEVELS[requiredRole] ?? ROLE_LEVELS.admin;
  return userLevel >= requiredLevel;
}

/**
 * Update UI elements based on user role
 */
function updateUIBasedOnRole() {
  console.log("updateUIBasedOnRole called, role:", currentUser.role);
  const isGuest = currentUser.role === "guest";

  const elements = document.querySelectorAll("[data-role-required]");
  console.log("Found elements with data-role-required:", elements.length);

  elements.forEach((element) => {
    const requiredRole = element.dataset.roleRequired;
    if (!meetsRoleLevel(requiredRole)) {
      console.log("Hiding element:", element.id || element.tagName, element);
      element.style.setProperty("display", "none", "important");
    } else {
      element.style.removeProperty("display");
    }
  });

  // Show login links only for guests, show logout for admin/dj
  if (adminMenuLink) {
    adminMenuLink.style.display = isGuest ? "" : "none";
  }
  if (djMenuLink) {
    djMenuLink.style.display = isGuest ? "" : "none";
  }
  if (logoutMenuLink) {
    logoutMenuLink.style.display = isGuest ? "none" : "";
  }
}

/**
 * Check if current user has a specific permission
 * @param {string} permission - Permission to check
 * @returns {boolean} True if user has permission
 */
function hasPermission(permission) {
  if (currentUser.role === "admin") {
    return true;
  }
  return currentUser.permissions.includes(permission);
}

/**
 * Open admin login modal
 */
function openAdminLogin() {
  console.log("openAdminLogin called");
  if (!adminModal) {
    console.error("adminModal is null - modal element not found!");
    return;
  }
  adminModal.classList.add("is-open");
  adminModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (adminPasswordInput) {
    adminPasswordInput.value = "";
    setTimeout(() => {
      adminPasswordInput.focus();
    }, 100);
  }
  if (adminLoginError) {
    adminLoginError.textContent = "";
  }
}

/**
 * Close admin login modal
 */
function closeAdminLogin() {
  if (!adminModal) return;
  adminModal.classList.remove("is-open");
  adminModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (adminPasswordInput) {
    adminPasswordInput.value = "";
  }
  if (adminLoginError) {
    adminLoginError.textContent = "";
  }
}

/**
 * Submit admin login
 * @param {string} password - Admin password
 * @returns {Promise<boolean>} True if login successful
 */
async function submitAdminLogin(password) {
  try {
    const response = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const data = await response.json();
      if (adminLoginError) {
        adminLoginError.textContent = data.error || "Login failed";
      }
      return false;
    }

    const data = await response.json();
    currentUser = {
      role: data.role,
      name: data.name,
      sessionId: data.sessionId,
      permissions: []
    };

    await fetchUserStatus();
    closeAdminLogin();

    // Close the side menu if it's open
    if (window.menuAPI && typeof window.menuAPI.closeMenu === 'function') {
      window.menuAPI.closeMenu();
    }

    // Redirect to index.html if not already there
    if (!window.location.pathname.endsWith('/index.html') && !window.location.pathname.endsWith('/')) {
      window.location.href = '/index.html';
    }

    return true;
  } catch (error) {
    console.error("Admin login error", error);
    if (adminLoginError) {
      adminLoginError.textContent = "Login failed. Please try again.";
    }
    return false;
  }
}

/**
 * Open DJ login modal
 */
function openDjLogin() {
  console.log("openDjLogin called");
  if (!djModal) {
    console.error("djModal is null - modal element not found!");
    return;
  }
  djModal.classList.add("is-open");
  djModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (djPasswordInput) {
    djPasswordInput.value = "";
    setTimeout(() => {
      djPasswordInput.focus();
    }, 100);
  }
  if (djLoginError) {
    djLoginError.textContent = "";
  }
}

/**
 * Close DJ login modal
 */
function closeDjLogin() {
  if (!djModal) return;
  djModal.classList.remove("is-open");
  djModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (djPasswordInput) {
    djPasswordInput.value = "";
  }
  if (djLoginError) {
    djLoginError.textContent = "";
  }
}

/**
 * Submit DJ login
 * @param {string} password - DJ password
 * @returns {Promise<boolean>} True if login successful
 */
async function submitDjLogin(password) {
  try {
    const response = await fetch("/api/auth/dj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const data = await response.json();
      if (djLoginError) {
        djLoginError.textContent = data.error || "Login failed";
      }
      return false;
    }

    const data = await response.json();
    currentUser = {
      role: data.role,
      name: data.name,
      sessionId: data.sessionId,
      permissions: []
    };

    await fetchUserStatus();
    closeDjLogin();

    // Close the side menu if it's open
    if (window.menuAPI && typeof window.menuAPI.closeMenu === 'function') {
      window.menuAPI.closeMenu();
    }

    // Redirect to index.html if not already there
    if (!window.location.pathname.endsWith('/index.html') && !window.location.pathname.endsWith('/')) {
      window.location.href = '/index.html';
    }

    return true;
  } catch (error) {
    console.error("DJ login error", error);
    if (djLoginError) {
      djLoginError.textContent = "Login failed. Please try again.";
    }
    return false;
  }
}

/**
 * Open name prompt modal
 * @returns {Promise<string|null>} Entered name or null if cancelled
 */
function openNamePrompt() {
  return new Promise((resolve) => {
    if (!nameModal) {
      resolve(null);
      return;
    }

    nameModal.classList.add("is-open");
    nameModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    if (nameInput) {
      nameInput.value = currentUser.name || "";
      setTimeout(() => {
        nameInput.focus();
      }, 100);
    }

    if (nameError) {
      nameError.textContent = "";
    }

    const handleSubmit = async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();

      if (!name) {
        if (nameError) {
          nameError.textContent = "Please enter your name";
        }
        return;
      }

      const success = await submitGuestName(name);
      if (success) {
        cleanup();
        resolve(name);
      }
    };

    const handleClose = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      if (nameForm) {
        nameForm.removeEventListener("submit", handleSubmit);
      }
      if (nameCloseBtn) {
        nameCloseBtn.removeEventListener("click", handleClose);
      }
      closeNamePrompt();
    };

    if (nameForm) {
      nameForm.addEventListener("submit", handleSubmit);
    }
    if (nameCloseBtn) {
      nameCloseBtn.addEventListener("click", handleClose);
    }
  });
}

/**
 * Close name prompt modal
 */
function closeNamePrompt() {
  if (!nameModal) return;
  nameModal.classList.remove("is-open");
  nameModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (nameInput) {
    nameInput.value = "";
  }
  if (nameError) {
    nameError.textContent = "";
  }
}

/**
 * Submit guest name
 * @param {string} name - Guest name
 * @returns {Promise<boolean>} True if successful
 */
async function submitGuestName(name) {
  try {
    const response = await fetch("/api/auth/guest/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const data = await response.json();
      if (nameError) {
        nameError.textContent = data.error || "Failed to set name";
      }
      return false;
    }

    const data = await response.json();
    console.log("Guest name response from server:", data);
    currentUser = {
      role: data.role,
      name: data.name,
      sessionId: data.sessionId,
      permissions: currentUser.permissions
    };
    console.log("Updated currentUser:", currentUser);

    updateUserBadge();
    return true;
  } catch (error) {
    console.error("Set name error", error);
    if (nameError) {
      nameError.textContent = "Failed to set name. Please try again.";
    }
    return false;
  }
}

/**
 * Ensure user has a name set (prompt if not)
 * @returns {Promise<string|null>} User name or null if cancelled
 */
async function ensureUserHasName() {
  if (currentUser.name && currentUser.name.trim() !== "") {
    return currentUser.name;
  }

  return await openNamePrompt();
}

/**
 * Logout current user (admin or dj)
 */
async function logout() {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST"
    });

    if (!response.ok) {
      console.error("Logout failed", response.status);
      return;
    }

    const data = await response.json();
    currentUser = {
      role: data.role,
      name: data.name,
      sessionId: data.sessionId,
      permissions: []
    };

    await fetchUserStatus();
  } catch (error) {
    console.error("Logout error", error);
  }
}

// Admin login form
if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = adminPasswordInput.value;
    await submitAdminLogin(password);
  });
}

if (adminCloseBtn) {
  adminCloseBtn.addEventListener("click", () => {
    closeAdminLogin();
  });
}

if (adminModal) {
  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminLogin();
    }
  });
}

// DJ login form
if (djLoginForm) {
  djLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = djPasswordInput.value;
    await submitDjLogin(password);
  });
}

if (djCloseBtn) {
  djCloseBtn.addEventListener("click", () => {
    closeDjLogin();
  });
}

if (djModal) {
  djModal.addEventListener("click", (event) => {
    if (event.target === djModal) {
      closeDjLogin();
    }
  });
}

// Menu links
console.log("adminMenuLink element:", adminMenuLink);
if (adminMenuLink) {
  console.log("Attaching click event listener to admin menu link");
  adminMenuLink.addEventListener("click", (event) => {
    console.log("Admin menu link clicked!");
    event.preventDefault();
    openAdminLogin();
  });
} else {
  console.error("adminMenuLink element not found!");
}

if (djMenuLink) {
  djMenuLink.addEventListener("click", (event) => {
    event.preventDefault();
    openDjLogin();
  });
}

if (logoutMenuLink) {
  logoutMenuLink.addEventListener("click", async (event) => {
    event.preventDefault();
    await logout();
  });
}

if (userNameText) {
  userNameText.addEventListener("click", async () => {
    if (currentUser.role === "guest") {
      await openNamePrompt();
    }
  });
  userNameText.style.cursor = "pointer";
  userNameText.title = "Click to change name";
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (adminModal && adminModal.classList.contains("is-open")) {
      closeAdminLogin();
    }
    if (djModal && djModal.classList.contains("is-open")) {
      closeDjLogin();
    }
    if (nameModal && nameModal.classList.contains("is-open")) {
      closeNamePrompt();
    }
  }
});

window.authAPI = {
  fetchUserStatus,
  getCurrentUser: () => currentUser,
  hasPermission,
  openAdminLogin,
  closeAdminLogin,
  openDjLogin,
  closeDjLogin,
  openNamePrompt,
  closeNamePrompt,
  ensureUserHasName,
  logout
};
