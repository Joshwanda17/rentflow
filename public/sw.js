// Welile Web Push service worker.
// PUSH-ONLY: this worker intentionally has NO `fetch` handler and performs NO
// caching of HTML or app assets, so it can never serve stale pages in the
// Lovable preview or in production. It exists solely to receive push events
// and surface notifications.

self.addEventListener('install', () => {
  // Activate immediately so new subscriptions work without a reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Every notification is branded to the canonical Welile app origin, so a
// worker that was registered on a legacy host still sends users to
// welileapp.com when they tap.
const WELILE_ORIGIN = 'https://welileapp.com';
const WELILE_BRAND = 'Welile';

function brandedUrl(url) {
  try {
    // Resolve against the canonical origin, then force that origin so an
    // absolute or protocol-relative URL (legacy host, or anything else) can
    // never send a tap off welileapp.com. Path, query and hash are preserved.
    const parsed = new URL(url || '/', WELILE_ORIGIN);
    return WELILE_ORIGIN + parsed.pathname + parsed.search + parsed.hash;
  } catch (_e) {
    return WELILE_ORIGIN + '/';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    // Fall back to plain text payloads.
    try {
      data = { title: WELILE_BRAND, body: event.data ? event.data.text() : '' };
    } catch (_e2) {
      data = {};
    }
  }

  const title = data.title || WELILE_BRAND;
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || data.notificationId || undefined,
    // Shown by browsers that support it (Chrome/Android) so the notification
    // reads "welileapp.com" instead of the raw registration host.
    dir: 'ltr',
    lang: 'en',
    data: {
      url: brandedUrl(data.url),
      brand: WELILE_BRAND,
      origin: WELILE_ORIGIN,
      ...(data.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = brandedUrl(
    (event.notification.data && event.notification.data.url) || '/',
  );

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if one is open, then navigate it.
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client && targetUrl) {
              try {
                client.navigate(targetUrl);
              } catch (_e) {
                /* navigation may be blocked cross-origin; ignore */
              }
            }
            return;
          }
        }
        // Otherwise open a new window.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
