
**Goal:** Credit agent **Joshua Wanda** with **UGX 5,000** of operations float for testing.

**Agent ID:** `cb798acb-68bc-4b4e-a414-a3d374e030b6` (confirmed in prior message).

**Approach — use the proper ledger flow (not a direct wallet edit):**

Per memory rules:
- `wallets.balance` is a UI cache, never edit directly.
- All money movement must go through `create_ledger_transaction` with double-entry balanced legs.
- Float must be tagged so it's recognized as Operations Float (not commission).

**Plan:**
1. Identify a CFO/Welile Finance source user with sufficient balance to act as the `cash_out` leg (mirrors what `assign-agent-float` edge function does in production).
2. Call the `create_ledger_transaction` RPC via the insert tool with two balanced entries:
   - **Leg 1:** `user_id = <CFO source>`, `direction = cash_out`, `category = agent_float_assignment`, `amount = 5000`, `ledger_scope = wallet`.
   - **Leg 2:** `user_id = Joshua`, `direction = cash_in`, `category = agent_float_assignment`, `amount = 5000`, `ledger_scope = wallet`, metadata `{ source: "Welile Finance", assigned_by: "<cfo>", test: true }`.
3. The ledger trigger auto-syncs `wallets.balance` for both parties.
4. Verify Joshua's float compartment increased by 5,000 via a read query.

**Why this is safe:**
- Uses the allowlisted `agent_float_assignment` category (production-grade).
- Balanced double-entry — `SUM(cash_in) == SUM(cash_out)` preserved.
- No direct wallet writes; financial integrity intact.
- Float tag means it's non-withdrawable (per agent wallet segmentation rule), only usable for tenant payments — exactly what 5,000 UGX is meant to test.

**Files touched:** None — RPC call via insert tool only.

**One quick confirm needed:**
- Which user should be the **source** for the `cash_out` leg? Options:
  1. Auto-pick any user with `cfo` role that has ≥5,000 balance (default).
  2. You specify a user.

Reply "go" for option 1, or name a user.
