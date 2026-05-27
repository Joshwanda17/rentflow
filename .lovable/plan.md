## Goal

On the Recent Emails page, when Financial Ops reroutes an auto-credited deposit from one user to another, the system should be **able to take the money back** from the original recipient — even if they have already spent or withdrawn it. Today it stops with `NEGATIVE_WALLET_BLOCKED` because the wallet guard refuses to go negative.

The money still has to be recovered (Welile is out the cash and needs to credit the correct user). The cleanest accounting solution is: when the original wallet has no balance, the reversal becomes a **recoverable advance** — i.e. that user now owes Welile, and the next incoming deposit/commission automatically pays it back (this is exactly what `advance_balance` is built for).

## What changes

### 1. Edge function `cfo-direct-credit` — new `force_reversal` mode

Accept an optional flag `allow_overdraw: true` (only honoured when `operation === 'debit'` AND the caller has Financial Ops / CFO / Manager role).

When set:
- Compute the user's strict available balance.
- If `amount ≤ available` → behave exactly like today (clean debit, no debt).
- If `amount > available` →
  - Debit `available` from `withdrawable_balance` (could be 0).
  - Post the **shortfall** as an `agent_advance` row on the user, category `mis_routed_recovery`, with the email transaction ID as reference. This is a liability tracked exactly like other agent advances and is automatically clawed back from future incoming credits via the existing Debt Repayment Automation.
  - Skip the `NEGATIVE_WALLET_BLOCKED` guard for the shortfall portion only.
- Emit a `wallet.forced_recovery.created` system event with full context (operator, original user, new user, amount, email TID).
- Append a row to `wallet_overdraw_events` for CFO visibility.

If `allow_overdraw` is **not** set, behaviour is unchanged (still blocks).

### 2. `RouteEmailDepositDialog` — auto-promote to force mode

When the reversal step gets `NEGATIVE_WALLET_BLOCKED`, the dialog will:
- Stop the flow and show an inline amber confirmation panel:
  > "Sharima Nankambo has already spent this money (withdrawable = UGX 0). Reverse anyway and record UGX X,XXX as a recoverable advance against her wallet? Future incoming credits will automatically pay this back."
- Two buttons: **Cancel** / **Force reverse & route**.
- On confirm, retry the same reversal call with `allow_overdraw: true`, then continue with the credit to the new user.

A small badge ("forced reversal — advance recorded") is added to the routing-history row and the success toast so it's clear this wasn't a clean reversal.

### 3. Visibility

- Original user gets an SMS: "An auto-credit of UGX X has been reversed. Your wallet shows UGX X as a recoverable balance owed to Welile; it will be cleared automatically from your next incoming credit."
- CFO Reconcile tab already shows `wallet_overdraw_events` — the new row will appear there for oversight.

## Out of scope

- No change to clean (balance-sufficient) reversals — they keep working exactly as today.
- No change to non-reversal CFO debits — `allow_overdraw` only applies to email-deposit rerouting in this UI.

## Technical notes (for the agent)

- Files touched: `supabase/functions/cfo-direct-credit/index.ts` (add `allow_overdraw` branch + advance insert + event emission); `src/components/financial-ops/RouteEmailDepositDialog.tsx` (catch `NEGATIVE_WALLET_BLOCKED`, render confirm panel, retry with flag).
- New advance category constant: `mis_routed_recovery`.
- Existing `agent_advances` recovery cron already drains advances from incoming wallet credits — no new automation needed.
- Role gate inside the edge function checks `is_ops_role(caller)` so only Financial Ops / CFO / Manager can use the flag.
