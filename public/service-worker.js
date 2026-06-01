// Welile service-worker kill switch — 2026-05-31 iPhone rescue
//
// Same cleanup worker as /sw.js for older installs that registered this path.
// It must not append cache-busting params to document URLs.

async function deleteAllCaches() {
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    // Never let cleanup failure keep the old worker alive.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await deleteAllCaches();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await deleteAllCaches();

    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    await Promise.all(clients.map((client) => {
      try {
        return client.navigate(client.url);
      } catch {
        return Promise.resolve();
      }
    }));

    await new Promise((resolve) => setTimeout(resolve, 15000));
    await self.registration.unregister();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      await deleteAllCaches();
      return fetch(request, {
        cache: "reload",
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
    })());
    return;
  }

  event.respondWith(fetch(request, { cache: "reload" }));
});