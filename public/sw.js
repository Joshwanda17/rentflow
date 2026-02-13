// Welile Service Worker - Offline-First PWA
// Optimized for instant offline loading when tapped from home screen
// Auto-updates across all devices when new version is published
const CACHE_NAME = 'welile-v12';
const OFFLINE_URL = '/offline.html';
const API_CACHE_NAME = 'welile-api-v4';
const STATIC_CACHE_NAME = 'welile-static-v4';

// Core assets to cache immediately on install for INSTANT offline loading
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.png',
  '/welile-logo.png',
  '/manifest.json',
];

// App routes to precache for offline navigation (SPA)
// These all resolve to index.html (app shell) which React Router handles client-side
const APP_SHELL_ROUTES = [
  '/welcome',       // Landing page — must work offline
  '/dashboard',
  '/auth',
  '/settings',
  '/transactions',
  '/chat',
  '/marketplace',
  '/referrals',
  '/earnings',
  '/rent-calculator',  // Public calculator for offline use
  '/try-calculator',   // Public calculator for offline use
];

// API endpoints to cache for offline dashboard access
const CACHEABLE_API_PATTERNS = [
  /\/rest\/v1\/profiles/,
  /\/rest\/v1\/wallets/,
  /\/rest\/v1\/notifications/,
  /\/rest\/v1\/user_roles/,
  /\/rest\/v1\/rent_requests/,
  /\/rest\/v1\/repayments/,
  /\/rest\/v1\/investment_accounts/,
  /\/rest\/v1\/platform_transactions/,
  /\/rest\/v1\/agent_subagents/,
  /\/rest\/v1\/agent_earnings/,
];

// Install event - cache critical assets and skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v10 - optimized for offline app launch...');
  event.waitUntil(
    Promise.all([
      // Cache core assets including index.html for offline app shell
      caches.open(CACHE_NAME).then(async (cache) => {
        console.log('[SW] Precaching core assets for offline...');
        // Cache each asset individually to handle failures gracefully
        for (const asset of PRECACHE_ASSETS) {
          try {
            await cache.add(asset);
            console.log('[SW] Cached:', asset);
          } catch (err) {
            console.warn('[SW] Failed to cache:', asset, err);
          }
        }
        
        // Also try to cache the main entry point variations
        try {
          const indexResponse = await fetch('/');
          if (indexResponse.ok) {
            const cloned = indexResponse.clone();
            await cache.put('/', cloned);
            await cache.put('/index.html', indexResponse.clone());
            
            // Pre-cache app shell routes so they work offline
            // All SPA routes resolve to the same index.html
            for (const route of APP_SHELL_ROUTES) {
              await cache.put(new Request(route, { mode: 'navigate' }), indexResponse.clone());
            }
            console.log('[SW] Cached index.html + app shell routes for offline');
          }
        } catch (err) {
          console.warn('[SW] Could not cache index:', err);
        }
      }),
      // Pre-cache static resources cache
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Static cache ready for offline assets');
      })
    ]).then(() => {
      console.log('[SW] Install complete - skipping waiting...');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches and claim all clients immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating - claiming clients for offline support...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Keep current caches, delete old versions
            return name.startsWith('welile-') && 
              name !== CACHE_NAME && 
              name !== API_CACHE_NAME &&
              name !== STATIC_CACHE_NAME;
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients...');
      return self.clients.claim();
    }).then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        console.log('[SW] Notifying', clients.length, 'clients about update');
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Check if URL should have API response cached
function shouldCacheAPIResponse(url) {
  return CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url));
}

// Fetch event - Smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except for fonts and CDN assets
  if (url.origin !== location.origin &&
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('fonts.gstatic.com') &&
      !url.hostname.includes('supabase.co')) {
    return;
  }

  // Handle Supabase API requests with stale-while-revalidate for cacheable endpoints
  if (url.hostname.includes('supabase.co') && shouldCacheAPIResponse(url.pathname)) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              // Clone and cache the response
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Network failed, return cached if available
            return cachedResponse;
          });

          // Return cached immediately, update in background
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Skip other Supabase API requests (real-time, auth, etc.)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // For navigation requests (page loads), serve cached app shell for offline
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try network first for fresh content
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            // Cache the response for offline use
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          throw new Error('Network response not ok');
        } catch (error) {
          console.log('[SW] Network failed, serving from cache...');
          
          // Try to serve from cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            console.log('[SW] Serving cached page:', request.url);
            return cachedResponse;
          }
          
          // For SPA routes, return the cached index.html (app shell)
          const indexResponse = await caches.match('/') || await caches.match('/index.html');
          if (indexResponse) {
            console.log('[SW] Serving cached app shell for:', request.url);
            return indexResponse;
          }
          
          // Last resort: offline page
          const offlineResponse = await caches.match(OFFLINE_URL);
          if (offlineResponse) {
            console.log('[SW] Serving offline page');
            return offlineResponse;
          }
          
          // Create a basic offline response if nothing is cached
          return new Response(
            '<html><body><h1>Offline</h1><p>Please check your internet connection.</p><a href="/dashboard">Try Dashboard</a></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // Scripts should be network-first (Vite chunk hashes change on deploy)
  if (request.destination === 'script') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For other static assets, use cache-first with background update
  if (
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Update cache in background
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: network-first for other requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Background sync for failed requests (when back online)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  // Notify clients that sync is complete
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_COMPLETE' });
  });
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  // Legacy support
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  // Clear API cache on logout
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE_NAME);
  }
});

// Push notification event - show notification to user
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = { title: 'Welile', body: 'You have a new notification', icon: '/welile-logo.png' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
  }

  const options = {
    body: data.body || data.message || 'You have a new notification',
    icon: data.icon || '/welile-logo.png',
    badge: '/welile-logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/dashboard',
      notificationId: data.notificationId,
      ...data
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: data.type === 'error' || data.type === 'warning',
    tag: data.notificationId || 'welile-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Welile', options)
  );
});

// Notification click event - open app or specific page
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already an open window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Open new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Periodic background sync for keeping data fresh
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(refreshCachedData());
  }
});

async function refreshCachedData() {
  // This runs in the background to keep cached data fresh
  console.log('[SW] Refreshing cached data in background');
}
