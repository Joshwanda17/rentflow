

# Instant Portfolio Activation for Agent Field Investments

## Current Flow
1. Agent searches for an existing registered partner → selects them → enters amount
2. Edge function `agent-invest-for-partner` deducts from agent wallet, creates portfolio with **`pending_approval`** status
3. Partner credit + agent commission are queued in `pending_wallet_operations`
4. A manager/COO must approve before the portfolio becomes `active`

## What Changes

### 1. Allow inline partner registration during investment (Frontend)
**File: `src/components/agent/AgentInvestForPartnerDialog.tsx`**

When no partner is found in search, instead of just offering "Register Tenant Supporter Investment" (which opens a separate dialog), add an **inline quick-capture form** directly in the investment dialog:
- Fields: Full Name, Phone Number (pre-validated Uganda format)
- On submit: call the existing registration edge function to create the supporter account
- Auto-select the newly created partner and continue the investment flow seamlessly

### 2. Activate portfolio immediately (Backend)
**File: `supabase/functions/agent-invest-for-partner/index.ts`**

- Change portfolio status from `"pending_approval"` → `"active"` at creation time
- Credit the partner's wallet immediately via `general_ledger` (cash_in) instead of queuing in `pending_wallet_operations`
- Follow up with an immediate `cash_out` (category: `wallet_to_investment`) to move funds into the portfolio — maintaining the net-zero ledger pattern
- Still queue the agent's 2% commission in `pending_wallet_operations` (commission approval stays separate)
- Update notifications to say "activated" instead of "pending approval"

### 3. Update success screen messaging (Frontend)
**File: `src/components/agent/AgentInvestForPartnerDialog.tsx`**

- Remove the amber "pending manager approval" notice from the success screen
- Update text to confirm same-day activation: "Portfolio is now active"

### 4. Ensure agent can manage partner account
The existing proxy agent system (`is_managed_account` flag, proxy assignment) already supports this. The edge function already sets `agent_id` on the portfolio. No changes needed here — the agent's "My Funders" view already shows portfolios they facilitated.

## Technical Details

**Ledger sequence on immediate activation:**
```
1. cash_out (agent wallet) — already exists
2. cash_in  (partner wallet, category: supporter_facilitation_capital)  — NEW, direct ledger
3. cash_out (partner wallet, category: wallet_to_investment)            — NEW, direct ledger
```
This keeps the partner's liquid balance at zero while recording the full audit trail.

**Files modified:**
- `supabase/functions/agent-invest-for-partner/index.ts` — immediate activation + direct ledger entries
- `src/components/agent/AgentInvestForPartnerDialog.tsx` — inline partner capture + updated success messaging

