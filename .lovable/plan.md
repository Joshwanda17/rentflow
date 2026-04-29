## What's actually happening

The Confirm button **does** fire — the click reaches `handleAllocate` and the RPC `agent_allocate_tenant_payment` is called. The problem is the RPC silently rejects the allocation, and the toast disappears too fast to read.

Two distinct float sources are in play:

| Source | Value (LOLEM) | Used by |
|---|---|---|
| `agent_landlord_float.balance` table | **UGX 1,734,000** | UI — `useAgentLandlordFloat` hook |
| `general_ledger` (wallet ledger − locked commission) | **UGX 1,329,260** | RPC float check |

When the agent enters an amount that the UI accepts but the RPC's stricter ledger view rejects, the RPC returns `{ success: false, error: "Float allocation blocked — would require commission funds…" }`. The 4-second toast vanishes; the dialog closes back to the form; the user reads it as "button broken".

For ATUHAIRE CAROLYNE (the user reporting) it's worse: she has **no row** in `agent_landlord_float`, so the UI shows `floatBalance = 0` and the Review button is permanently disabled — she can't even reach the Confirm step.

## Fix (3 changes, all in one pass)

### 1. Make the UI use the SAME float definition as the RPC (single source of truth)

Add a new RPC `get_agent_float_balance(p_agent_id uuid)` that returns `max(0, ledger_wallet_total − locked_commission)` — the exact formula the allocation RPC enforces. Switch `useAgentLandlordFloat` to call it. End of UI/RPC mismatch.

### 2. Surface RPC errors instead of silently dismissing them

In `AgentTenantCollectDialog.handleAllocate`, when the RPC returns `{ success: false }`:
- Stay in the confirming view (don't bounce back to the form)
- Show the error inline in red inside the dialog above the Confirm button
- Keep the toast as a secondary signal
- This converts "button doesn't work" into a clear "Float low — reduce to UGX X"

### 3. Backfill `agent_landlord_float` rows for active agents

One-time migration: insert a row for every agent who has wallet ledger activity but no `agent_landlord_float` row, so Caro and others can use the dialog at all. Going forward the row should be created on first ledger float credit (already handled by other flows — only the historical gap needs patching).

## Files

- **Migration**: new RPC `get_agent_float_balance` + backfill insert.
- **Edited**: `src/hooks/useAgentLandlordFloat.ts` → call new RPC instead of reading the table.
- **Edited**: `src/components/agent/AgentTenantCollectDialog.tsx` → show inline error in confirming view; do not auto-close on RPC rejection.

No edge function changes. No ledger schema changes. RPC `agent_allocate_tenant_payment` is unchanged — it remains the authoritative gatekeeper.

## Verification after deploy

- LOLEM and Caro both see a float number that matches what the RPC will accept.
- Trying to over-allocate now shows a red inline error inside the dialog rather than a flashing toast.
- A successful 10K allocation creates a `TPAY-` row in `agent_collections` and the dialog moves to the success view.
