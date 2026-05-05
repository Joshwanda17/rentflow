## Problem

The agent's **Register Tenant Under Landlord** dialog (`src/components/agent/RegisterTenantDialog.tsx`) is failing silently for most agents. Two root causes:

### 1. Hard-fails on new tenants
Lines 169–194 look up the tenant strictly by email/phone in `profiles`. If no profile exists (the common case — the agent is registering someone new), it toasts `"Tenant not found. They need to sign up first."` and stops. From the agent's perspective, the form just "doesn't submit".

### 2. No rent request is ever created
The current handler only inserts into `landlords` and updates `profiles.rent_discount_active` / `monthly_rent`. It never inserts into `rent_requests`, so the registration the agent thinks they completed never appears in the rent pipeline, no commission is wired up, and downstream RLS that depends on `rent_requests.agent_id` (e.g. agent ↔ tenant visibility) doesn't engage.

A third minor issue: the `profiles` UPDATE at line 198 will be silently rejected by RLS for new tenants the agent does not yet manage (no policy lets a generic agent update an arbitrary profile), so even when a profile exists, name/national_id sync may not stick.

## Fix

Refactor `handleSubmit` to route through the existing **`submit-tenant-form`** edge function (which already handles tenant auto-provisioning, landlord upsert, and `rent_requests` creation under the rent formula trigger), instead of writing to tables directly from the client.

### Steps

1. **Replace direct table writes with edge function call** in `RegisterTenantDialog.tsx`:
   - Use `invokeEdgeFunction('submit-tenant-form', { body: {...} })` from `src/lib/invokeEdgeFunction.ts` (already standardised wrapper with toast + 500 handling).
   - Payload: tenant identity (email/phone/national_id/full_name), landlord block, monthly_rent, lat/lng, LC1 chairperson, agent id (auto from JWT on the server), `guarantor_consent: true`.
   - Pass `0` for the four formula-derived fee fields per `mem://business-model/rent-formula` (DB trigger fills them).

2. **Remove the brittle "tenant must exist" pre-check** — let the edge function provision a managed tenant profile (`managed_by_agent=true`, `managing_agent_id=agent.id`) when no match is found. This is consistent with `QuickRegisterTenantDialog` behaviour.

3. **Surface backend errors** — `invokeEdgeFunction` already toasts structured errors, so the user will see the real reason (duplicate national ID, RLS failure, etc.) instead of a silent stall.

4. **Verify `submit-tenant-form` accepts this payload shape** — quick read of `supabase/functions/submit-tenant-form/index.ts` to confirm field names and adjust the payload if needed before wiring.

5. **Keep LC1 insert client-side** (current behaviour is fine, RLS allows agents).

6. **Success path unchanged** — show the existing success card and call `onSuccess?.()`.

### Files to touch

- `src/components/agent/RegisterTenantDialog.tsx` — replace lines ~166-269 (the `try` block in `handleSubmit`) with the edge-function call; drop the now-unused tenant lookup + profile UPDATE blocks.

### Files to read (verification)

- `supabase/functions/submit-tenant-form/index.ts` — confirm payload contract.
- `src/components/agent/QuickRegisterTenantDialog.tsx` — mirror the working pattern.

## Out of scope

- No DB migrations required; existing RLS on `landlords`, `rent_requests`, and the rent-formula trigger already cover the path.
- No changes to commission logic — the 2% / 10% rules fire from existing rent_request triggers once the row exists.
