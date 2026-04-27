## What's actually happening

You're picking a depositor, entering the TID, and it looks like the deposit was verified — but the row stays in the pending list.

I checked the database: **no MTN deposits have been approved in the last 2 hours**, even though you've been verifying. So the problem isn't the list refusing to refresh — it's that the approvals are never being committed to the backend in the first place.

## Why

The "approve" button doesn't commit immediately. It schedules a 5-second **undoable** approval (so you can hit Undo if you tapped the wrong row), and only then calls the backend. Two things break this on a phone:

1. **Silent drop on unmount.** If you close the dialog, switch tabs, or navigate away during those 5 seconds, the timer is cleared on cleanup and the backend is never called. No error, no toast — the row just stays pending.
2. **Unclear feedback.** The toast says "Will commit in 5 seconds" but it's easy to miss on mobile, and there's no visual signal on the row itself that approval is pending or has actually committed.
3. **The "verify" wording is misleading.** The screen header says *"Pick a depositor, type their Transaction ID, then approve the match."* Operators reasonably assume picking + typing the TID = verified. The separate **Auto-approve** click is required and isn't obvious.

## Fix

### 1. Make approvals durable (`src/components/financial-ops/TidVerification.tsx`)

- On component unmount, **flush any pending undo timers immediately** — fire `commitApprove` for each queued match instead of clearing them. This guarantees that anything the operator approved is sent to the backend even if they close the dialog within 5 s.
- Add a `beforeunload` handler that fires queued commits synchronously (best-effort `navigator.sendBeacon` fallback to the edge function) so closing the tab doesn't drop approvals either.
- Reduce the default undo window from 5 s → **3 s** on mobile widths (`window.innerWidth < 640`) so commits land faster on phones.

### 2. Visible per-row state on the pending pick-list

- When a row is in the "approving (undoable)" state, mark it on the pending list with a small spinner + countdown ("Approving in 3…2…1") and disable re-picking.
- When the row is committed and `loadPending()` re-runs, the row drops off as today — but also briefly toast "Removed from pending list ✓ — *Lukodda Joseph, USh 1,000,000 approved*" so the operator gets explicit confirmation tied to the pending list, not just the match card.

### 3. Clearer step labelling

- Rename Step 1 from *"Pick the depositor"* → *"1. Pick who paid"* and Step 2 currently labelled "Enter TID" → *"2. Enter Transaction ID and approve"*.
- Replace the **Auto-approve** button label with **"Approve & remove from list"** so it's unambiguous what the action does.
- After the approve button, show a tiny inline note: *"Stays here for 3 seconds in case you tap the wrong one — tap Undo to cancel."*

### 4. Self-healing pending list

- After every approve commit, in addition to `loadPending()`, also locally splice the approved id out of the `pending` state immediately (optimistic). Today the row only disappears after the network refetch lands; on a slow 3G phone connection that can be 2–5 s of confusion.
- If `loadPending()` later returns the row again (e.g., backend rolled back), restore it and toast a warning. This makes the list feel instant on phones while staying correct.

### 5. Diagnostic safety net

- If `commitApprove` ever returns an error, on top of the existing toast also write a row to `audit_logs` with `action_type: 'tid_approve_failed'` and the error message, so we can see in production whether any approvals are silently failing at the edge function rather than the timer.

## Out of scope

- No backend / SQL / `approve-deposit` edge function changes — the function works fine; the issue is purely client-side timer + UX.
- No changes to the search, pick filters, or amount input.

## Files to edit

- `src/components/financial-ops/TidVerification.tsx` — timer flush on unmount + beforeunload, optimistic splice, row state on pending list, button/copy changes, mobile undo window.
