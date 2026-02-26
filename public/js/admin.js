"use strict";

const adminStatus = document.getElementById("admin-status");
const adminSettingsFormWrap = document.getElementById("admin-settings-form-wrap");
const adminAccessDenied = document.getElementById("admin-access-denied");
const adminSettingsForm = document.getElementById("admin-settings-form");
const minAddPositionInput = document.getElementById("min-add-position-input");
const adminSaveBtn = document.getElementById("admin-save-btn");
const voteSortToggle = document.getElementById("admin-votesort-toggle");
const voteSortStatus = document.getElementById("votesort-status");

function setStatus(message, busy) {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  if (adminSaveBtn) adminSaveBtn.disabled = Boolean(busy);
}

async function loadSettings() {
  try {
    const res = await fetch("/api/admin/settings");
    if (res.status === 403) {
      showAccessDenied();
      return;
    }
    if (!res.ok) {
      setStatus("Failed to load settings.");
      return;
    }
    const data = await res.json();
    if (minAddPositionInput && Number.isInteger(data.minAddPosition)) {
      minAddPositionInput.value = String(data.minAddPosition);
    }
    if (voteSortToggle) {
      voteSortToggle.checked = Boolean(data.voteSortEnabled);
    }
    setStatus("");
  } catch (err) {
    setStatus("Unable to load settings.");
  }
}

async function updateVoteSortState(enabled) {
  if (voteSortStatus) voteSortStatus.textContent = "Saving...";
  if (voteSortToggle) voteSortToggle.disabled = true;
  try {
    const res = await fetch("/api/queue/votesort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    if (!res.ok) {
      if (voteSortStatus) voteSortStatus.textContent = "Failed to update.";
      if (voteSortToggle) voteSortToggle.checked = !enabled;
      return;
    }
    const data = await res.json();
    if (voteSortToggle) voteSortToggle.checked = Boolean(data.voteSortEnabled);
    if (voteSortStatus) voteSortStatus.textContent = "Saved.";
    setTimeout(() => { if (voteSortStatus) voteSortStatus.textContent = ""; }, 2000);
  } catch (err) {
    if (voteSortStatus) voteSortStatus.textContent = "Unable to save.";
    if (voteSortToggle) voteSortToggle.checked = !enabled;
  } finally {
    if (voteSortToggle) voteSortToggle.disabled = false;
  }
}

function showAccessDenied() {
  if (adminSettingsFormWrap) adminSettingsFormWrap.style.display = "none";
  if (adminAccessDenied) adminAccessDenied.style.display = "";
}

if (adminSettingsForm) {
  adminSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = parseInt(minAddPositionInput.value, 10);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setStatus("Enter a number between 0 and 100.");
      return;
    }
    setStatus("Saving...", true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minAddPosition: value })
      });
      if (res.status === 403) {
        setStatus("Insufficient permissions.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.error || "Failed to save settings.");
        return;
      }
      const data = await res.json();
      if (minAddPositionInput && Number.isInteger(data.minAddPosition)) {
        minAddPositionInput.value = String(data.minAddPosition);
      }
      setStatus("Settings saved.");
    } catch (err) {
      setStatus("Unable to save settings.");
    } finally {
      if (adminSaveBtn) adminSaveBtn.disabled = false;
    }
  });
}

async function initializeAdmin() {
  await window.authAPI.fetchUserStatus();
  const user = window.authAPI.getCurrentUser();
  if (!user || user.role !== "admin") {
    showAccessDenied();
    return;
  }
  await loadSettings();
}

if (voteSortToggle) {
  voteSortToggle.addEventListener("change", (event) => {
    updateVoteSortState(Boolean(event.target.checked));
  });
}

initializeAdmin();
