(function () {
  const burger = document.getElementById("menu-burger");
  const drawer = document.getElementById("menu-drawer");
  const backdrop = document.getElementById("menu-backdrop");
  const close = document.getElementById("menu-drawer-close");

  function open() {
    drawer.classList.add("is-open");
    backdrop.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
  }

  function shut() {
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  }

  burger.addEventListener("click", open);
  close.addEventListener("click", shut);
  backdrop.addEventListener("click", shut);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (drawer.classList.contains("is-open")) shut();
      if (deviceOverlay && deviceOverlay.classList.contains("is-open")) shutDevices();
    }
  });

  // Device overlay
  var deviceBtn = document.getElementById("device-overlay-btn");
  var deviceOverlay = document.getElementById("device-overlay");
  var deviceBackdrop = document.getElementById("device-overlay-backdrop");
  var deviceClose = document.getElementById("device-overlay-close");

  function openDevices() {
    if (!deviceOverlay) return;
    deviceOverlay.classList.add("is-open");
    deviceBackdrop.classList.add("is-open");
    deviceOverlay.setAttribute("aria-hidden", "false");
    deviceBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("overlay-open");
  }

  function shutDevices() {
    if (!deviceOverlay) return;
    deviceOverlay.classList.remove("is-open");
    deviceBackdrop.classList.remove("is-open");
    deviceOverlay.setAttribute("aria-hidden", "true");
    deviceBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overlay-open");
  }

  if (deviceBtn) deviceBtn.addEventListener("click", openDevices);
  if (deviceClose) deviceClose.addEventListener("click", shutDevices);
  if (deviceBackdrop) deviceBackdrop.addEventListener("click", shutDevices);

  // Expose menu API globally
  window.menuAPI = {
    closeMenu: shut
  };
})();
