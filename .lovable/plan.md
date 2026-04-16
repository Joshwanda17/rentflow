

# Agent Wallet: Permission-Based Compartments (Not Float-Gated)

## The Problem with Current Implementation

We just added float-gating: "commission only withdrawable when float > 0". Your message clarifies this is wrong. The correct model:

- **Commission = agent's money → always withdrawable, no conditions**
- **Float = company money → NEVER withdrawable, only usable for landlord delivery**

## Changes Required

### 1. Remove Float-Gating from Withdrawal Approval
**File:** `supabase/functions/approve-withdrawal/index.ts`
- Remove the `floatBalance <= 0` block (lines 158-165)
- Keep the commission cap: `withdrawableBalance = Math.min(effectiveBalance, commissionBalance)` — this already prevents float from being withdrawn

### 2. Update AgentFloatBalanceCard UI
**File:** `src/components/agent/AgentFloatBalanceCard.tsx`
- Withdrawable = commission balance (always, no float condition)
- Remove the "Withdrawals locked" warning
- Float shown as "Company Funds" with no withdraw option

### 3. Update AgentWalletHeroCard UI
**File:** `src/components/agent/AgentWalletHeroCard.tsx`
- "Withdraw" button only draws from commission, label it "Withdraw Commission"
- Remove any float withdrawal path
- Add a separate "Pay Landlord" action button that operates on float

### 4. Update Agent Withdrawal Edge Function
**File:** `supabase/functions/agent-withdrawal/index.ts`
- When processing agent's own withdrawal, cap at commission balance (not total wallet)

### 5. Save Memory
Update `mem://business-model/agent-wallet-segmentation` with the corrected rule:
- Commission: freely withdrawable, no restrictions
- Float: never withdrawable, only assignable for landlord delivery
- No float-gating on commission withdrawals

## Summary of Rule Set

| Action | Allowed | Source |
|--------|---------|--------|
| Withdraw Commission | Always ✅ | Commission balance |
| Use Float for Landlord Payment | ✅ | Float balance |
| Withdraw Float | ❌ Never | — |

