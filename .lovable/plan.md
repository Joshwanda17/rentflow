# Agent Guarantor System — Full Implementation Plan

SPLIT WALLET INTO TWO COMMISSION AND FLOAT. WHEREBY FLOAT IS THE AMOUNT DEPOSITED BY THE AGENT ONTO THEIR WALLETS AND IT  CAN BE SENT TO TENANT WALLETS USED TO PAY THE TENANT RENT. WHILE COMMISSION IS THE MONEY REWARDED BY THE SYSTEM TO THE AGENT UPON SUCCESSFUL RENT REPAYMENTS

## What Exists Today

The system **already has most of the mechanics** in place:

- `subscription_charges.agent_id` links tenants to their onboarding agent
- `auto-charge-wallets` edge function implements 72-hour grace period + agent fallback charging
- `chargeAgent()` deducts from agent wallet when tenant defaults
- `accumulated_debt` tracks unpaid shortfalls
- Circuit breaker (3 consecutive failures → stalled)

**What's missing:**

1. No explicit guarantor consent at onboarding ("By onboarding this tenant, you accept financial responsibility")
2. No agent-facing **Risk Exposure** dashboard showing guaranteed tenants + potential losses
3. `chargeAgent()` deducts from the general wallet (not commission-specific) and directly updates balance (violates Trigger-Only policy)
4. No agent liability/debt tracking when commission is insufficient
5. Agent Agreement (v1.0) doesn't mention guarantor responsibility

## Plan

### 1. Add Guarantor Consent to Tenant Registration Flow

**Files:** `src/components/agent/CreateUserInviteDialog.tsx`, `src/components/agent/AgentRentRequestDialog.tsx`, `src/components/agent/RegisterTenantDialog.tsx`

Before submitting a tenant registration, show a confirmation dialog:

> "By onboarding this tenant, you accept full financial responsibility if they default on rent payments. Defaults will be recovered from your commission wallet after a 72-hour grace period."

Add a mandatory checkbox acknowledgment. Store `guarantor_acknowledged_at` timestamp in the `register-tenant` edge function response metadata.

### 2. Update Agent Agreement to v1.1

**File:** `src/components/agent/agreement/AgentAgreementContent.ts`

Add a new **Section 6A: Guarantor Responsibility** to the agreement text:

- Agent automatically becomes guarantor for every tenant they onboard
- After 72-hour grace period, defaults are recovered from agent's commission wallet
- If commission is insufficient, the shortfall becomes an agent liability (debt)
- Agent cannot manually use commission to pre-pay rent — only the system triggers recovery
- Every recovery deduction is logged as a `RECOVERY_TRANSACTION` in the ledger

Bump version to `v1.1`. Existing agents will see the "Accept Terms" button again.

### 3. Build Agent Risk Exposure Card

**New file:** `src/components/agent/AgentRiskExposureCard.tsx`

A card on the agent dashboard showing:

- **Guaranteed Tenants**: count of active `subscription_charges` where `agent_id = me`
- **Total Exposure**: sum of `charge_amount` across all active subscriptions (what they'd owe per period if ALL tenants defaulted)
- **Active Debt**: sum of `accumulated_debt` across their tenants' subscriptions
- **Defaults This Month**: count of `tenant_default_charge` ledger entries this month
- Color-coded risk indicator (green/yellow/red based on exposure vs. commission earnings)

Data source: `subscription_charges` where `agent_id = user.id` and `status = 'active'`

### 4. Fix `chargeAgent()` to Follow Trigger-Only Wallet Policy

**File:** `supabase/functions/auto-charge-wallets/index.ts`

The current `chargeAgent()` function directly updates `wallets.balance` (line 671-675), violating the Trigger-Only policy. Fix to:

1. Upsert wallet existence (ensure row exists)
2. Insert `general_ledger` entry with `category: 'tenant_default_charge'`, `direction: 'cash_out'`, `role_type: 'agent'`
3. Let `sync_wallet_from_ledger` trigger handle balance update
4. Remove the direct `.update({ balance: newBalance })` call
5. Keep the balance check (SELECT) to verify sufficient funds before inserting the ledger entry

### 5. Add Agent Liability Tracking for Insufficient Commission

**File:** `supabase/functions/auto-charge-wallets/index.ts` (in `chargeAgent()`)

When agent wallet has insufficient funds:

- Record the shortfall in `accumulated_debt` on `subscription_charges` (already happens)
- Insert a `general_ledger` entry with `category: 'agent_liability'`, `direction: 'cash_out'`, amount = shortfall, `description: 'Agent guarantor liability — insufficient commission'`
- This creates a traceable debt record in the ledger
- When agent next receives commission, the existing auto-repayment mechanism in `approve-wallet-operation` can recover it

## Files Changed


| File                                                      | Change                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/agent/agreement/AgentAgreementContent.ts` | Add Section 6A (Guarantor), bump to v1.1                               |
| `src/components/agent/CreateUserInviteDialog.tsx`         | Add guarantor consent checkbox for tenant type                         |
| `src/components/agent/AgentRentRequestDialog.tsx`         | Add guarantor consent before submitting                                |
| `src/components/agent/RegisterTenantDialog.tsx`           | Add guarantor consent before submitting                                |
| `src/components/agent/AgentRiskExposureCard.tsx`          | New — risk exposure dashboard card                                     |
| `src/components/agent/AgentDashboard.tsx` (or equivalent) | Mount the risk exposure card                                           |
| `supabase/functions/auto-charge-wallets/index.ts`         | Fix `chargeAgent()` to use ledger-only pattern; add liability tracking |


## What This Achieves

- Agent is explicitly informed of guarantor responsibility before onboarding
- Agreement is legally binding with clear guarantor terms
- Agent can see their risk exposure at all times (behavioral incentive to be careful)
- Wallet integrity maintained via ledger-only writes
- Shortfalls become tracked liabilities, recoverable from future commissions
- Self-regulating system: agents stop onboarding risky tenants