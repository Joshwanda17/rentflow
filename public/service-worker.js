// Welile service-worker kill switch — 2026-05-30
//
// Some older builds may have registered /service-worker.js instead of /sw.js.
// Keep this network-only cleanup worker in place for at least one release cycle
// so every installed iOS/Android PWA path can remove stale app-shell caches.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      await Promise.all(
        clients.map((client) => {
          const url = new URL(client.url);
          url.searchParams.set("sw-cleanup", Date.now().toString(36));
          return client.navigate(url.toString());
        })
      );

      await self.registration.unregister();
    })()
  );
});

self.addEventListener("fetch", () => {
  // Network-only by design. The browser handles every request normally.
});