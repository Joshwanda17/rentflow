// Welile Service Worker — Fintech Safe Version v2

const CACHE_NAME = "welile-core-v2";
const STATIC_CACHE = "welile-static-v2";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = ["/", "/index.html", "/offline.html", "/manifest.json", "/favicon.png", "/welile-logo.png"];

// ================= INSTALL =================
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)));
  self.skipWaiting();
});

// ================= ACTIVATE =================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => ![CACHE_NAME, STATIC_CACHE].includes(name)).map((name) => caches.delete(name)),
        ),
      ),
  );
  self.clients.claim();
});

// ================= FETCH =================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // ===================================================
  // 1️⃣ BYPASS AUTH & OAUTH COMPLETELY
  // ===================================================
  if (
    url.pathname.startsWith("/~oauth") ||
    url.searchParams.has("code") ||
    url.searchParams.has("state") ||
    url.pathname.includes("/auth") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("oauth.lovable.app")
  ) {
    return; // Let browser handle normally — NEVER cache OAuth flows
  }

  // ===================================================
  // 2️⃣ NAVIGATION — NETWORK FIRST (SAFE FOR FINTECH)
  // ===================================================
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((res) => res || caches.match(OFFLINE_URL))),
    );
    return;
  }

  // ===================================================
  // 3️⃣ STATIC ASSETS — STALE WHILE REVALIDATE
  // ===================================================
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
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
      }),
    );
    return;
  }

  // ===================================================
  // 4️⃣ API REQUESTS — NETWORK FIRST (NO CACHE)
  // ===================================================
  if (url.pathname.startsWith("/rest/")) {
    event.respondWith(fetch(request));
    return;
  }

  // ===================================================
  // 5️⃣ DEFAULT — NETWORK FIRST
  // ===================================================
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
