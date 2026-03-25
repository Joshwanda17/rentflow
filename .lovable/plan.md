

## Investigation Report: "Something went wrong" on Login

### Root Cause Identified

The crash happens **after successful login**, not during authentication itself. Auth logs confirm all logins succeed (status 200). The error is a **React runtime crash** in the post-login dashboard rendering.

### The Crash Chain

```text
User logs in successfully
  → Redirected to /dashboard
  → Dashboard lazy-loads SupporterDashboard
  → SupporterDashboard uses useWallet()
  → useWallet() calls useServiceValidation()
  → useServiceValidation() calls useFeatureFlags()
  → useFeatureFlags() throws: "must be used within FeatureFlagsProvider"
  → ChunkErrorBoundary catches it → shows "Something went wrong"
```

### Why It Happens (Timing Race)

The `FeatureFlagsProvider` is inside `DeferredProviders` (line 334 of App.tsx), which **delays mounting** until after the browser's idle callback or a 150ms timeout. Here's the race condition:

1. User authenticates → `useAuth` sets `user` state
2. `Index.tsx` sees `user` + `roles.length > 0` → redirects to `/dashboard`
3. Dashboard renders `SupporterDashboard` immediately
4. But `DeferredProviders` hasn't activated yet (`ready === false` on line 326)
5. When `ready` is false, `DeferredProviders` returns `<>{children}</>` — **without any providers**
6. So `useFeatureFlags()` has no provider above it → throws → crash

The fix we applied earlier (adding `FeatureFlagsProvider` to `DeferredProviders`) is correct and is already in place at line 334. However, the **timing issue remains**: the `DeferredProviders` wrapper skips ALL providers (including `FeatureFlagsProvider`) until `requestIdleCallback` fires.

### The Real Fix Needed

**Make `useFeatureFlags` safe when called outside its provider** by returning default flags instead of throwing. This is the resilient pattern — it prevents crashes regardless of provider mount timing.

### Changes

**File: `src/contexts/FeatureFlagsContext.tsx`** — Change `useFeatureFlags` to return defaults instead of throwing:

```typescript
export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    // Return safe defaults when provider hasn't mounted yet (deferred loading)
    return { flags: defaultFlags, setFlag: () => {} };
  }
  return context;
}
```

This single change ensures:
- No crash when `DeferredProviders` hasn't activated yet
- No crash on slow phones where idle callback takes longer
- Feature flags still work correctly once the provider mounts
- The "Something went wrong" screen disappears for all smartphone users

### Secondary Hardening (same message)

**File: `src/core/services/useServiceValidation.ts`** — Add a try/catch around `useFeatureFlags` as a defense-in-depth measure, returning the safe default (`useNewServices: false`) if it fails.

### Why This Affects Smartphones Specifically

- Smartphones have slower CPUs → `requestIdleCallback` fires later
- Low-end Android devices may take 500ms+ before idle callback
- The dashboard component tree renders before providers are ready
- Desktop browsers fire idle callbacks almost immediately, masking the bug

