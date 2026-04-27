## Why the Confirm button fails silently

I traced the click in `src/components/agent/AgentTenantCollectDialog.tsx`:

- `handleAllocate` (line 64) starts with `console.log('[AgentTenantCollectDialog] Confirm clicked', …)`.
- The browser console for this session has **zero such logs** and the session replay shows pointer movement near the Confirm button but **no click event ever fires**.
- The handler is never reached. The RPC `agent_allocate_tenant_payment` is never called. There is nothing to log on the backend either, which is why it looks "silent".

### Root cause

The file already documents this exact bug at lines 446–448:

> *"Confirmation Dialog — sibling of parent so its overlay is not blocked by the parent's portal (was causing silent click failures on iOS PWA)."*

A previous fix moved the Confirm dialog out to be a sibling, but it left the **parent "Pay for…" Dialog still open** at the same time. Result on iOS PWA / Safari WebView:

```text
Layer stack while Confirm is shown:
  ┌─────────────────────────────────┐
  │ Confirm Payment dialog (top)    │  ← user taps here
  ├─────────────────────────────────┤
  │ Confirm dialog overlay           │
  ├─────────────────────────────────┤
  │ Parent "Pay for…" dialog overlay │  ← steals the touchend
  ├─────────────────────────────────┤
  │ Parent "Pay for…" dialog content │
  └─────────────────────────────────┘
```

Two Radix overlays with `pointer-events: auto` and overlapping focus traps. On iOS Safari/PWA the lower overlay intermittently swallows the `click` (the `touchstart` hits the top dialog, but `touchend` is re-targeted to the underlying overlay). The screenshot shows exactly this: the parent sheet is still visible, greyed out, behind the Confirm dialog.

### The fix

Collapse the two-dialog pattern into **one dialog with two steps** (form → confirm), so there is only ever a single overlay on screen.

Steps:

1. **Remove the second `<Dialog>` block** (lines 446–505).
2. Inside the existing parent `<DialogContent>`, render either the form view or the confirmation view based on `confirming` state — same component, same overlay, just swap the inner JSX.
3. Keep `handleAllocate`, `setConfirming`, `loading`, and the celebration dialog exactly as they are.
4. Keep the existing `console.log` in `handleAllocate` so any regression is caught immediately.
5. Make the "Edit" button in confirm view call `setConfirming(false)` to return to the form view (already correct).
6. The celebration dialog (`CommissionCelebration`) stays as a sibling — it only appears *after* the parent closes, so it is not affected.

This eliminates the stacked-overlay race entirely and is also a cleaner UX: one sheet, two steps, smooth transition.

### Files touched

- `src/components/agent/AgentTenantCollectDialog.tsx` — restructure JSX (no logic changes, no API/RPC changes).

### Verification after the fix

- Tap Review → confirm view appears in the **same sheet**.
- Tap Confirm → console shows `[AgentTenantCollectDialog] Confirm clicked …`.
- RPC `agent_allocate_tenant_payment` fires; toast appears; commission celebration shows.
- Works on iOS PWA, Android Chrome, and desktop.

No database, RPC, or edge function changes are needed — the backend was never the problem; the click simply wasn't reaching it.
