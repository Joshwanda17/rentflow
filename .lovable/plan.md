

## Add National ID Requirement & Duplicate Detection for Tenants

### Overview
Make the National ID number a required field during tenant registration, enforce that the name on the ID matches the registered name, and detect duplicate National IDs to prevent double-registration.

### Changes

**1. Database: Add unique constraint on `national_id`**
- Migration: `CREATE UNIQUE INDEX IF NOT EXISTS profiles_national_id_unique ON public.profiles (national_id) WHERE national_id IS NOT NULL AND national_id != ''`
- This allows the DB to enforce uniqueness while permitting nulls for non-tenant profiles

**2. Edge Function: `supabase/functions/register-tenant/index.ts`**
- Accept `national_id` from request body
- Validate format (alphanumeric, 10-14 chars, uppercase)
- Before creating the user, check `profiles` for an existing `national_id` match — if found, return an error: `"A tenant with this National ID already exists"`
- Save `national_id` to the profile after user creation

**3. Frontend: `src/components/agent/RegisterTenantDialog.tsx`**
- National ID field is already present and required — no changes needed
- Add client-side duplicate check: after the agent enters the National ID and leaves the field (onBlur), query `profiles` to check if that ID already exists. Show an inline error immediately: "This National ID is already registered"
- Validate that `tenantFullName` is not empty when `tenantNationalId` is provided (already enforced by `required`)

**4. Frontend: `src/components/tenant/RentRequestForm.tsx`**
- Add the same onBlur duplicate check for the National ID field
- Show inline error if the ID is already taken by another user (excluding the current user's own profile)

### Technical Details

**Duplicate check query (client-side, onBlur):**
```typescript
const { data } = await supabase
  .from('profiles')
  .select('id, full_name')
  .eq('national_id', value.trim().toUpperCase())
  .neq('id', currentUserId) // exclude self
  .maybeSingle();
if (data) setNationalIdError(`This National ID is already registered to ${data.full_name}`);
```

**Edge function validation:**
```typescript
function validateNationalId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase();
  if (cleaned.length < 10 || cleaned.length > 14) return null;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}
```

### Files Modified
- `supabase/functions/register-tenant/index.ts` — add national_id validation & duplicate check
- `src/components/agent/RegisterTenantDialog.tsx` — add onBlur duplicate detection with inline error
- `src/components/tenant/RentRequestForm.tsx` — add onBlur duplicate detection with inline error
- New migration — unique partial index on `profiles.national_id`

