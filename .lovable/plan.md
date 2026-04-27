# Auto-Freeze Phantom Wallet Surplus

## Goal

Whenever `wallets.balance` exceeds the ledger truth (sum of credits − debits in `general_ledger`), the database itself locks the unbacked surplus into `wallets.locked_balance` and writes an audit record. No edge function, no cron, no human action required — the trigger fires inline on every wallet write.

Plus a one-shot reconciliation that locks the existing **UGX 36,500,000** phantom drift on LUKODDA JOSEPH (and any other current offenders) the instant the migration runs.

## How it works

```text
wallet UPDATE/INSERT
        │
        ▼
trigger: auto_freeze_phantom_surplus  (BEFORE row write)
        │
        ├── compute ledger_total = SUM(cash_in) − SUM(cash_out) for user_id
        ├── compute spendable    = NEW.balance − NEW.locked_balance
        │
        ├── IF spendable > ledger_total:
        │       surplus = spendable − ledger_total
        │       NEW.locked_balance := NEW.locked_balance + surplus
        │       INSERT INTO phantom_freeze_audit (...)
        │
        └── (sync_authorized bypass already handled by existing
             enforce_wallet_ledger_only trigger — no conflict)
```

## Components

### 1. New audit table: `phantom_freeze_audit`

Records every automatic freeze for the CFO Reconciliation Center.

| column | purpose |
|---|---|
| `id` | uuid PK |
| `user_id` | whose wallet was frozen |
| `wallet_id` | wallet row affected |
| `surplus_locked` | numeric — amount auto-locked |
| `wallet_balance_before` | numeric snapshot |
| `ledger_total_at_freeze` | numeric snapshot |
| `previous_locked_balance` | numeric snapshot |
| `new_locked_balance` | numeric snapshot |
| `trigger_reason` | text — e.g. `auto_phantom_freeze` / `initial_reconciliation` |
| `frozen_at` | timestamptz default now() |

RLS: only CFO + service role can SELECT.

### 2. Trigger function: `public.auto_freeze_phantom_surplus()`

- `BEFORE INSERT OR UPDATE OF balance, locked_balance ON public.wallets`
- Skips when `current_setting('wallet.sync_authorized', true) = 'true'` and the write originates from `apply_wallet_movement` (so legitimate ledger-driven writes never self-trigger a freeze loop).
- Reads `general_ledger` total for the user (single aggregate query, indexed on `user_id`).
- If `spendable > ledger_total`, mutates `NEW.locked_balance` in place and writes the audit row.
- Idempotent: re-running on an already-locked wallet is a no-op.

### 3. One-shot reconciliation block (runs inside the migration)

```text
FOR each wallet WHERE (balance − locked_balance) > ledger_total:
    lock the surplus
    insert phantom_freeze_audit row with reason = 'initial_reconciliation'
```

Expected immediate effect:
- **LUKODDA JOSEPH** — locks UGX 36,500,000.
- Any other phantom-drift wallet surfaced by `phantom_wallet_drift` is locked the same way.

### 4. CFO surface (no UI change required now)

The existing CFO Reconciliation Center already reads `phantom_wallet_drift`. It will additionally see `phantom_freeze_audit` rows via the existing realtime channel — no frontend work needed in this step. (A dedicated "Phantom Freeze History" panel can come later if you want it.)

## Guarantees

- ✅ Money can never become spendable beyond what the ledger proves the user owns.
- ✅ Works for every write path: edge functions, RPCs, manual SQL, future code — the DB enforces it.
- ✅ Reversal is CFO-only via the existing `release-locked-funds` flow with full audit trail.
- ✅ No effect on bucket-misallocation cases (e.g. Carolyne) — her `balance` matches her ledger; she has zero surplus, so nothing is frozen. Her float→withdrawable unwind remains a separate fix.
- ✅ Compatible with `enforce_wallet_ledger_only` — runs `BEFORE` it and only adjusts `locked_balance`, which is permitted.

## Out of scope (separate follow-ups)

- Float → Withdrawable release tool for Carolyne and other proxy agents.
- "Short drift" reconciliation (wallet < ledger) — these users are owed money, not phantom; needs a different remediation path.
