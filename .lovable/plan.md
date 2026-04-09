

# Fix: Agent Commission Balance Undercount Blocks Withdrawals

## Root Cause

The `get_agent_split_balances` RPC function drastically undercounts agent commission because it only recognizes 3 credit categories (`agent_commission_earned`, `agent_commission`, `agent_bonus`) but ignores the biggest income source: **`referral_bonus`** (5,289 entries system-wide). It also misses `agent_commission_payout` and several other credit categories.

**Result**: Agents see a tiny "Commission Balance" (e.g., USh 97,951) while their actual wallet balance is much higher. Since the withdrawal dialog caps withdrawals at `commissionBalance`, agents effectively can't withdraw most of their money.

**Data proof**: Agent ATUHAIRE CAROLYNE has wallet balance 20,109,233 but the RPC returns only 40,903 commission. Agent LUKODDA JOSEPH has 28,104,740 in wallet but RPC returns 0 commission.

## Fix

### 1. Update `get_agent_split_balances` RPC (Database Migration)

Add missing categories to the commission calculation:

**Credits (add)**:
- `referral_bonus` — the #1 agent income source
- `agent_commission_payout` — 51 entries
- `proxy_investment_commission` — 6 entries

**Debits (add)**:
- `withdrawal_pending` — category used by the withdrawal dialog (line 184 of WithdrawRequestDialog.tsx)

Updated SQL:
```sql
CREATE OR REPLACE FUNCTION public.get_agent_split_balances(p_agent_id UUID)
RETURNS TABLE(float_balance NUMERIC, commission_balance NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE
      WHEN category IN ('agent_float_deposit', 'wallet_deposit') AND direction IN ('cash_in', 'credit') THEN amount
      WHEN category IN ('agent_float_used_for_rent', 'rent_payment_for_tenant') AND direction IN ('cash_out', 'debit') THEN -amount
      ELSE 0
    END), 0) AS float_balance,
    COALESCE(SUM(CASE
      WHEN category IN ('agent_commission_earned', 'agent_commission', 'agent_bonus', 'referral_bonus', 'agent_commission_payout', 'proxy_investment_commission') AND direction IN ('cash_in', 'credit') THEN amount
      WHEN category IN ('agent_commission_withdrawal', 'agent_commission_used_for_rent', 'tenant_default_charge', 'withdrawal_pending') AND direction IN ('cash_out', 'debit') THEN -amount
      ELSE 0
    END), 0) AS commission_balance
  FROM general_ledger
  WHERE user_id = p_agent_id;
$$;
```

### 2. No frontend changes needed

The wallet sheet and withdrawal dialog already correctly pass `commissionBalance` — once the RPC returns accurate numbers, withdrawals will work.

## Risk Assessment

- Low risk — read-only function, no data mutation
- Fixes a critical revenue-blocking bug for agents
- Should be verified by comparing updated commission balances against wallet balances for top agents

