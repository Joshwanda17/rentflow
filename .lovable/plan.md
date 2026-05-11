## Investigation: Why agents don't receive commission and float

I traced the agent commission/float flow end-to-end against live data. There are **three concrete defects**, in order of impact.

---

### 1. The auto-charge cron is DISABLED → no rent commission ever lands

Agent rent commission (10%) is paid by the database function `credit_agent_rent_commission`, which is **only called by the `auto-charge-wallets` edge function**. That edge function is invoked by the pg_cron job `auto-charge-wallets-daily` (`0 6 * * *`).

Live state in `cron.job`:

```
auto-charge-wallets-daily        active = false
daily-credit-charges             active = false
retry-no-smartphone-charges-3h   active = false
```

Symptom in `subscription_charges`:

```
status=active   count=6   next_charge_date stuck at 2026-04-16   (today = 2026-05-11)
```

Six active rent subscriptions have been waiting **~25 days** for a daily charge that never ran. Confirming with the ledger:

```
agent_commission cash_in (wallet scope) since 2026-04-01:  2 rows, total 3,000 UGX
```

That is the entire rent-commission pipeline producing essentially zero output across the platform.

**Fix:** re-enable the three cron jobs (`auto-charge-wallets-daily`, `daily-credit-charges`, `retry-no-smartphone-charges-3h`) and run `auto-charge-wallets` once manually to drain the 25-day backlog. Add a CFO/CTO health check that flags any cron job whose `active=false` OR whose last successful run is older than 24h.

---

### 2. Pending withdrawals zero out displayed commission

Example agent `e3cf4d3a-d021-49e4-b815-7e1938166eeb` (top earner):

| Bucket | wallets cache | strict view |
|---|---|---|
| withdrawable | 0 | 0 |
| float | 200,000 | 200,000 |

Since the 2026-05-07 fresh-start anchor:

```
agent_commission_earned  +65,000  (12 events, 10% of float allocations, OK)
agent_float_deposit     +850,000
rent_payment_for_tenant -650,000
... net float = 200,000   ✓
... net withdrawable = 65,000
```

But there is a **pending withdrawal** of exactly 65,000 UGX (`withdrawal_requests.status='pending'` since 2026-05-11 10:31). The strict view subtracts pending holds → withdrawable = 0.

So the agent thinks "I earned commission and it disappeared", when it is actually correctly held against an in-flight withdrawal. The UI does not currently surface "X UGX held against your pending withdrawal".

**Fix:** in `AgentFloatBalanceCard` / `FullScreenWalletSheet`, show pending withdrawal hold as a separate dashed line under withdrawable (we already fetch `pending_holds` in `v_user_wallet_strict`). No ledger change.

---

### 3. `credit_agent_rent_commission` writes raw INSERTs, bypassing the routing system

The function inserts directly into `general_ledger` instead of calling `create_ledger_transaction`. Two consequences:

- Entries carry no `recipient_type`, so the wallet-routing v2 contract (memory: `wallet-routing-v2`) is bypassed. Today routing still lands on `withdrawable` because the categories `agent_commission` / `marketing_expense` fall through to defaults — but it is fragile and inconsistent with `agent_allocate_tenant_payment`, which DOES use `create_ledger_transaction` with `recipient_type`.
- It uses `category='agent_commission'` while the float-allocation path uses `category='agent_commission_earned'`. The dashboard hook `useAgentBalances` already sums both, but other tools (commission reports, exports) only look for one or the other → silent under-counting.

**Fix:** rewrite `credit_agent_rent_commission` to use `create_ledger_transaction` with explicit `recipient_type='user'` for wallet legs and standardize on `category='agent_commission_earned'` (with a one-time backfill query that re-categorizes existing `agent_commission` rows for reporting consistency — no money moves).

---

### Out of scope of this investigation (verified working)

- `agent_allocate_tenant_payment` correctly posts the 10% commission to `withdrawable` for agents who pay landlords from float — math matched the ledger sample.
- Float math for the sampled agent is correct (deposits − payouts = cached float).
- `wallet_route_for_category(uuid, category, direction)` agent-aware override is functioning.
- Tenant-placement bounty trigger fires correctly.

---

### Technical change set (to be implemented after approval)

1. **Re-enable cron jobs** via migration:
   ```sql
   UPDATE cron.job SET active = true
    WHERE jobname IN ('auto-charge-wallets-daily','daily-credit-charges','retry-no-smartphone-charges-3h');
   ```
   Then call `auto-charge-wallets` once to flush the 25-day backlog.

2. **CFO health panel**: new RPC `cron_jobs_health()` returning each job's `active`, last-run, last-status; surface in CFO Reconcile tab with a red banner if any agent-impacting job is `active=false` or stale > 24h.

3. **UI: surface pending withdrawal hold** in `AgentFloatBalanceCard` and `FullScreenWalletSheet` (read `pending_holds` from existing `get_user_wallet_view` payload — no new endpoint).

4. **Refactor `credit_agent_rent_commission`** to call `create_ledger_transaction` with `recipient_type='user'` and standardize on `agent_commission_earned`. Include a non-monetary reporting backfill of existing `agent_commission` rows (relabel category, no amount change).

5. **Memory update**: add `mem://features/agent/commission-pipeline.md` documenting that auto-charge cron is the sole producer of rent commission, so any cron outage = silent commission stoppage.
