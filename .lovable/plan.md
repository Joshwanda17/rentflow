

## Investigation: `INSUFFICIENT FLOAT: UGX NaN`

### Root cause analysis

The agent's float (`agent_landlord_float.balance = 1,500,000`) IS in the database — confirmed via direct query. The "NaN" is a **frontend rendering artifact**, not a real balance issue.

There are **three independent bugs** producing this symptom:

**Bug 1 — Wrong float source in `TenantProfileView` & `AgentTenantCollectDialog`**
Both use `useAgentBalances(user.id)` which reads `wallets.float_balance` (the 3‑bucket wallet model). But the actual landlord-payout float lives in a **separate** table `agent_landlord_float.balance`. So agents with 1.5M in `agent_landlord_float` see `0` here, fail the `agentFloatBalance < 500` guard, and the "Pay from Float" button is disabled or throws.

**Bug 2 — Eligibility RPC contract mismatch (`issue-landlord-payout-otp`)**
Edge function (line 135) checks `(elig as any).ok === false`, but the RPC `check_landlord_payout_eligibility` returns `{ eligible, float_ok, ... }` — there is **no `ok` field**. So ineligibility is silently ignored. OTP is sent, agent enters it, then the trigger on `landlord_payouts` insert raises `Insufficient landlord float (...)` — surfaced as a generic error message client-side.

**Bug 3 — `formatUGX(NaN)` produces `"UGX NaN"`**
Several places do arithmetic like `walletBalance - pendingAmount` or `req.rent_amount - floatBalance`. If either operand arrives as `string` from PostgREST (numeric columns >2³¹ serialize as strings) or `undefined` during the first render, the subtraction yields `NaN`, and `formatDynamic(NaN)` → `Intl.NumberFormat(...).format(NaN)` → literal `"UGX NaN"`. Combined with hard-coded "Insufficient float" messages, the user sees `"INSUFFICIENT FLOAT: UGX NaN"`.

### Fix plan

1. **Create `useAgentLandlordFloat` hook** that reads `agent_landlord_float.balance` and coerces with `Number()`. Replace `useAgentBalances` usage in:
   - `src/components/agent/TenantProfileView.tsx`
   - `src/components/agent/AgentTenantCollectDialog.tsx`

2. **Fix `issue-landlord-payout-otp` eligibility check** — change `(elig as any).ok === false` to `(elig as any).eligible === false`, and surface the failing reason (`float_ok`, `cutoff_ok`, `landlord_verified`) in the returned error so the dialog tells the agent *why*.

3. **Harden `formatUGX` / `formatDynamic`** — guard against `NaN`/`null`/`undefined`/string inputs:
   ```ts
   export function formatDynamic(amount: unknown): string {
     const n = Number(amount);
     if (!Number.isFinite(n)) return 'UGX 0';
     // ... existing logic with `n`
   }
   ```

4. **Coerce numerics on read** — in `AgentFloatPayoutWizard` (line 65) and the new `useAgentLandlordFloat` hook, wrap `data?.balance ?? 0` in `Number()` to defend against PostgREST string serialization of large numerics.

5. **Verify** — log in as one of the affected agents (e.g. `99890a2e-…` with 1.5M float), open Tenant Profile, confirm float displays correctly, allocate a payment, confirm it succeeds.

### Files touched

| File | Change |
|---|---|
| `src/hooks/useAgentLandlordFloat.ts` | **new** — reads `agent_landlord_float` |
| `src/components/agent/TenantProfileView.tsx` | swap balance hook |
| `src/components/agent/AgentTenantCollectDialog.tsx` | swap balance hook |
| `src/components/agent/AgentFloatPayoutWizard.tsx` | `Number()` coercion on float fetch |
| `src/lib/currencyFormat.ts` | NaN-safe `formatDynamic` |
| `supabase/functions/issue-landlord-payout-otp/index.ts` | use `eligible` not `ok`; return reason |

No database migration is needed — the data is already correct; this is purely a read/format/contract bug.

