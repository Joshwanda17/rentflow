

## Fix: "Mukhaye Lydia" Listing Verification Failure

### Root Cause Analysis

The listing "House near the Road" (ID: `174b68cc`) posted by agent Grace Paul Ochieng is failing to verify via the "Verify → CFO" button. The red "Verification Failed" banner shows the generic fallback message "Verification failed", meaning the actual error from the backend function is not being surfaced.

**Likely failure reasons (in order of probability):**
1. The logged-in user's role isn't being found by the edge function (role check at line 45-56)
2. The Supabase SDK error object's `.context.json()` is failing silently, masking the real error

### Changes

**File: `src/components/executive/LandlordOpsDashboard.tsx`**
- Improve the `handleVerifyListing` error handling to also check `data?.error` (some SDK versions return error body in `data` for non-2xx)
- Add a `console.error` log so the actual error is visible in browser console for debugging

**File: `supabase/functions/credit-listing-bonus/index.ts`**
- Add a `console.log` at function entry to confirm invocation
- Add a `console.log` before the role check result to diagnose role failures
- This will make future failures diagnosable via edge function logs

### Summary
Two small changes: better client-side error surfacing and server-side logging. No logic changes to the verification flow itself — the function should work for users with the correct roles.

