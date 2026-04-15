

# Fix: "List House" Dialog Not Submitting

## Root Cause

The submit button on `ListEmptyHouseDialog` is **silently disabled** when any required field is empty (line 570):

```text
disabled={submitting || !monthlyRent || !form.region || !form.address || !form.village || !form.lc1_name || !form.lc1_phone}
```

When the button is disabled, tapping it does absolutely nothing — no error message, no toast, no visual indicator telling the agent what's missing. This creates a dead-end UX where agents think the form is broken.

Additionally, line 120 has a **silent validation gate** comparing `lc1_village` to `village` — if there's any casing/whitespace mismatch, the submit silently fails with a toast that may not be visible on mobile.

## Fix Plan

### File: `src/components/agent/ListEmptyHouseDialog.tsx`

1. **Remove the `disabled` condition** from the submit button (keep only `submitting` check)
2. **Add clear validation feedback** in `handleSubmit` — show toast errors for each missing field so agents know exactly what to fill in
3. **Make the button always tappable** but show specific error messages when fields are missing (e.g., "Monthly rent is required", "Please select a region")
4. **Relax the LC1 village comparison** — use trimmed, case-insensitive matching and auto-sync `lc1_village` from `village` on submit to avoid mismatches
5. **Add a visual indicator** (red border or missing-field highlight) on empty required fields when submit is attempted

### Changes Summary

| What | Why |
|------|-----|
| Remove multi-condition `disabled` from button | Button appears dead with no feedback |
| Add per-field validation toasts in `handleSubmit` | Agents know exactly what's missing |
| Auto-sync `lc1_village = village` before comparison | Prevents edge-case mismatch from stale state |
| Add `attempted` state for red field borders | Visual cue for missing fields |

No database changes needed.

