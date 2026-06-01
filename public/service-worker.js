// Welile service-worker kill switch — 2026-05-31 iPhone rescue
//
// Same cleanup worker as /sw.js for older installs that registered this path.
// It does not intercept or rewrite document navigations.

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

    await self.registration.unregister();
  })());
});