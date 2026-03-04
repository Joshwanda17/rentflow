

## Investigation Summary

I traced the full submit flow in `src/components/wallet/DepositDialog.tsx` (lines 144-198):

1. `handleSubmit` sets `setLoading(true)` on line 154
2. Runs a duplicate check query against `deposit_requests`
3. Inserts into `deposit_requests`
4. `finally` block calls `setLoading(false)` on line 197

**Root cause candidates** (confirmed from investigation):

- **No network timeout**: If the supabase POST request hangs (network instability, service worker interference, or database lock), the `await` never resolves and `finally` never runs. The button spins forever.
- **Silent failure path**: The `as any` cast on the insert (line 186) hides potential type issues. If the request fails in a way that doesn't trigger the catch (e.g., the promise never settles), loading stays true.
- **No POST requests visible in network logs**: Confirms either the request hangs or the form isn't submitting at all.

The database schema, RLS policies, and triggers (`notify_managers_new_deposit`, `log_deposit_to_ledger`) all look correct. Both trigger functions are `SECURITY DEFINER`. 14 managers exist, which is fine for the notification loop.

## Plan

### 1. Add request timeout to prevent infinite spinning
**File**: `src/components/wallet/DepositDialog.tsx`

Wrap both supabase calls (duplicate check + insert) with a `Promise.race` timeout of 15 seconds. If the request exceeds this, reject with a "Request timed out" error that gets caught by the existing try/catch, ensuring `setLoading(false)` always runs.

### 2. Remove `as any` cast and fix types
**File**: `src/components/wallet/DepositDialog.tsx`

Remove the `as any` on line 186. The insert fields already match the `deposit_requests` Insert type exactly, so the cast is unnecessary and hides potential issues.

### 3. Add diagnostic logging
**File**: `src/components/wallet/DepositDialog.tsx`

Add `console.log` statements at key points: before duplicate check, before insert, on success, and on error. This will make future debugging visible in console logs automatically.

### 4. Add safety-net loading timeout
**File**: `src/components/wallet/DepositDialog.tsx`

Add a `useEffect` that watches the `loading` state. If it stays `true` for more than 20 seconds, force `setLoading(false)` and show an error toast. This is a last-resort safety net.

