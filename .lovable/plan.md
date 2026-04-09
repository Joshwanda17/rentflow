

# Fix: Agent Split Balances RPC — Production-Grade

## Summary
Apply two critical refinements to the `get_agent_split_balances` RPC: clamp commission to never go negative, and use explicit direction mapping with `ELSE 0` safety.

## Database Migration

Replace `get_agent_split_balances` with the user's provided production-ready version:

**Key changes from previous proposal:**
1. **`GREATEST(0, raw_commission_balance)`** — commission can never be negative; any overshoot absorbs into float
2. **`ELSE 0` fallback** — unknown directions don't silently corrupt totals
3. **Removed `agent_commission_payout`** from commission credits (it's a payout, not earnings)
4. **`raw_commission_balance`** intermediate alias for clarity

```sql
CREATE OR REPLACE FUNCTION public.get_agent_split_balances(p_agent_id UUID)
RETURNS TABLE(float_balance NUMERIC, commission_balance NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH totals AS (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN direction IN ('credit', 'cash_in') THEN amount
          WHEN direction IN ('debit', 'cash_out') THEN -amount
          ELSE 0
        END
      ), 0) AS total_balance,
      COALESCE(SUM(
        CASE
          WHEN category IN (
            'agent_commission_earned', 'agent_commission',
            'agent_bonus', 'referral_bonus', 'proxy_investment_commission'
          ) AND direction IN ('credit', 'cash_in') THEN amount
          WHEN category IN (
            'agent_commission_withdrawal',
            'agent_commission_used_for_rent',
            'tenant_default_charge'
          ) AND direction IN ('debit', 'cash_out') THEN -amount
          ELSE 0
        END
      ), 0) AS raw_commission_balance
    FROM general_ledger
    WHERE user_id = p_agent_id AND ledger_scope = 'wallet'
  )
  SELECT
    total_balance - GREATEST(0, raw_commission_balance) AS float_balance,
    GREATEST(0, raw_commission_balance) AS commission_balance
  FROM totals;
$$;
```

## No Frontend Changes
`useAgentBalances.ts` already reads `float_balance` and `commission_balance` from this RPC — no code changes needed.

## Files Changed
- 1 new migration file only

