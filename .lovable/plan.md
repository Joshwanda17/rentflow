

## Single-Role Signup with URL Validation

### Problem
Currently, all non-supporter signups get 4 roles (`supporter, agent, tenant, landlord`). The user wants each signup to only receive the **one role** they selected. Additionally, the `/auth` page needs to handle missing/invalid role params gracefully.

### Flow Design

**Scenario 1: User arrives from Landing page**
- Landing intent buttons → `/auth?role=tenant` (or agent/landlord/supporter)
- Role is validated against allowlist: `tenant`, `agent`, `landlord`, `supporter`
- Invalid/tampered values → redirected back to `/welcome`
- Role displayed as a badge on the signup form (read-only, persistent)
- User can click "Change" to go back to `/welcome`

**Scenario 2: User lands on `/auth` with no role param**
- Show an inline role selector (4 cards matching the Landing page options) at the top of the signup form
- User must pick a role before the form fields appear
- Once selected, the role is appended to the URL (`/auth?role=tenant`) for persistence across refreshes

**Scenario 3: User lands on `/auth` for login (not signup)**
- No role needed — login works as normal, role param is ignored

### Changes

**1. `src/pages/Landing.tsx`** — Fix `handleIntent`
- Change navigation from `/rent-calculator` to `/auth?role=${role}`

**2. `src/hooks/useAuthForm.ts`** — Validate and persist role
- Define `VALID_SIGNUP_ROLES = ['tenant', 'agent', 'landlord', 'supporter']`
- Sanitize `role` param: if present but not in allowlist, clear it and redirect to `/welcome`
- Pass validated role as `intended_role` in `signUpWithoutRole` metadata

**3. `src/hooks/auth/authOperations.ts`** — Add `intended_role` to signup metadata
- Update `signUpWithoutRole` to accept optional `intendedRole` param
- Store it in `user_metadata.intended_role`

**4. `src/hooks/auth/roleManager.ts`** — Provision single role only
- Change the non-supporter branch: instead of `STANDARD_ROLES`, use `[intendedRole]` (single role)
- If no `intended_role` in metadata, fall back to current behavior (all 4 roles) for backwards compatibility

**5. `src/pages/Auth.tsx`** — Add inline role selector for empty role param
- When `isSignUp` and no valid `role` param: show 4 role cards before the form
- On selection, update URL with `?role=selected` and proceed to form
- Show selected role as a badge with a "Change" link back to `/welcome`

**6. `src/pages/SelectRole.tsx`** — Simplify
- Since role is now assigned at signup, this page becomes a fallback for legacy users who have no roles
- Keep existing logic but remove multi-role selection — auto-submit the single `become_role` if present

### Security
- Role param validated client-side against a strict allowlist
- `intended_role` stored in auth metadata (server-side, tamper-resistant after signup)
- `roleManager` validates `intended_role` against known roles before provisioning
- URL sanitization prevents injection of invalid role values

### What stays the same
- Login flow unchanged
- Existing users' roles untouched
- Sub-agent referral flow (`?ref=...&become=agent`) continues working
- Google/Apple OAuth unaffected

