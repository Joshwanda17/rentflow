

## Plan: Agent-Facilitated AngelPool Investment Module

### Overview
Build a complete agent-facilitated AngelPool investment flow: agent selects investor, verifies wallet balance, transfers funds to AngelPool, allocates shares, and earns 1% commission.

### 1. Database Migration
Add three nullable columns to `angel_pool_investments`:
- `agent_id` (UUID, references auth.users)
- `payment_method` (TEXT — cash/momo/bank)
- `investment_reference` (TEXT — external payment reference)

### 2. Edge Function: `agent-angel-pool-invest/index.ts`
Modeled on existing `angel-pool-invest` but with agent-facilitated logic:
- Accepts: `investor_id`, `amount`, `payment_method`, `investment_reference`
- Validates caller is an agent (query `user_roles`)
- Validates investor exists and has sufficient wallet balance
- Calculates shares (`amount / 20,000`), pool %, company %
- Inserts `cash_out` ledger entry on **investor's** wallet (category: `angel_pool_investment`)
- Inserts `angel_pool_investments` record with `agent_id` set
- Inserts `cash_in` ledger entry on **agent's** wallet (category: `angel_pool_commission`, 1%)
- Inserts matching `cash_out` platform debit (category: `marketing_expense`)
- Logs system event via `logSystemEvent`
- Returns share details, reference ID, commission amount

### 3. New UI: `AgentAngelPoolInvestDialog.tsx`
Multi-step dialog following `AgentInvestForPartnerDialog` patterns:
- **Step 1**: Search investor by phone/name (reuse existing user search)
- **Step 2**: Show investor wallet balance, enter amount, select payment method (cash/momo/bank), optional reference
- **Step 3**: Preview — shares to allocate, pool %, company %, 1% commission breakdown
- **Step 4**: Confirmation dialog then success state with reference ID and WhatsApp share

### 4. Agent Menu Integration (`AgentMenuDrawer.tsx`)
- Add `onAngelPoolInvest` prop
- Add menu item: icon `PiggyBank`, label "Angel Pool Investment", description "Invest in equity pool", badge "Angel", accent emerald

### 5. Commission History (`ProxyInvestmentHistorySheet.tsx`)
- Add `angel_pool_commission` to the `.in('category', [...])` filter
- Display with appropriate label "Angel Pool Commission"

### 6. Agent Dashboard Page
- Wire the new `onAngelPoolInvest` callback to open `AgentAngelPoolInvestDialog`
- Import and render the dialog component

### Files to Create/Modify

| File | Action |
|------|--------|
| DB migration | Add `agent_id`, `payment_method`, `investment_reference` columns |
| `supabase/functions/agent-angel-pool-invest/index.ts` | Create |
| `src/components/agent/AgentAngelPoolInvestDialog.tsx` | Create |
| `src/components/agent/AgentMenuDrawer.tsx` | Add menu item + prop |
| `src/components/agent/ProxyInvestmentHistorySheet.tsx` | Add commission category |
| Agent dashboard page (parent) | Wire dialog state |

### Commission Flow
```text
Agent invests 1,000,000 for investor
  → Investor wallet: -1,000,000 (cash_out, angel_pool_investment)
  → Angel Pool: +50 shares allocated
  → Agent wallet: +10,000 (cash_in, angel_pool_commission)
  → Platform ledger: -10,000 (cash_out, marketing_expense)
```

