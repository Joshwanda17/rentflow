// Welile service-worker kill switch — 2026-05-31 iPhone rescue
//
// This worker replaces any old caching worker at /sw.js. It never serves cached
// app files. For navigations it forces a network revalidation so iOS cannot keep
// returning the stale index.html shell that points at deleted chunks.

const RESCUE_PARAM = "welile-sw-rescue";

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
        const url = new URL(client.url);
        url.searchParams.set(RESCUE_PARAM, Date.now().toString(36));
        return client.navigate(url.toString());
      } catch {
        return Promise.resolve();
      }
    }));

    // Keep this network-only worker alive briefly so the rescue navigation is
    // actually intercepted, then remove it. Immediate unregister can happen too
    // early on iOS and leave the navigation to the stale HTTP cache.
    await new Promise((resolve) => setTimeout(resolve, 15000));
    await self.registration.unregister();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      await deleteAllCaches();
      const url = new URL(request.url);
      url.searchParams.set(RESCUE_PARAM, Date.now().toString(36));
      return fetch(url.toString(), {
        cache: "reload",
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
    })());
    return;
  }

  event.respondWith(fetch(request, { cache: "reload" }));
});
