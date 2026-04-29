## Goal

Stop the "publish but staff still see old version" problem on welilereceipts.com by replacing the current **silent auto-reload** with a **visible, user-controlled "Update available" toast**. Today the SW hook detects a new version and silently calls `window.location.reload()`, which (a) is blocked/delayed in the middle of forms, (b) gives no feedback that an update happened, and (c) on iOS Safari often gets deferred until the tab is reopened. A visible prompt makes the new version land within seconds of any tab gaining focus.

## What changes

### 1. `src/hooks/useServiceWorkerUpdate.ts` — expose state instead of auto-reloading

- Convert the hook to return `{ updateReady, applyUpdate, dismiss }`.
- When a new SW reaches `installed` AND `navigator.serviceWorker.controller` exists (i.e. it's an update, not first install) → set `updateReady = true` instead of calling `handleUpdate()` immediately.
- Keep all existing triggers that currently force a silent reload, but route them through `setUpdateReady(true)`:
  - `updatefound` → `installed` while controller exists
  - `controllerchange` (only if we initiated it via `applyUpdate`)
  - `SW_UPDATED` postMessage
  - Build-time mismatch check (`__BUILD_TIME__` vs `localStorage.welile_build_time`)
- `applyUpdate()` does what `handleUpdate()` does today: post `SKIP_WAITING` to the waiting worker, clear `welile-*` caches, then `window.location.reload()`. Sets an internal `isReloading` ref so we don't double-fire.
- `dismiss()` just hides the toast for this session (re-shown next time the page becomes visible / focus / online, since we re-check there).
- Keep the 5-min `setInterval`, `visibilitychange`, `focus`, `online` checks unchanged.

### 2. New component `src/components/UpdateAvailableToast.tsx`

- Calls `useServiceWorkerUpdate()`.
- When `updateReady` is true, shows a single **sonner** toast (we already use sonner elsewhere) that is:
  - Persistent (`duration: Infinity`)
  - Has an **"Update now"** action button → calls `applyUpdate()`
  - Has a dismiss (X) → calls `dismiss()`
  - Title: "New version available"
  - Description: "Reload to get the latest fixes."
- Uses a ref/`useRef` to track the toast id so it isn't duplicated on re-renders.
- Renders nothing (`return null`) — it's a behavior-only component.

### 3. `src/components/DeferredExtras.tsx` — mount the toast component

- Remove the bare `useServiceWorkerUpdate()` call at the top of `DeferredExtras` (the new `<UpdateAvailableToast />` will own it).
- Add `<UpdateAvailableToast />` **outside** the `if (!ready) return null` gate, so the update prompt works even before idle-callback fires (updates are higher priority than iOS extras).

```tsx
return (
  <>
    <UpdateAvailableToast />
    {ready && (
      <ExtrasBoundary>...</ExtrasBoundary>
    )}
  </>
);
```

### 4. Triage the 9 stuck `manager_approved` withdrawals (Option A)

After the toast ships, run the bulk action discussed earlier:

- Update the 9 stuck rows where `status = 'manager_approved'` AND `fin_ops_approved_at IS NULL` AND created today, setting:
  - `status = 'rejected'`
  - `rejection_reason = 'Manager-approved but FinOps did not complete; please re-request.'`
  - `rejected_at = now()`
- Emit a `system_event` of type `withdrawal.bulk_rejected_finops_stuck` with the affected ids for audit (per system constitution: every state change emits an event).
- No wallet/ledger movement is needed because no funds were ever debited (`approved_at IS NULL`).

This will be done as a single migration so it's auditable.

## What does NOT change

- `public/sw.js` — already correctly cache-busts on every deploy via `Date.now()` cache name and handles `SKIP_WAITING`. No edits needed.
- `useForceRefresh` (already a no-op stub) — left alone.
- The Financial Ops realtime channel added last turn — already shipped.
- No changes to `index.html`, build config, or vite config.

## Why this fixes "changes ineffective on custom domain"

- The custom domain (welilereceipts.com) is served identically to the `.lovable.app` URL — there is no separate deployment. The lag is **always** stale tabs holding the old SW + old chunks.
- Today's silent reload often loses the race when the user is mid-action; the visible toast lets them apply the update at a safe moment, and (critically) the toast appears within seconds of any focus/visibility/online event because the SW `update()` check is already wired to those.

## Files to be edited

- `src/hooks/useServiceWorkerUpdate.ts` (refactor to return state)
- `src/components/UpdateAvailableToast.tsx` (new)
- `src/components/DeferredExtras.tsx` (mount toast, drop direct hook call)
- One DB migration to bulk-reject the 9 stuck withdrawal_requests rows + emit system_event

## Out of scope (not doing now)

- No changes to other roles' dashboards.
- No change to update-check frequency (stays at 5 min + visibility/focus/online).
- No PWA manifest or install-prompt changes.
