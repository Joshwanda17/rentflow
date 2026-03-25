

## Fix: Service Worker caching chrome-extension:// URLs

The service worker's image caching handler (stale-while-revalidate) doesn't filter out non-HTTP(S) requests. When a Chrome extension makes a request that the SW intercepts, it tries to `cache.put()` with a `chrome-extension://` scheme, which the Cache API rejects.

### Change

**`public/sw.js`** — Add an early return at the top of the fetch handler for non-http(s) schemes:

```js
// After: if (request.method !== "GET") return;
// Add:
if (!url.protocol.startsWith("http")) return;
```

This single line guards all five fetch strategies below it, preventing any attempt to cache or respond to `chrome-extension://`, `data:`, `blob:`, or other non-HTTP requests.

### File
- `public/sw.js` — one line added after the `GET` method check (~line 48)

