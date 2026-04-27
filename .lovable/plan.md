# Best way to prevent duplicate withdrawals

## What's already in place (audited)

1. **Client idempotency key** in `WithdrawRequestDialog.tsx` — `client_request_id` UUID reused across retries; DB has a unique partial index `(user_id, client_request_id)`.
2. **In-session recipient guard** — `sessionStorage` map blocks/warns when the same user re-submits to the same recipient within 10 minutes.
3. **DB trigger `prevent_duplicate_pending_withdrawal`** (deployed today) — blocks a second `pending` row with the same recipient + amount in the last 10 min, raising `DUPLICATE_PENDING_WITHDRAWAL` (SQLSTATE `23505`).
4. **Operator-side grouping** in `FinOpsWithdrawalVerification` — duplicates are stacked with a "Reject N older duplicates" bulk action.

## What's still leaking (evidence from the DB)

A query on `withdrawal_requests` shows recent runs of identical rows ~1.8 s apart from the same user → same MoMo number → same amount, all with `client_request_id = NULL`. That `NULL` proves they were **not** submitted via `WithdrawRequestDialog`. They came through other code paths that have none of the guards above:

| File | client_request_id | Re-entrant lock | Recipient session guard | Friendly DUPLICATE handling |
|---|---|---|---|---|
| `src/components/wallet/WithdrawRequestDialog.tsx` | ✅ | ✅ | ✅ | ✅ |
| `src/components/agent/AgentProxyWithdrawalDialog.tsx` | ✅ | ✅ | ❌ | ❌ |
| `src/components/payments/WithdrawFlow.tsx` | ❌ | ❌ | ❌ | ❌ |
| `src/components/supporter/InvestmentWithdrawButton.tsx` | (to verify) | (to verify) | ❌ | ❌ |

So the trigger is the only thing protecting these paths today, and even when it fires the user sees a raw Postgres error instead of a clean message — which encourages them to tap again.

## Plan — five changes, ordered by impact

### 1. Harden `WithdrawFlow.tsx` (highest impact)
- Add `isSubmittingRef` re-entrant lock around `processWithdrawal`.
- Generate and send `client_request_id` on the insert (same UUID across retries).
- Catch `error.code === '23505'`: if message contains `DUPLICATE_PENDING_WITHDRAWAL`, show the friendly "You already have a pending withdrawal of UGX X to this recipient — wait for operations to approve or reject it" toast and route the user to their pending list instead of throwing.
- Disable the Confirm/Pay button while `loading` and for 1.5 s after a successful submission to absorb double-taps from low-end devices.

### 2. Harden `AgentProxyWithdrawalDialog.tsx`
- Same `DUPLICATE_PENDING_WITHDRAWAL` friendly-error handling on the catch path.
- Add per-partner session guard: key on `proxy:<funderId>:<amount>` so an agent can't fire the same partner withdrawal twice within 10 minutes.

### 3. Audit and patch `InvestmentWithdrawButton.tsx`
- Read it; if it inserts directly into `withdrawal_requests`, apply the same three guards (re-entrant lock + `client_request_id` + friendly 23505 handling).

### 4. Tighten the DB trigger
Two small but important changes to `prevent_duplicate_pending_withdrawal`:

- **Cover proxy-partner withdrawals**: also block when `proxy_partner_id` matches and `payout_method` is null (this is the agent-proxy pattern — it currently slips through every branch of the trigger).
- **Block on later operator stages too**: the trigger currently only checks `status = 'pending'`. Add `manager_approved` to the comparison so a user can't queue a duplicate while operations is mid-approval on the original.

### 5. One-time cleanup of the historical spam
A migration that, for each `(user_id, payout_method, recipient, amount)` group with multiple `pending` rows older than 1 hour, keeps the **oldest** and marks the rest `rejected` with reason "System cleanup: duplicate of older pending request" and writes `audit_logs` rows so the trail is preserved. This clears the screenshot backlog (the 5× UGX 30,000 to `09165223393`, 5× UGX 22,500, etc.) without any human approving phantom payouts.

## Why this is the right shape

- **Defence in depth**: client lock (instant) → session guard (no network) → idempotency key (network retry) → DB trigger (cross-tab, cleared storage, multiple devices) → operator grouping (last-mile catch).
- **Single source of truth for the rule**: the trigger is the canonical guard; every client path just translates its error into a friendly message. New withdrawal entry points added later get protection automatically.
- **No false positives**: 10-minute window + recipient-aware comparison means legitimate "I really do want to send another UGX 30,000 to my supplier in an hour" still works.
- **Cleans up the mess we already have**, so Financial Ops stops seeing the duplicate stack you screenshotted.

## Files touched
- `src/components/payments/WithdrawFlow.tsx`
- `src/components/agent/AgentProxyWithdrawalDialog.tsx`
- `src/components/supporter/InvestmentWithdrawButton.tsx` (after read)
- New migration: tighten trigger + cleanup historical duplicates

## Out of scope
- Changing the 10-minute window (configurable later if Ops asks).
- Rate-limiting submissions per minute (the recipient+amount key is more precise and less annoying).
