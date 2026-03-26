

# Plan: Make the App Load Faster

## Current Bottlenecks Identified

1. **Heavy eager imports in App.tsx** — `HelmetProvider` (react-helmet-async), `CombinedSettingsProvider`, `LanguageProvider`, `CurrencyProvider` (472 lines + exchange rate fetch), and `AuthProvider` all load synchronously before first paint
2. **1,073-line index.css** loaded as a single blocking import in main.tsx
3. **CurrencyProvider fetches exchange rates on mount** — network call during startup path
4. **8+ nested providers** all initialize before any route renders
5. **Google Fonts** — 2 families × 4 weights each, loaded even on slow networks
6. **main.tsx creates root twice** — `createRoot(root)` result is discarded, then a new `createRoot(root)` is called after import

## Changes (in priority order)

### 1. Remove `react-helmet-async` / HelmetProvider
This is a PWA — no SSR, no SEO crawlers need dynamic `<head>` tags. The `<title>` and meta tags are already in `index.html`. Removing this eliminates an entire library from the critical path.

**File**: `src/App.tsx`
- Remove `HelmetProvider` import and wrapper
- Remove any `<Helmet>` usage across pages (search and replace with nothing — the static HTML head covers it)

### 2. Defer CurrencyProvider and LanguageProvider
Both read from localStorage for defaults and don't need network calls for first paint. Move them into `DeferredProviders` so they load after first paint.

**File**: `src/App.tsx`
- Move `CurrencyProvider` and `LanguageProvider` imports to lazy
- Add them inside `DeferredProviders`, wrapping children with safe defaults until ready
- `CombinedSettingsProvider` (font size, haptics) is pure localStorage — keep eager but inline the initial read

### 3. Preload Dashboard chunk for authenticated users
When `sessionCache` detects a cached session, start loading the Dashboard chunk immediately in parallel with auth initialization.

**File**: `src/main.tsx`
- After loading App, check localStorage for `welile_session_cache`
- If present, fire `import('./pages/Dashboard')` as a background preload (no await)

### 4. Parallelize auth initialization
Currently `getSession()` runs, then `fetchUserRoles()` runs sequentially with a 5s timeout. Fire both from cached userId in parallel.

**File**: `src/hooks/useAuth.tsx`
- When cached session exists, start `fetchUserRoles(cachedUserId)` immediately alongside `getSession()`
- Use the cached roles for instant render, replace when network roles arrive

### 5. Split CSS — critical inline, rest deferred
The 1,073-line `index.css` blocks first paint. Extract ~50 lines of critical CSS (variables, base resets) into a tiny file imported eagerly, and lazy-load the rest.

**Files**:
- Create `src/critical.css` (~50 lines: CSS variables, base resets, scrollbar, body)
- Rename remaining to `src/index.css` (components, animations, utilities)
- **`src/main.tsx`**: Import critical.css eagerly, defer index.css load

### 6. Reduce font payload on slow networks
**File**: `index.html`
- On Save-Data or slow connections, skip Google Fonts entirely (system fonts are already the fallback)
- Add `<script>` that removes the font `<link>` if `navigator.connection.saveData` is true

### 7. Fix double createRoot
**File**: `src/main.tsx`
- Remove the unused first `createRoot(root)` call — only call it once inside `loadApp()`

## Expected Impact
- **Time to Interactive**: ~1-2s faster on 3G (fewer synchronous imports, parallel auth)
- **First Contentful Paint**: ~500ms faster (CSS split, no HelmetProvider)
- **Bundle size**: ~15-20KB smaller (remove react-helmet-async)
- **Returning users**: Near-instant dashboard via chunk preloading + parallel role fetch

## Files Modified
- `src/App.tsx` — remove HelmetProvider, defer Currency/Language providers
- `src/main.tsx` — fix double createRoot, preload Dashboard chunk, split CSS import
- `src/critical.css` — new file, ~50 lines of critical CSS
- `src/index.css` — reduced (non-critical portions)
- `src/hooks/useAuth.tsx` — parallelize role fetch with session restore
- `index.html` — conditional font loading for slow networks
- Various pages using `<Helmet>` — remove those imports

