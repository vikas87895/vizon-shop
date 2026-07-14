// ============================================================
// VIZON — OneSignal Push Notifications (real push, works even
// when the app is fully closed — plays the phone's default
// notification sound).
// ============================================================

window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function (OneSignal) {
  if (!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID.indexOf("PASTE_YOUR") !== -1) {
    console.warn("OneSignal not configured — set ONESIGNAL_APP_ID in config.js to enable push notifications.");
    return;
  }
  await OneSignal.init({ appId: ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true });
  window.__oneSignalReady = true;
});

// Call this right after a successful login (owner or user) to ask for
// notification permission and tag this device so the backend can target it.
function setupPushForRole(role, userId) {
  OneSignalDeferred.push(async function (OneSignal) {
    try {
      if (!OneSignal.Notifications.permission) {
        await OneSignal.Notifications.requestPermission();
      }
      if (role === "owner") {
        await OneSignal.User.addTag("role", "owner");
      } else {
        await OneSignal.User.addTag("role", "user");
        await OneSignal.User.addTag("userId", String(userId));
      }
    } catch (e) {
      console.warn("Push setup failed (notifications may be blocked):", e);
    }
  });
}
