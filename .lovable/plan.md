
## Root cause

The runtime error log shows:
```
TypeError: error loading dynamically imported module: .../FeatureFlagsContext.tsx
```

This is a **lazy chunk load failure** — a transient network/cache issue when the browser tries to download a code-split JS chunk (very common after a redeploy, on flaky mobile networks, or with stale service-worker caches). It is NOT a code bug.

`ChunkErrorBoundary` IS catching it, but on this device the thrown error's message/stack doesn't match any of the keyword strings used to classify it as a chunk error, so it falls through to the **generic** "Something went wrong" branch instead of the **auto-recovering "Updating..."** branch. That's why the user sees a dead-end screen with no auto-retry.

Secondary issue from console logs: `IOSLinkHandler` and `IOSShareReceiver` are referenced as `forwardRef` targets but are plain function components — noisy warnings, not the crash cause, but worth fixing.

## Plan

### 1. Make chunk-error detection bulletproof in `ChunkErrorBoundary`
- Add more match patterns: `"failed to fetch"`, `"importing"`, `"module"`, `".tsx"`, `".js"` chunk hints, plus check `error.name === "TypeError"` combined with empty/short message (typical signature of a fetch failure on iOS Safari).
- Treat ANY error whose stack mentions a `/src/` or `/assets/` URL with `.js`/`.tsx`/`.css` as a chunk load failure.
- Add an **auto-retry once** on chunk errors: clear caches + SWs + reload after a 2s delay (only if not already retried — track via `sessionStorage`).
- Log the raw error to `public_error_logs` (same pattern as `RecordRentErrorBoundary`) so we can see exactly what's failing on real devices.

### 2. Add chunk-load retry at the import site
Wrap the `lazy(() => import(...))` calls in `App.tsx` (`FeatureFlagsProvider`, `OfflineProvider`, `ComparisonProvider`, etc.) with a `lazyWithRetry` helper that retries the import 2× with backoff before throwing. This catches transient failures BEFORE the boundary ever sees them.

```ts
// src/lib/lazyWithRetry.ts
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
) {
  return lazy(async () => {
    let lastErr: any;
    for (let i = 0; i <= retries; i++) {
      try { return await factory(); }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
    }
    throw lastErr;
  });
}
```

### 3. Improve the generic fallback UX (defense in depth)
For non-chunk errors, the current "Something went wrong" screen is a dead end. Add:
- A **"Go to Home"** button (resets route to `/`) alongside Refresh.
- The error message in small text (collapsed) for support diagnostics.
- Best-effort logging to `public_error_logs`.

### 4. Fix the React `forwardRef` warnings
`IOSLinkHandler` and `IOSShareReceiver` are wrapped in `Suspense` and something passes a `ref`. Convert them to `React.forwardRef` (no-op forward) to silence the warnings — purely cosmetic but reduces console noise that masks real errors.

### 5. Production monitoring guidance (no code, just recommendation)
Briefly note that `public_error_logs` is your existing lightweight Sentry-equivalent — every boundary catch will land there with userAgent + URL, so you can query it from the CFO/CTO dashboard to see real-world chunk-failure rates per device.

## Files to change
1. `src/components/ChunkErrorBoundary.tsx` — broader detection, auto-retry once, remote logging, better generic fallback with Home button.
2. `src/lib/lazyWithRetry.ts` — **new** helper.
3. `src/App.tsx` — replace bare `lazy(...)` with `lazyWithRetry(...)` for the provider chain (FeatureFlagsProvider, OfflineProvider, ComparisonProvider, and any other top-level lazy providers).
4. `src/components/IOSLinkHandler.tsx` and `src/components/IOSShareReceiver.tsx` — wrap with `forwardRef` to silence warnings.

## Out of scope
- No new external services (Sentry SDK install, etc.) — `public_error_logs` already exists and is cheaper.
- No changes to network-layer retry for Supabase/edge calls — those are handled per-feature and aren't the cause of this screen.
- No layout/visual redesign of the fallback — keeping current style, just adding the Home button + log id.

## Expected outcome
- Transient chunk failures self-heal silently via `lazyWithRetry` (2 retries with backoff).
- If they still fail, `ChunkErrorBoundary` reliably classifies them and shows the "Updating..." auto-recovery UI instead of the dead-end generic screen.
- True app-code crashes (rare) get a richer fallback with Home + logged error id.
- Console noise from `forwardRef` warnings goes away.
