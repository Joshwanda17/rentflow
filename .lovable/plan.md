# Proxy withdrawals: charge the agent's wallet + auto-approve by email

## Goal
When a proxy agent requests a withdrawal for one of their proxy partners:
1. The money (both the *reserved/pending hold* and the *final debit*) comes out of the **proxy agent's** wallet — not the partner's.
2. The request **auto-approves** as soon as the matching outgoing mobile-money payout email is extracted (the same email-match engine that already auto-approves ordinary MoMo withdrawals), instead of waiting in the Financial Ops queue forever.

## Why this is needed
Today a proxy request is stored with `user_id = partner`, so:
- The pending "reserved" amount is subtracted from the **partner's** balance (strict wallet view groups holds by `user_id`).
- At approval, the debit also lands on the **partner's** wallet.
- It never auto-approves — proxy rows are forced into the Financial Ops queue and stay `pending` (live data confirms 15+ stuck pending rows).

## Changes

### 1. Move the reserve onto the agent (strict wallet view)
Update `v_user_wallet_strict` so a proxy withdrawal's pending amount is attributed to the **proxy agent** (`agent_id`) instead of the partner (`user_id`). Result: the agent's spendable balance drops the instant they request a proxy withdrawal, and the partner is no longer phantom-held.

### 2. Debit the agent at approval (`approve-withdrawal` edge function)
For proxy rows, re-point the funding wallet (`fundingUserId`) to the assigned proxy agent (from `agent_id` / managed assignment) instead of the partner. The partner stays as the beneficiary on the row for audit and settlement. The existing ledger gate already checks the funding agent's wallet and allows it to draw from withdrawable + float.

### 3. Auto-approve from the extracted email (`gmail-poll-transactions` edge function)
The email poller already matches an outgoing MoMo email to a pending withdrawal by amount + recipient phone, then auto-approves it. Today it forces the debit onto the *requester* (which for proxy rows is the partner). Change: when the matched request is a proxy row, approve it **without** that override so the agent-wallet routing from step 2 applies. Non-proxy withdrawals keep working exactly as before.

### 4. Financial Ops visibility — unchanged
Financial Ops keeps seeing every proxy row (the visibility trigger stays). The only difference is that a matching payout email now auto-completes the payout instead of requiring a manual tap.

## Guardrails respected
- The proxy-custody fortress trigger only blocks *crediting* money into an agent wallet; *debiting* (a withdrawal) is already allowed, so no guard is relaxed.
- `wallet_withdrawal` is already on the balance-bypass allowlist; no new ledger categories are invented.
- Balanced double-entry legs, the April production cutoff, and the withdrawable-strict rule all stay intact. The agent's own commission/float withdrawals now correctly compete with their outstanding proxy reserves (intended).

## Technical detail
- `v_user_wallet_strict.holds`: group pending `withdrawal_requests` by `CASE WHEN proxy_partner_id IS NOT NULL THEN agent_id ELSE user_id END`.
- `approve-withdrawal`: in the proxy branch, set `fundingUserId` to the resolved proxy agent (managed assignment → `agent_id` → active assignment lookup); keep `beneficiaryUserId = partner`.
- `gmail-poll-transactions` (`tryAutoApproveMomoWithdrawal`): select `proxy_partner_id, agent_id`; if the matched row is a proxy row, omit `force_requester_debit` in the approve-withdrawal call.

## Out of scope (confirm if you want these too)
- Removing Financial Ops visibility for proxy rows entirely.
- Auto-approving proxy *bank-transfer* or *cash* payouts (this plan covers mobile-money email matches, same as the existing auto-approver).
