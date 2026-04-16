

# Hardening Agent Wallet: Settlement Proof, Float Aging & Risk Dashboard

## What You Identified (4 Gaps)

1. **No settlement proof** — agent says "I delivered" with no verification trail
2. **Float sits idle** — no aging/alerting when float isn't settled
3. **Commission gaming** — agent withdraws commission then disappears with float
4. **No finance visibility** — "how much cash is in the field?" has no answer

## Current State

- `AgentDeliveryConfirmation` exists with GPS + photos + notes — but it writes to `agent_delivery_confirmations` only. **No ledger settlement entry** is created, so float balance never decreases after delivery.
- `wallet-transfer` uses generic `wallet_transfer` category — no distinction between "float assignment to agent" vs regular transfer.
- No `agent_float_assignment` or `agent_float_settlement` categories exist yet.
- No float aging tracking (no `assigned_at` concept).
- The `get_agent_split_balances` RPC treats everything that isn't commission as float (residual calculation).

## Plan

### 1. New Ledger Categories
Add `agent_float_assignment` and `agent_float_settlement` to:
- `LOCKED_CATEGORIES` in `ledgerConstants.ts`
- `validate_ledger_category` DB function (migration)

### 2. Tag Float Assignments Properly
When a manager sends money to an agent for landlord payment (via `AgentFloatManager` → `wallet-transfer`), the description already says "Float transfer to agent". But the category is `wallet_transfer`.

**Change**: Create a new edge function `assign-agent-float` (or modify `wallet-transfer` to accept a `purpose` field). When purpose = `landlord_delivery`, use category `agent_float_assignment` instead of `wallet_transfer`. This makes float trackable.

**Simpler approach**: Update `AgentFloatManager.tsx` to call a dedicated `assign-agent-float` edge function that uses `agent_float_assignment` category and records `assigned_at` in metadata.

### 3. Settlement on Delivery Confirmation
When `AgentDeliveryConfirmation` submits, **also create a ledger entry**:
- Agent: `cash_out` / `agent_float_settlement` (reduces float)
- Platform: `cash_in` / `agent_float_settlement` (records settlement)

This closes the loop: float assigned → float settled = outstanding float decreases.

### 4. Float Aging Query & UI (Finance Dashboard)
Create an RPC `get_outstanding_agent_float` that returns per-agent:
- `total_assigned` (sum of `agent_float_assignment` cash_in)
- `total_settled` (sum of `agent_float_settlement` cash_out)
- `outstanding` (assigned - settled)
- `oldest_unsettled_at` (from metadata.assigned_at of earliest unmatched assignment)
- `age_hours` (hours since oldest unsettled)

Add a **"Field Cash Exposure"** card to the CFO dashboard showing:
- Total outstanding float across all agents
- Per-agent breakdown with aging indicators (green < 24h, yellow 24-72h, red > 72h)

### 5. Soft Commission Lock on High Outstanding Float
In `approve-withdrawal` edge function, add an **optional** check:
- If agent has outstanding float > configurable threshold (e.g., from `treasury_controls`), reduce withdrawable commission by a percentage or block entirely
- This is the "soft link" — not hard block, but risk reduction

### 6. Update `get_agent_split_balances` RPC
Add `agent_float_assignment` (cash_in) and `agent_float_settlement` (cash_out) to the float calculation so they're properly categorized.

### 7. Agent UX: "Complete Landlord Payment" Button
In `AgentWalletHeroCard`, replace or add alongside the current actions:
- **"Complete Landlord Payment"** button that shows: Assigned / Settled / Remaining
- Opens the delivery confirmation flow with mandatory proof

### 8. Memory Update
Save the float accountability model to memory.

## Files to Change

| File | Change |
|------|--------|
| `src/lib/ledgerConstants.ts` | Add `agent_float_assignment`, `agent_float_settlement` |
| **DB Migration** | Add categories to allowlist, create `get_outstanding_agent_float` RPC, update `get_agent_split_balances` |
| **New**: `supabase/functions/assign-agent-float/index.ts` | Dedicated float assignment with `assigned_at` metadata |
| `src/components/manager/AgentFloatManager.tsx` | Call `assign-agent-float` instead of `wallet-transfer` |
| `src/components/agent/AgentDeliveryConfirmation.tsx` | Add ledger settlement entry on confirmation |
| `src/components/agent/AgentWalletHeroCard.tsx` | Add "Complete Landlord Payment" with outstanding float display |
| `supabase/functions/approve-withdrawal/index.ts` | Add soft outstanding-float check |
| **New**: `src/components/cfo/FieldCashExposureCard.tsx` | CFO dashboard card for outstanding float visibility |

## Technical Detail

```text
Float Lifecycle:

  Manager sends 500k to agent
  ┌─────────────────────────────────┐
  │ category: agent_float_assignment│
  │ direction: cash_in (agent)      │
  │ metadata: { assigned_at: now }  │
  └─────────────────────────────────┘
         │
         ▼
  Agent delivers to landlord
  ┌─────────────────────────────────┐
  │ category: agent_float_settlement│
  │ direction: cash_out (agent)     │
  │ proof: GPS + photos + landlord  │
  └─────────────────────────────────┘
         │
         ▼
  Outstanding = assigned - settled
  If > 0 for > 72h → flagged
```

