

## Fix TID Verification Search to Match Legacy Deposits

### Problem
Deposits submitted before the TID format enforcement stored transaction IDs without provider prefixes (e.g. `39665905645` or `TID39665905645` instead of `MP39665905645`). The TID Verify search does an exact `ilike` match, so searching `MP39665905645` fails against legacy records.

### Solution
Update the search logic in `TidVerification.tsx` to perform a **two-pass search**: first try exact match, then fall back to matching just the numeric portion of the TID.

### Changes to `src/components/financial-ops/TidVerification.tsx`

**Update `handleVerify` search logic (lines 74-84):**

1. Extract the numeric-only portion of the entered TID (strip `MP`, `TID`, or any alpha prefix)
2. Run two queries in parallel:
   - **Exact match**: `.ilike('transaction_id', '%{trimmedTid}%')` (handles new-format deposits)
   - **Numeric fallback**: `.ilike('transaction_id', '%{numericPortion}%')` (handles legacy deposits without prefix)
3. Merge and deduplicate results by deposit `id`
4. Rest of the flow (profile enrichment, amount matching, approval) stays the same

This is a ~15-line change isolated to the search block inside `handleVerify`. No other files change.

### What This Fixes
- Operator enters `MP39665905645` for MTN → matches both `MP39665905645` (new) and `39665905645` or `TID39665905645` (legacy)
- Operator enters `TID144205097399` for Airtel → matches both new and legacy formats
- No false positives: the amount check and manual review remain as safeguards

