

## Fix: "Something went wrong" crash on Supporter Dashboard

### Root Cause

The `SupporterDashboard` component calls `useWallet` → `useServiceValidation` → `useFeatureFlags`, which throws because `FeatureFlagsProvider` is **never mounted** anywhere in the app's component tree (`App.tsx`).

### Fix

**`src/App.tsx`** — Add `FeatureFlagsProvider` inside the `DeferredProviders` wrapper, wrapping the existing provider chain:

```text
DeferredErrorBoundary
  └─ Suspense
       └─ PinAuthProvider
            └─ BiometricAuthProvider
                 └─ OfflineProvider
                      └─ FeatureFlagsProvider   ← NEW
                           └─ CartProvider
                                └─ ComparisonProvider
                                     └─ {children}
```

- Import `FeatureFlagsProvider` from `@/contexts/FeatureFlagsContext` (lazy, like the other deferred providers)
- Wrap it around `CartProvider` inside `DeferredProviders`

### Files
- `src/App.tsx` — add lazy import + wrap in provider tree (~3 lines changed)

