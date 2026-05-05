# Fix agent rent-collection commission gaps

## Root cause (confirmed against last 30 days of `general_ledger`)

`supabase/functions/agent-deposit/index.ts` only calls
`credit_agent_rent_commission` when an **active** `rent_requests` row exists
for the tenant in status `approved | funded | disbursed | repaying`. Every
other collection — including ones with a real tenant and a real cash payment
— silently skips the 10% commission credit, even though the agent's float
is already debited.

Audit (last 30 days):
- **33 collections, UGX 190,890 in commission**, never paid to 3 agents
  via the `agent-deposit` (`wallet_deposits`) path.
- 1 collection via `wallets` path (UGX 28,100) similarly skipped.
- The `agent_collections` RPC path is healthy (only ~190 UGX of pure
  rounding drift across 111 collections).

## Step 1 — Pay the back-owed commissions

For every transaction_group_id flagged by the audit query, post a balanced
admin-correction pair via `create_ledger_transaction`:

```text
Wallet leg :  agent_id, +amount*10%, cash_in,  category='agent_commission_earned', classification='production'
Platform   :  agent_id, +amount*10%, cash_out, category='agent_commission_payable', classification='production'
```

Idempotency key: `comm-backfill-<transaction_group_id>` so a retry is safe.

Audit log (per agent batch):
- `action_type='agent_commission_backfill'`
- `table_name='general_ledger'`
- `record_id=<agent_id>`
- `metadata.reason='Backfill missing 10% commission on agent-deposit Path B
   collections — root cause: no active rent_request at collection time'`

Total to pay out:
- Akampurira Onesmus (`e3cf4d3a…`): **UGX 168,490**
- `e4f07815…`: **UGX 8,400**
- `04ef6aad…`: **UGX 4,300**
- `wallets`-path agent: **UGX 28,100**
- **Total: UGX 209,290**

## Step 2 — Fix `agent-deposit/index.ts` so this stops bleeding

Two changes in the edge function:

**2a. Pay commission in Path B too.** When the function falls into the
`repaymentAmount === 0` branch but the agent did pay UGX X "for tenant",
the agent has performed a rent-collection action and should still earn
commission. Call `credit_agent_rent_commission` with `p_rent_request_id =
NULL` (or extend the RPC to accept a NULL rent_request_id and just credit
the originating agent at 10%). Easiest: add a sibling RPC
`credit_agent_collection_commission(p_agent_id, p_amount, p_event_ref)` that
only credits the originating agent at 10%, no sub-agent split logic. Use it
in Path B.

**2b. Widen Path A's commission base.** In Path A, the agent's float is
debited for `amount`, not `repaymentAmount`. If `depositAmount > 0` (i.e.
collection exceeded the tenant's outstanding rent), pay commission on the
overflow as well using the same Path B credit RPC. This keeps the rule
simple: **every shilling the agent moves out of float earns 10%**.

## Step 3 — Lightweight monitoring

Add a daily cron `cron-backfill-missing-agent-commission` that runs the
same audit query for the last 24h and writes any gaps it finds into a new
`commission_backfill_queue` table (status `pending`), and emits a
`agent.commission.gap_detected` system event so CFO/Finance Ops sees it
in the daily digest. This guarantees we never silently lose another
shilling even if a future regression slips through.

## Out of scope for this turn

- The 21 `withdrawal_requests` rows (proxy payouts) correctly do not earn
  rent commission — they are agent-mediated cash-out, not rent collection.
- The ~190 UGX rounding drift on `agent_collections` is below noise floor;
  no action.
