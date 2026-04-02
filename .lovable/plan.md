

# Fix: EditLC1Dialog — Pull Fresh Data from DB on Open

## Problem

The Edit button on LC1 Chairpersons opens the `EditLC1Dialog` with an empty form. Two bugs:

1. **`initForm()` only runs inside `onOpenChange`** — but the dialog is controlled via the `open` prop (set by `!!editLC1`), so `onOpenChange` with `true` never fires reliably. The form stays blank.
2. **No fresh DB fetch** — unlike `EditLandlordDialog` (which queries the `landlords` table on open), the LC1 dialog just uses stale prop data. Edits made by other users won't be visible.

## Fix

Rewrite `EditLC1Dialog` to match the `EditLandlordDialog` pattern:

### `src/components/executive/landlord-ops/EditLC1Dialog.tsx`

1. **Add `useEffect` to fetch fresh data** when `open` changes to `true`:
   - Query `lc1_chairpersons` table by phone (or name) to get the latest name/phone/village
   - If no record in `lc1_chairpersons`, fall back to the prop data from `house_listings`
   - Show a loading spinner while fetching

2. **Remove the broken `initForm()` / `onOpenChange` pattern** — replace with a `useEffect` that triggers on `open + lc1` changes

3. **Keep the save logic intact** — it already correctly updates both `house_listings` and `lc1_chairpersons`

### Key change (pseudocode):
```tsx
useEffect(() => {
  if (!open || !lc1) return;
  setLoading(true);
  // Try to fetch from lc1_chairpersons by phone
  const { data } = await supabase
    .from('lc1_chairpersons')
    .select('name, phone, village')
    .eq('phone', lc1.phone)
    .maybeSingle();
  
  setForm({
    name: data?.name || lc1.name || '',
    phone: data?.phone || lc1.phone || '',
    village: data?.village || lc1.village || '',
  });
  setLoading(false);
}, [open, lc1]);
```

## Files Modified
- `src/components/executive/landlord-ops/EditLC1Dialog.tsx` — add useEffect for fresh DB fetch, remove broken initForm pattern, add loading state

