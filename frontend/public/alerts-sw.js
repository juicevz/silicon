/* This worker handles opt-in push only. It never caches requests or wallet data. */
self.addEventListener("push", event => {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const url = new URL(payload.url || "/terminal", self.location.origin);
  if (url.origin !== self.location.origin || url.pathname !== "/terminal") return;
  event.waitUntil(self.registration.showNotification("silicon · gpu alert", {
    body: String(payload.message || "A GPU rental alert triggered."),
    icon: "/silicon.svg?v=5", tag: String(payload.id || "silicon-alert"),
    data: { url: url.href },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/terminal", self.location.origin);
  if (url.origin !== self.location.origin || url.pathname !== "/terminal") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(url.href);
  }));
});
