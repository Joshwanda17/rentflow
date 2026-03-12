## Problem

When a tenant activates their account and lands on `/dashboard?role=tenant`, they see the **Agent dashboard** instead of the **Tenant dashboard**. This happens because:

1. **Default role is hardcoded to `agent**` — In `roleManager.ts`, after fetching roles, the system always defaults to `'agent'` (unless supporter-only), ignoring the role the user actually signed up as.
2. **Race condition** — The Dashboard's `useEffect` that reads `?role=tenant` from the URL and calls `switchRole` races against `fetchUserRoles` which resets the role back to `'agent'`.

## Fix

### 1. Respect the activation role in `roleManager.ts`

Modify `fetchUserRoles` to accept an optional `preferredRole` parameter. When provided (e.g., from the activation URL), use it as the default instead of `'agent'` — but only if the user actually has that role.

**File:** `src/hooks/auth/roleManager.ts`

- Add optional `preferredRole` parameter to `fetchUserRoles`
- On line 52-54, if `preferredRole` is provided and exists in `userRoles`, use it as default instead of `'agent'`

### 2. Pass the URL role param into the auth flow

**File:** `src/pages/Dashboard.tsx`

- Read the `?role=` param early and pass it through to the role resolution logic so `fetchUserRoles` knows the intended role before defaulting

### 3. Fix the Dashboard `useEffect` timing

**File:** `src/pages/Dashboard.tsx`

- Ensure the `?role=` switch effect runs **after** roles are loaded (gate on `roles.length > 0` and `!loading`) to prevent the race condition where `switchRole` fires before `fetchUserRoles` completes

### 4. Activation redirect uses correct role

**File:** `src/pages/ActivateSupporter.tsx` (line 264-265)

- Already passes `?role=${activatedRole}` — this is correct. No change needed here.

## Technical Details

The core change is in `roleManager.ts`:

```text
Current:  defaultForUser = isSupporterOnly ? 'supporter' : 'agent'
Proposed: defaultForUser = isSupporterOnly ? 'supporter'
            : (preferredRole && userRoles.includes(preferredRole)) ? preferredRole
            : 'agent'
```

The `preferredRole` will be sourced from:

- URL `?role=` param on dashboard load
- `user_metadata.role` set during activation (already stored by `activate-supporter` Edge Function)

This ensures a tenant who activates as a tenant sees the tenant dashboard first, while preserving the agent-default behavior for users who log in normally with multiple roles.

Ensure this doesn't affect the Funder enforcement