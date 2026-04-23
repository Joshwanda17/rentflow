

# Edge functions that touch wallets — count and inventory

This is a **research answer, not a build task**. To give you a precise count I need to grep the `supabase/functions/` directory for any function that reads or writes `wallets`, `wallet_transactions`, or calls a wallet-mutating RPC (`create_ledger_transaction`, `apply_wallet_movement`, `wallet-transfer`, etc.).

## What I will do once you approve

1. Search `supabase/functions/**/*.ts` for these signals:
   - String `from('wallets')` / `from("wallets")`
   - String `from('wallet_transactions')`
   - RPC names: `create_ledger_transaction`, `apply_wallet_movement`, `sync_wallet_from_ledger`
   - Direct table mutations: `.update(`, `.insert(` on the matches above
   - Calls to the `wallet-transfer` function

2. Classify each hit into one of three buckets:
   - **WRITES wallet** (mutates `wallets` directly or via ledger RPC that fires the wallet triggers)
   - **READS wallet** (only SELECT — informational)
   - **TRIGGERS wallet indirectly** (inserts to `general_ledger` with `ledger_scope='wallet'`, which is what fires the two triggers we discussed)

3. Deliver a single table:

   ````text
   ┌─────────────────────────────────┬──────────┬────────────────────┐
   │ Edge function                   │ Mode     │ Categories used    │
   ├─────────────────────────────────┼──────────┼────────────────────┤
   │ wallet-transfer                 │ WRITE    │ wallet_transfer    │
   │ approve-deposit                 │ WRITE    │ wallet_deposit     │
   │ agent-deposit                   │ WRITE    │ ...                │
   │ ...                             │          │                    │
   └─────────────────────────────────┴──────────┴────────────────────┘
   Total: N functions touch wallets (X write, Y read-only, Z indirect)
   ````

4. Flag any function using a category **not** in the locked allowlist (`mem://constraints/technical/ledger-category-allowlist`) — those are the ones that silently fail or create drift.

## No code changes

This is pure investigation. Output is the inventory table + a short note on which functions are highest-risk for the trigger-conflict drift you're tracking.

Approve and I'll run the searches and return the count + table in the next reply.

