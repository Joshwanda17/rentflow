

# Fix: Negative Float Balances for All Agents

## Root Cause

The `get_agent_split_balances` RPC classifies `rent_payment_for_tenant` as a **float debit**, but there are **zero `agent_float_deposit` entries in the entire database**. No agent has ever received a formal float deposit.

When agents use the "I Collected Cash" flow, the system creates `rent_payment_for_tenant` (cash_out) entries against their wallet — but the money actually came from **commission earnings** (referral_bonus, agent_commission, etc.), not from float deposits.

**Result**: Every agent who paid rent for a tenant shows a negative float balance (e.g., LOLEM FIRICILA: -USh 115,000) because the formula subtracts rent payments from a float pool that was never funded.

**Data proof**:
- `agent_float_deposit` entries system-wide: **0**
- `rent_payment_for_tenant` entries system-wide: **50** (totaling UGX 2,070,042)
- 6 agents affected with negative float balances

## Fix

### Database Migration: Update `get_agent_split_balances` RPC

Move `rent_payment_for_tenant` from the **float debit** bucket to the **commission debit** bucket, since the funds are sourced from commission earnings (not float capital).

```sql
CREATE OR REPLACE FUNCTION public.get_agent_split_balances(p_agent_id UUID)
RETURNS TABLE(float_balance NUMERIC, commission_balance NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Float: only actual float deposits minus float-specific usage
    COALESCE(SUM(CASE
      WHEN category IN ('agent_float_deposit', 'wallet_deposit') AND direction IN ('cash_in', 'credit') THEN amount
      WHEN category = 'agent_float_used_for_rent' AND direction IN ('cash_out', 'debit') THEN -amount
      ELSE 0
    END), 0) AS float_balance,
    -- Commission: all earned income minus all outflows (including rent payments for tenants)
    COALESCE(SUM(CASE
      WHEN category IN ('agent_commission_earned', 'agent_commission', 'agent_bonus', 'referral_bonus', 'agent_commission_payout', 'proxy_investment_commission') AND direction IN ('cash_in', 'credit') THEN amount
      WHEN category IN ('agent_commission_withdrawal', 'agent_commission_used_for_rent', 'tenant_default_charge', 'withdrawal_pending', 'rent_payment_for_tenant') AND direction IN ('cash_out', 'debit') THEN -amount
      ELSE 0
    END), 0) AS commission_balance
  FROM general_ledger
  WHERE user_id = p_agent_id;
$$;
```

**Key change**: `rent_payment_for_tenant` moved from float debits → commission debits.

### No frontend changes needed

The wallet card and withdrawal dialog already read from the RPC correctly. Once the RPC categorizes properly, float will show 0 (no deposits) and commission will accurately reflect earnings minus all outflows.

