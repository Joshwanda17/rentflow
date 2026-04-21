

## Give link-onboarded users access to all 4 public dashboards + permanent login

When anyone activates an account through a link generated from the agent dashboard (tenant signup link, supporter/partner invite, promissory-note activation), they will be granted **all four public roles** — `tenant`, `agent`, `landlord`, `supporter` — and stay signed in across browser restarts so they never have to log in again unless they explicitly sign out.

### What changes

#### 1. `supabase/functions/activate-supporter/index.ts` — grant all 4 public roles

Currently this edge function only assigns the single role on the invite (and for supporters it actively *deletes* every other role — lines 278–289). After activation we will instead upsert all four public roles for the new user:

- Replace the single-role insert + supporter-only cleanup block with a bulk upsert of `tenant`, `agent`, `landlord`, `supporter` into `user_roles` (all `enabled: true`, `onConflict: 'user_id,role'`).
- The "intended" role from the invite is still recorded so we know which dashboard to land them on first (kept as `auth user_metadata.intended_role`), but no role is removed.
- The supporter-only cleanup branch is deleted entirely.

#### 2. `supabase/functions/activate-promissory-note/index.ts` — same upsert

Currently assigns only `supporter` (line 60). Replace with the same 4-role upsert so partners arriving via promissory-note links also get full access.

#### 3. `supabase/functions/submit-tenant-form/index.ts` — same upsert at tenant creation

When the agent submits a tenant via the public form, the tenant gets only `tenant` (line 122). Upsert all 4 public roles at creation so even before they activate via SMS link, the account is multi-role-ready.

#### 4. `src/hooks/auth/roleManager.ts` — stop the supporter-only special case

The "supporter-only accounts: do NOT inject 'agent' role" branch (lines 50–54) currently locks supporter-invite users out of the agent dashboard even after activation. Remove that branch so any user with a `supporter` row plus other roles sees all of them.

#### 5. `src/pages/ActivateSupporter.tsx` — land them on their intended dashboard, session already persists

No code change needed for persistence — `supabase/integrations/supabase/client.ts` already configures `persistSession: true`, `autoRefreshToken: true`, `storage: localStorage`, which keeps users logged in across browser restarts indefinitely until they sign out. The existing post-activation auto sign-in (line 233) plus `navigate('/dashboard?role=…')` (line 262) is preserved. Only adjustment: after sign-in we don't need to coerce them to a single role — `RoleSwitcher` will show all 4.

#### 6. `src/pages/ActivatePartner.tsx` — same multi-role upsert path

The partner activation currently relies on `activate-promissory-note` (which we're updating in step 2), so once that function grants all 4 roles, the partner automatically gets the same access. After successful activation we add a `navigate('/dashboard?role=supporter')` so they land somewhere meaningful instead of staying on the activation screen.

### Out of scope

- **Restricted/staff roles** (`manager`, `ceo`, `coo`, `cfo`, `cto`, `cmo`, `crm`, `employee`, `operations`, `super_admin`, `hr`) are **never** granted by activation. "All dashboards" means the 4 public dashboards; staff dashboards remain code-gated as today.
- No DB schema changes — `user_roles` already supports the 4-role upsert via the existing `(user_id, role)` unique constraint.
- No changes to login-form behavior, password-reset flow, or session timeouts. "Permanent login" is delivered by the existing `localStorage` + auto-refresh token configuration; we are simply ensuring activation does not break it.

### Files touched

- `supabase/functions/activate-supporter/index.ts` (replace single-role insert + supporter cleanup)
- `supabase/functions/activate-promissory-note/index.ts` (replace single-role upsert)
- `supabase/functions/submit-tenant-form/index.ts` (expand role upsert at tenant creation)
- `src/hooks/auth/roleManager.ts` (remove supporter-only branch)
- `src/pages/ActivatePartner.tsx` (post-activation redirect to dashboard)

