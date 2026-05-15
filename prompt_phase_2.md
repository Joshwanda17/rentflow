# Phase 2: Middle-Tier Stabilization (Lovable Instructions)

**Copy and paste the exact prompt below into Lovable:**

***

**PROMPT TO LOVABLE:**

Please execute Phase 2 of our stabilization plan to enforce the Developer Constitution. We need to fix the brittle agent frontend hooks by making transactions atomic and making the GPS capture resilient.

Please perform the following exactly as described:

### 1. Create a Resilient GPS Hook
Many components (like `RentRequestForm.tsx`, `ViewingCheckinCard.tsx`, etc.) are hardcoding `navigator.geolocation.getCurrentPosition` with a 15-second high-accuracy requirement. This causes the app to freeze indefinitely on many phones. 

- Create a new hook: `src/hooks/useSmartLocation.ts`.
- The hook should attempt to capture GPS with `{ enableHighAccuracy: true, timeout: 5000 }`.
- **CRITICAL:** If it fails or times out after 5 seconds, it must automatically catch the error and fallback to `{ enableHighAccuracy: false, timeout: 10000 }`.
- Find all instances of `navigator.geolocation.getCurrentPosition` in the React frontend and replace them with this new `useSmartLocation` hook so no agent is ever blocked by bad GPS.

### 2. Make Tenant Registration 100% Atomic
Currently, `src/components/agent/RegisterTenantDialog.tsx` executes two sequential database calls:
1. `invokeEdgeFunction('register-tenant')`
2. `supabase.rpc('register_tenant_details')`
This violates our atomic transaction rule. If the second step fails, the tenant's Auth account is orphaned.

- Modify `supabase/functions/register-tenant/index.ts` (the Edge Function) to accept all the landlord, property, and rent details in the request body.
- The Edge Function must create the Auth user, and then *immediately* execute the `register_tenant_details` logic (or call the RPC internally) within a safe `BEGIN...COMMIT` block. If the assignment fails, the Edge Function must delete the orphaned Auth user and return a clean error.
- Modify `RegisterTenantDialog.tsx` to pass all form data into the single `register-tenant` Edge Function call. Completely remove the second `supabase.rpc('register_tenant_details')` call from the frontend.

### 3. Agent Deposit Verification Refetch
In `src/components/agent/AgentDepositCashDialog.tsx`, after successfully inserting into `deposit_requests`, ensure the dialog strictly calls a re-fetch of the `v_user_wallet_strict` (or the `wallets` view) to refresh the UI, rather than performing any optimistic math. (If it's already doing this via a context provider, just ensure no optimistic `setBalance` is present).

**Goal:** After these changes, the frontend should be completely resilient to bad network connections, bad GPS signals, and partial database failures.

***
