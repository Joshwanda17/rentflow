

# Fix: EditLC1Dialog Saves Not Persisting

## Root Cause

The `EditLC1Dialog` receives `{ name, phone, village, listingIds }` but **not the LC1 `id`**. The save function (line 93) tries to find the `lc1_chairpersons` record by phone — but if phone is null/empty, the update is skipped entirely. Even when phone exists, a phone change would cause a lookup mismatch.

Meanwhile, the LC1 list now comes from the `lc1_chairpersons` table which has a proper `id` field, but it's never passed to the dialog.

## Fix

### 1. Pass `id` to `EditLC1Dialog`

**File: `src/components/executive/landlord-ops/EditLC1Dialog.tsx`**
- Add `id: string` to the `LC1Data` interface
- Change `handleSave` to update `lc1_chairpersons` by `id` directly instead of phone lookup:
  ```ts
  await supabase.from('lc1_chairpersons').update({
    name: form.name.trim(),
    phone: form.phone.trim() || null,
    village: form.village.trim() || null,
  }).eq('id', lc1.id);
  ```
- Also use `id` for the fresh-fetch in `useEffect` (query by `id` instead of `phone`)

### 2. Pass `id` from the edit button

**File: `src/components/executive/LandlordOpsDashboard.tsx`**
- Line ~799: Add `id: lc1.id` to the `setEditLC1` call
- Update the `editLC1` state type to include `id: string`

## Files Modified
- `src/components/executive/landlord-ops/EditLC1Dialog.tsx` — use `id` for DB update + fetch
- `src/components/executive/LandlordOpsDashboard.tsx` — pass `id` to dialog

