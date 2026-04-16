

# Agent Wallet Segmentation: Advance → Commission & Float-Gated Withdrawals

## Current State

- **`get_agent_split_balances` RPC** calculates Commission from specific categories (`agent_commission_earned`, `agent_bonus`, `referral_bonus`, etc.). Everything else = Float (total − commission).
- **Agent advance disbursement** (CFO pays advance) uses `wallet_deposit` category → currently falls into **Float** section.
- **Withdrawals** are already gated to commission balance only (approve-withdrawal edge function checks `commission_balance`).

## What Needs to Change

### 1. New Ledger Category for Agent Advances
Instead of reusing `wallet_deposit`, agent advance disbursements should use a dedicated category: **`agent_advance_credit`**.

- **Add to `LOCKED_CATEGORIES`** in `ledgerConstants.ts`
- **Add to `validate_ledger_category`** DB function via migration
- **Update `CFOAdvanceRequestPayments.tsx`** — change the wallet leg from `wallet_deposit` to `agent_advance_credit`

### 2. Update Split Balances RPC
Modify `get_agent_split_balances` to include `agent_advance_credit` as a **commission category** (cash_in), so advance money appears in the Commission section, not Float.

### 3. Float-Gated Withdrawal Rule
Add a check: **commission is only withdrawable when the agent has positive float** (meaning they've received rent money for landlord payment). 

- **Update `approve-withdrawal` edge function**: After computing `commissionBalance`, also check `floatBalance > 0`. If float is zero or negative, block withdrawal with message: "Withdrawals require active landlord payment funds (float)."
- **Update `AgentFloatBalanceCard.tsx`**: Reflect the new rule in the UI — show "Withdrawable" as 0 when float ≤ 0, with a note explaining why.

## Files to Change

| File | Change |
|------|--------|
| `src/lib/ledgerConstants.ts` | Add `agent_advance_credit` to `LOCKED_CATEGORIES` |
| **DB Migration** | Add `agent_advance_credit` to `validate_ledger_category` allowlist + update `get_agent_split_balances` RPC |
| `src/components/cfo/CFOAdvanceRequestPayments.tsx` | Change wallet leg category from `wallet_deposit` to `agent_advance_credit` |
| `supabase/functions/approve-withdrawal/index.ts` | Add float > 0 check before allowing agent withdrawals |
| `src/components/agent/AgentFloatBalanceCard.tsx` | Show withdrawable as 0 when float ≤ 0, add explanatory text |

## Updated RPC Logic (Summary)

```text
Commission categories (cash_in):
  agent_commission_earned, agent_commission, agent_bonus,
  referral_bonus, proxy_investment_commission,
  agent_advance_credit  ← NEW

Commission categories (cash_out):
  agent_commission_withdrawal, agent_commission_used_for_rent,
  tenant_default_charge

Float = Total Balance − Commission Balance (unchanged formula)

Withdrawable = commission > 0 AND float > 0 ? commission : 0
```

