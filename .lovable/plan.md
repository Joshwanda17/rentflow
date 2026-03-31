# Bug: Triple Agent Commission on Tenant Deposits

## Root Cause

There are **three separate commission credit paths** firing for a single agent deposit:

### Path 1 — Trigger on `repayments` table

The `on_repayment_agent_commission` trigger fires `credit_agent_repayment_commission()` every time a row is inserted into `repayments`. This trigger directly credits the agent wallet, inserts into `agent_earnings`, and posts a ledger entry. It has **no idempotency guard**.

### Path 2 — Explicit RPC call in edge function

`agent-deposit/index.ts` line 252 explicitly calls `credit_agent_rent_commission` RPC, which also credits the agent wallet (via ledger trigger), inserts into `agent_earnings`, and posts a ledger entry. This RPC **does** have an idempotency guard but uses a different `source_id` than the trigger.

### Path 3 — `record_rent_request_repayment` RPC inserts a second `repayments` row

`agent-deposit/index.ts` line 282 inserts a `repayments` row directly, then line 292 calls `record_rent_request_repayment` which inserts **another** `repayments` row (line 164 of the RPC). Each insert fires the trigger from Path 1.

### Result: 3x commission

```text
Agent deposits UGX 100,000 for tenant
  ├─ [1] Edge function inserts repayments row (line 282)
  │     └─ TRIGGER fires → credit_agent_repayment_commission() → +5,000
  ├─ [2] Edge function calls credit_agent_rent_commission RPC (line 252)
  │     └─ RPC credits wallet via ledger trigger → +5,000
  └─ [3] Edge function calls record_rent_request_repayment RPC (line 292)
        └─ RPC inserts ANOTHER repayments row (RPC line 164)
              └─ TRIGGER fires AGAIN → credit_agent_repayment_commission() → +5,000
                                                            TOTAL: 15,000 (3x)
```

## Fix Plan

### Step 1: Drop the `on_repayment_agent_commission` trigger

This trigger is **redundant** — the `credit_agent_rent_commission` RPC is the designated single-writer for commissions (per system architecture). The trigger has no idempotency guard and fires on every `repayments` insert, including duplicates.

**Migration SQL:**

```sql
DROP TRIGGER IF EXISTS on_repayment_agent_commission ON repayments;
DROP FUNCTION IF EXISTS credit_agent_repayment_commission();
```

### Step 2: Remove the duplicate `repayments` insert from `agent-deposit/index.ts`

Lines 282–289 insert a `repayments` row, then lines 292–295 call `record_rent_request_repayment` which inserts another one. Remove the direct insert (lines 282–289) and keep only the RPC call, which also handles `amount_repaid` updates and landlord balance reduction.

### Step 3: Remove the duplicate notification from `agent-deposit/index.ts`

Lines 307–315 insert a "Commission Earned" notification, but the `credit_agent_rent_commission` RPC already sends one. Remove the edge function notification to prevent duplicate alerts.

### Files to change

- **New migration** — drop `on_repayment_agent_commission` trigger and `credit_agent_repayment_commission` function
- `**supabase/functions/agent-deposit/index.ts**` — remove duplicate `repayments` insert (lines 282–289) and duplicate commission notification (lines 307–315)
- SO THE FINAL REWARD IS 10000 ONLY.