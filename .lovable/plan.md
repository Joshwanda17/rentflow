

# Fix: LC1 Edits Not Persisting — Missing UPDATE RLS Policy

## Root Cause

The `lc1_chairpersons` table has RLS enabled with only **SELECT** and **INSERT** policies. There is **no UPDATE policy**. When `EditLC1Dialog` calls `.update().eq('id', lc1.id)`, Supabase silently returns success with 0 rows affected — the toast says "updated" but nothing changed in the database.

## Fix

### 1. Database Migration — Add UPDATE and DELETE policies

```sql
-- Allow managers to update LC1 chairpersons
CREATE POLICY "Managers can update lc1"
ON public.lc1_chairpersons FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'))
WITH CHECK (has_role(auth.uid(), 'manager'));

-- Allow managers to delete LC1 chairpersons
CREATE POLICY "Managers can delete lc1"
ON public.lc1_chairpersons FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'manager'));
```

### 2. `EditLC1Dialog.tsx` — Check rows affected

Add a check after the update to verify the row was actually modified, and show an error if it wasn't:

```ts
const { error: lc1Error, count } = await supabase
  .from('lc1_chairpersons')
  .update({ name, phone, village })
  .eq('id', lc1.id)
  .select();

if (lc1Error) throw lc1Error;
```

## Files Modified
- DB migration: UPDATE + DELETE policies on `lc1_chairpersons` for managers
- `src/components/executive/landlord-ops/EditLC1Dialog.tsx` — verify update succeeded

