

# Agent Wallet Segmentation: Float vs Commission

## Overview
Split the single agent wallet into two logical balances — **Float** (operational capital for rent payments) and **Commission** (earned income from commissions/bonuses). Balances are derived from the ledger, not stored as separate columns. The system enforces that rent payments MUST use Float only, with a 72-hour grace period exception for Commission usage.

## Current State
- Agents have a single `wallets.balance` derived by the `sync_wallet_from_ledger` trigger
- Ledger categories already partially distinguish: `agent_commission` (cash_in), `agent_bonus` (cash_in), `rent_payment_for_tenant` (cash_out), `tenant_default_charge` (cash_out)
- No concept of Float vs Commission in the ledger categories
- `agent-deposit` edge function checks total wallet balance, not Float balance
- `auto-charge-wallets` deducts from the single balance after 72h grace

## Architecture Decision
**Ledger-derived balances** (no new table columns). Introduce new ledger categories and compute balances via aggregation:

```text
float_balance = SUM(cash_in WHERE category IN float_categories)
              - SUM(cash_out WHERE category IN float_categories)

commission_balance = SUM(cash_in WHERE category IN commission_categories)
                   - SUM(cash_out WHERE category IN commission_categories)
```

### New Ledger Categories
| Category | Direction | Scope |
|---|---|---|
| `agent_float_deposit` | cash_in | Float inflow |
| `agent_float_used_for_rent` | cash_out | Float used for tenant rent |
| `agent_commission_earned` | cash_in | Commission earned (replaces `agent_commission` cash_in) |
| `agent_commission_withdrawal` | cash_out | Commission withdrawn |
| `agent_commission_used_for_rent` | cash_out | Grace period exception |

### Category Mapping (existing → new)
- `rent_payment_for_tenant` → `agent_float_used_for_rent` (in `agent-deposit`)
- `agent_commission` (cash_in) → `agent_commission_earned` (in `credit_agent_rent_commission` RPC)
- `agent_bonus` (cash_in) → `agent_commission_earned` (bonuses are commission)
- `tenant_default_charge` → `agent_commission_used_for_rent` (after 72h grace)
- `wallet_deposit` (agent cash deposits) → `agent_float_deposit`

---

## Phase 1: Database — Helper function + migration

### File: New migration SQL
1. Create a `get_agent_split_balances(p_agent_id UUID)` SECURITY DEFINER function:
   - Queries `general_ledger` for the agent's user_id
   - Groups categories into float vs commission
   - Returns `float_balance NUMERIC, commission_balance NUMERIC`
2. No schema changes to `general_ledger` — we just use new category strings

---

## Phase 2: Backend — Edge function updates

### File: `supabase/functions/agent-deposit/index.ts`
- Replace the single `wallets.balance` check (line 226-238) with a call to `get_agent_split_balances`
- Check `float_balance >= amount` instead of total balance
- Error message: "Insufficient Float Balance" instead of "Insufficient wallet balance"
- Change ledger category from `rent_payment_for_tenant` → `agent_float_used_for_rent`

### File: `supabase/functions/auto-charge-wallets/index.ts`
- In the 72h grace fallback (line 650+), check commission balance specifically
- Change category from `tenant_default_charge` → `agent_commission_used_for_rent`
- Add `used_commission_for_rent: true` to the description/metadata

### File: `supabase/functions/agent-deposit/index.ts` (deposit type)
- Accept a new `deposit_type` field: `'float'` (default) or `'rent_repayment'`
- Float deposits use category `agent_float_deposit`
- Rent repayment deposits bypass wallet entirely (reduce tenant receivable + recognize revenue)

---

## Phase 3: Frontend — UI changes

### File: `src/hooks/useAgentBalances.ts` (NEW)
- New hook that calls `get_agent_split_balances` RPC
- Returns `{ floatBalance, commissionBalance, totalBalance, loading }`
- Caches results and subscribes to realtime wallet updates

### File: `src/components/agent/AgentWalletHeroCard.tsx`
- Replace single "Available Balance" with two rows:
  - **FLOAT BALANCE** — UGX X (primary, larger)
  - **COMMISSION EARNED** — UGX X (secondary)
- Update the 3-column stats grid: replace "Wallet" cell with "Commission"
- Props change: `floatBalance` and `commissionBalance` instead of `walletBalance`

### File: `src/components/dashboards/AgentDashboard.tsx`
- Use the new `useAgentBalances` hook
- Pass `floatBalance` and `commissionBalance` to `AgentWalletHeroCard`

### File: `src/components/agent/AgentDepositDialog.tsx`
- Add "Deposit Type" radio selector at the top: Float (default), Rent Repayment
- Pass `deposit_type` in the edge function call body
- Adjust result display based on deposit type

### File: `src/components/agent/AgentFloatBalanceCard.tsx`
- Update to use the new split balances from `useAgentBalances` instead of computing from `agent_float_funding`

---

## Phase 4: CFO Dashboard visibility

### File: `src/hooks/useFinancialStatements.ts`
- Add new categories to the expense/revenue mappings so float and commission entries appear correctly in P&L

### File: CFO Overview (existing)
- Add "Total Agent Float" and "Total Agent Commission" metrics (future enhancement, not in this phase)

---

## Scope & Ordering
This is a large change. Recommended implementation order:
1. **Migration** — `get_agent_split_balances` function + category constants
2. **`useAgentBalances` hook** — frontend data layer
3. **`AgentWalletHeroCard` UI** — split display
4. **`agent-deposit` edge function** — Float-only enforcement + deposit type
5. **`auto-charge-wallets`** — commission grace period labeling
6. **`AgentDepositDialog`** — deposit type selector
7. **Financial statements** — category mapping updates

### Files changed (7-9 files)
1. New migration SQL
2. `src/hooks/useAgentBalances.ts` (NEW)
3. `src/components/agent/AgentWalletHeroCard.tsx`
4. `src/components/dashboards/AgentDashboard.tsx`
5. `supabase/functions/agent-deposit/index.ts`
6. `supabase/functions/auto-charge-wallets/index.ts`
7. `src/components/agent/AgentDepositDialog.tsx`
8. `src/components/agent/AgentFloatBalanceCard.tsx`
9. `src/hooks/useFinancialStatements.ts`

