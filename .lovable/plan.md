

## Plan: Change Agent Proxy Investment to Deduct from Agent's Wallet

### Current Behavior (Problem)
The `agent-invest-for-partner` edge function currently deducts funds from the **partner's (supporter's)** wallet. The user wants the **agent's own balance** to be deducted instead, with the investment credited to the partner's pool.

### Changes Required

#### 1. Edge Function: `supabase/functions/agent-invest-for-partner/index.ts`
- **Remove** the partner wallet balance check and deduction (lines 101-133)
- **Add** agent wallet balance check and deduction instead — fetch agent's wallet, verify sufficient balance, deduct with optimistic locking
- Update the ledger entry to reflect the agent funded the investment (direction: `cash_out` on agent, not partner)
- Keep the `decrement_rent_requested` RPC call (already working — reduces the Capital Opportunity card's "total rent demand")
- Keep agent 2% commission logic as-is
- Update notification messages to reflect the agent's balance was used
- Return the agent's new balance in the response

#### 2. Frontend: `src/components/agent/AgentInvestForPartnerDialog.tsx`
- **Remove** partner balance fetching/display — no longer relevant since agent pays
- **Add** agent wallet balance display so the agent sees their own available funds
- Validate amount against the agent's balance (not partner's)
- Show the agent's new balance after successful investment
- Keep partner selection (still needed to assign the investment to a partner)

### Summary of Money Flow After Change
```text
Agent Wallet  →  deduct amount  →  Partner's Rent Pool
                                →  Opportunity card "total rent demand" decremented
Agent Wallet  ←  2% commission  ←  Pool (already exists)
```

