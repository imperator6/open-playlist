async function loadAppUrl() {
  try {
    const res = await fetch("/api/app-url");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    document.getElementById("qr-url").textContent = data.url;
  } catch (err) {
    document.getElementById("qr-url").textContent = "Could not load URL";
  }
}

loadAppUrl();
