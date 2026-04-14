

## Plan: Fix Landlord Display and Add Button

### Problem 1: "No landlord linked"
The houses shown in the screenshot (`Single Room in Wakiso`, `House near the Road`) genuinely have `landlord_id = NULL` in the database. They were never linked to a landlord during listing. The UI is correctly showing "No landlord linked" — this is a data issue, not a display bug.

### Problem 2: "Add" button silently fails
The `house_listings` table UPDATE policy only allows agents to update their own listings:
```sql
-- Current: only the listing agent can update
Agents can update own listings: auth.uid() = agent_id
```

When an Operations or Executive user clicks "Add" to assign a landlord, the `AssignPersonDialog` runs:
```typescript
await supabase.from('house_listings')
  .update({ landlord_id: person.id })
  .eq('id', listingId);
```

This fails silently because RLS blocks the update for non-agent roles. There is no UPDATE policy for operations/executive roles.

### Fix

**Database migration** — Add an UPDATE policy for operations and executive roles on `house_listings`:

```sql
CREATE POLICY "Operations and executives can update house listings"
ON public.house_listings
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'operations') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'coo') OR
  has_role(auth.uid(), 'ceo') OR
  has_role(auth.uid(), 'cfo') OR
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'cto')
)
WITH CHECK (
  has_role(auth.uid(), 'operations') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'coo') OR
  has_role(auth.uid(), 'ceo') OR
  has_role(auth.uid(), 'cfo') OR
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'cto')
);
```

This matches the existing SELECT policy for these roles, ensuring they can both view and update listings (assign landlords, agents, verify, etc.).

### Files

| File | Action |
|------|--------|
| Database migration | **Create** — add UPDATE RLS policy for operations/executive roles on `house_listings` |

No code changes needed — the `AssignPersonDialog` logic is correct, it's just being blocked by RLS.

