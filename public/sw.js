// Welile service-worker kill switch — 2026-05-30
//
// Older iPhone installs can be trapped by a previously registered worker that
// serves a stale app shell/chunk set. This worker intentionally owns the same
// path (/sw.js; /service-worker.js has the same kill-switch), deletes every
// Cache Storage bucket, navigates open tabs to a cache-busted URL, then
// unregisters itself. Keep this file for at least one release cycle so
// already-installed devices receive the cleanup.

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
