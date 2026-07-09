// ============================================================
// VIZON — Shared API helper (talks directly to Google Apps Script)
// ============================================================

function isConfigured() {
  return GAS_URL && GAS_URL.indexOf("PASTE_YOUR") === -1;
}

function showSetupBanner() {
  if (document.getElementById("vizon-setup-banner")) return;
  const banner = document.createElement("div");
  banner.id = "vizon-setup-banner";
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;" +
    "padding:12px 16px;font-family:sans-serif;font-size:14px;text-align:center;";
  banner.innerText =
    "⚠️ Setup incomplete: open config.js and paste your Google Apps Script Web App URL into GAS_URL (see README.md).";
  document.body.prepend(banner);
}

function configError() {
  showSetupBanner();
  return Promise.reject({
    success: false,
    message: "Setup incomplete: open config.js and paste your Google Apps Script Web App URL into GAS_URL."
  });
}

function apiGet(action, params) {
  if (!isConfigured()) return configError();
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  Object.keys(params || {}).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
  });
  return fetch(url.toString())
    .then((r) => r.json())
    .then((data) => {
      if (!data.success) throw data;
      return data;
    });
}

function apiPost(action, payload) {
  if (!isConfigured()) return configError();
  const body = Object.assign({ action: action, secret: APP_SECRET }, payload || {});
  return fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight
    body: JSON.stringify(body)
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data.success) throw data;
      return data;
    });
}

// Converts a File (from <input type="file">) into a base64 string (without the
// "data:image/...;base64," prefix) so it can be sent to Apps Script and saved to Drive.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
