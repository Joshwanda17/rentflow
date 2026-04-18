// Welile Service Worker — Safari-Safe Version v3
// Cache version MUST change on each deploy to bust stale caches
const CACHE_VERSION = Date.now();
const CACHE_NAME = `welile-core-v3-${CACHE_VERSION}`;
const STATIC_CACHE = `welile-static-v3-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = ["/offline.html", "/manifest.json", "/favicon.png", "/welile-logo.png"];

// ================= INSTALL =================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ================= ACTIVATE =================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ================= MESSAGE =================
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE" || event.data?.type === "SKIP_WAITING") {
    // Clear all caches and skip waiting
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))));
    self.skipWaiting();
  }
});

// ================= FETCH =================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // ===================================================
  // 1️⃣ BYPASS AUTH, OAUTH & SUPABASE COMPLETELY
  // ===================================================
  if (
    url.pathname.startsWith("/~oauth") ||
    url.searchParams.has("code") ||
    url.searchParams.has("state") ||
    url.pathname.includes("/auth") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.hostname.includes("oauth.lovable.app")
  ) {
    return; // Let browser handle normally
  }

  // ===================================================
  // 2️⃣ NAVIGATION — NETWORK ONLY WITH OFFLINE FALLBACK
  //    Safari-safe: NEVER serve cached index.html with stale chunk refs
  // ===================================================
  if (request.mode === "navigate") {
    // Public rent recorder MUST work even fully offline / on flaky networks.
    if (url.pathname === "/record-rent" || url.pathname.startsWith("/record-rent")) {
      event.respondWith(
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put("/record-rent-shell", clone));
            }
            return res;
          })
          .catch(() =>
            caches.match("/record-rent-shell").then(
              (cached) =>
                cached ||
                caches.match(OFFLINE_URL).then((r) => r || new Response("Offline", { status: 503 }))
            )
          )
      );
      return;
    }

    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // ===================================================
  // 3️⃣ HASHED STATIC ASSETS — CACHE FIRST (safe: hash = immutable)
  //    Only cache files with content hashes in the filename
  // ===================================================
  if (
    (request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "font") &&
    /\.[a-f0-9]{8,}\./i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ===================================================
  // 4️⃣ IMAGES — STALE WHILE REVALIDATE
  // ===================================================
  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // ===================================================
  // 5️⃣ API & EVERYTHING ELSE — NETWORK ONLY
  // ===================================================
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) =>
        cached || new Response('Network error', { status: 503, statusText: 'Service Unavailable' })
      )
    )
  );
});
