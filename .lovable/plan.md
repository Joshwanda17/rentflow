# Agent Float Management System — Bank-Based Float → Wallet Control → Payout

## Overview

Build a comprehensive Agent Float Management system that tracks bank-to-agent float transfers, links them to withdrawal payouts, and provides CFO reconciliation. The core loop: CFO sends bank float → system tracks it → Financial Ops approves withdrawals → agent executes payout (cash/bank) → float is deducted → CFO reconciles.

## What Already Exists

- **Tables**: `agent_float_funding` (basic — no bank ref), `agent_float_withdrawals` (landlord payouts), `agent_float_limits` (daily limits), `cashout_agents` (authorized agents), `withdrawal_requests` (with `assigned_cashout_agent_id`)
- **CFO UI**: CashoutAgentManager, CashoutAgentActivity, AgentCashReconciliation (collections vs deposits — not float-based)
- **Agent UI**: FloatTransactionHistory (sheet showing funding credits + withdrawal debits)

## What's Missing

1. No bank reference tracking on float transfers
2. No CFO "Send Float" form to record bank-to-agent transfers
3. No per-agent float balance view (total funded − total disbursed)
4. No float reconciliation (opening balance − withdrawals = expected closing)
5. Withdrawal completion doesn't formally deduct from agent float
6. No agent-side float balance summary card
7. No 1% commission auto-calculation on completed payouts

---

## Phase 1: Database Changes

### Migration 1 — Enhance `agent_float_funding`

```sql
ALTER TABLE agent_float_funding
  ADD COLUMN bank_reference TEXT,
  ADD COLUMN bank_name TEXT DEFAULT 'Equity Bank Uganda',
  ADD COLUMN status TEXT DEFAULT 'active' NOT NULL;
```

This adds bank transfer tracking (TID/reference) to every float transfer.

### Migration 2 — Create `agent_float_reconciliation` view (materialized or query)

No new table needed — we compute float balance from `agent_float_funding` (credits) minus completed `withdrawal_requests` assigned to each cashout agent.

---

## Phase 2: CFO Float Management Hub

### New component: `src/components/cfo/AgentFloatManagement.tsx`

A toggle-tab panel with 3 modules:

**Tab 1 — Float Transfers** (Send Float)

- Agent picker (from `cashout_agents`)
- Amount input, bank reference (mandatory), bank name, notes
- Inserts into `agent_float_funding` with `funded_by = CFO user ID`
- Creates ledger entry: `category: 'agent_float_transfer'`, `ledger_scope: 'bridge'`
- Shows history of all float transfers with bank references

**Tab 2 — Agent Float Balances**

- Per-agent card showing:
  - Total Float Sent (sum of `agent_float_funding`)
  - Total Disbursed (sum of completed `withdrawal_requests` where `assigned_cashout_agent_id = agent`)
  - Current Float Balance (sent − disbursed)
  - Commission Earned (1% of disbursed)
- Color-coded: green if balance > 20% of total, amber if < 20%, red if negative

**Tab 3 — Float Reconciliation**

- Date-range picker
- Per-agent reconciliation row:
  - Opening Float (balance before period)
  - Float Received (funding in period)
  - Withdrawals Executed (completed in period)
  - Expected Closing = Opening + Received − Executed
  - Variance flag if agent reports different
- Export CSV button

### Wire into CFO Dashboard

Add `case 'float-management':` in `src/pages/cfo/Dashboard.tsx` routing to the new component.

---

## Phase 3: Agent Float Dashboard Card

### Enhance agent dashboard float visibility

Update `src/components/agent/AgentDailyOpsCard.tsx` or create a new `AgentFloatBalanceCard.tsx`:

- Shows: Float Received (total), Float Disbursed (total), Available Float Balance
- Queries `agent_float_funding` (credits) and completed `withdrawal_requests` (debits)
- Links to existing `FloatTransactionHistory` sheet for full history

---

## Phase 4: Commission on Payout Completion

When a cashout agent completes a withdrawal (marks `withdrawal_requests.status = 'completed'`):

- Calculate 1% commission
- Insert ledger entries:
  - `Dr Commission Expense` (platform scope, cash_out)
  - `Cr Agent Wallet` (wallet scope, cash_in, category: `agent_commission`)
- This can be handled in the existing completion flow in `FloatPayoutVerification.tsx` or the cashout agent payout tab
- NO CHARGE ON USERS. THE 1% IS FROM THE PLATFORM 

---

## Files Changed


| File                                                       | Change                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **Migration**                                              | Add `bank_reference`, `bank_name`, `status` to `agent_float_funding` |
| `src/components/cfo/AgentFloatManagement.tsx`              | **NEW** — 3-tab float hub (Transfers, Balances, Reconciliation)      |
| `src/pages/cfo/Dashboard.tsx`                              | Add `float-management` case + import                                 |
| `src/components/agent/AgentFloatBalanceCard.tsx`           | **NEW** — Agent-side float balance summary                           |
| `src/components/financial-ops/FloatPayoutVerification.tsx` | Add 1% commission ledger entry on payout completion                  |


No edge functions needed — all operations use direct Supabase client queries with existing RLS.