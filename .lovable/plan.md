## What you're seeing

The Financial Ops queue is full of five identical pending withdrawals from **Maphoe Maphosa → Raphael Oluwashola @ UGX 22,500**, all "requested about 4 hours ago". The existing safeguards only stop **double-tap** (same submission within milliseconds via `clientRequestId`). They do **not** stop a user from re-opening the dialog and submitting the same recipient + amount again 30 seconds, 2 minutes, or an hour later. That's why operators are now staring at five duplicate cards.

## The guard

Add two layers — a fast **client-side session guard** in the withdrawal dialog (catches honest mistakes / nervous re-submissions without a server round-trip) and a **server-side time-window guard** in the database (catches the same user submitting from a different tab, after a refresh, or from another device).

### Layer 1 — Client session guard (`src/components/wallet/WithdrawRequestDialog.tsx`)

- Maintain a `Map<recipientKey, { amount, submittedAt, requestId }>` in `sessionStorage` keyed under `welile:withdraw:recent:<userId>`.
- `recipientKey` =
  - mobile money → `"momo:<provider>:<normalised-phone>"`
  - bank → `"bank:<bank>:<account-number>"`
  - cash → `"cash:<agent-location>"`
- Window: **10 minutes** for the same recipient regardless of amount, with a stricter check if the amount also matches.
- Behaviour on submit:
  1. If the same recipient has been submitted in the last 10 min for **the same amount**, BLOCK with a clear toast + a second-tap "Confirm I really mean to send this again" confirm dialog. Only proceed after explicit confirmation.
  2. If the same recipient has been submitted in the last 10 min for a **different amount**, show a soft warning ("You sent UGX 22,500 to this number 3 minutes ago — continue?") with Confirm / Cancel.
  3. On successful submission, write the entry into the map with timestamp.
- Wipe entries older than 10 minutes on dialog open so the map self-prunes.
- Show a small inline notice on the form when the recipient field changes to one already used recently in this session: *"You already sent UGX 22,500 to this number at 14:32. Pending operator approval."* — gives the user a chance to abort before even hitting Submit.

### Layer 2 — Server-side dedupe (database trigger)

- Add a `BEFORE INSERT` trigger on `withdrawal_requests` that raises an exception when the same `user_id` already has a `status = 'pending'` row matching the same recipient (mobile_money_number+provider OR bank_account_number+bank_name OR cash) **and** the same `amount`, created in the last **10 minutes**.
- Error message: `"DUPLICATE_PENDING_WITHDRAWAL: identical pending request already exists"` so the client can map it to a friendly toast.
- This is the real safety net — it prevents the spam even if the user clears `sessionStorage`, opens an incognito tab, or runs two browsers.
- Catch the trigger error in `handleSubmit` and surface it as: *"You already have a pending withdrawal of UGX 22,500 to this recipient. Wait for operations to approve or reject the existing one before submitting again."*

### Layer 3 — One-tap "review pending" link

- After the duplicate is blocked, show an action button on the toast: **"View my pending withdrawals"** — opens the existing pending withdrawals view so the user sees their queue rather than re-trying.

## Operator-side relief (small)

In `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`, group **identical pending requests from the same user → same recipient → same amount within 10 min** under one expandable card with a "**5 duplicate submissions**" badge and a single **Reject all duplicates as duplicates** action — so even when older duplicates already slipped through (like the screenshot), ops can clear them in one tap instead of five.

## Out of scope

- No change to the approval / payout flow itself.
- No change to the withdrawal pricing, working hours, or balance checks.
- The existing `clientRequestId` idempotency stays as-is — it's still useful for network retries within a single submission attempt.

## Files to change

- `src/components/wallet/WithdrawRequestDialog.tsx` — recipient-key session guard, soft warning, hard block + confirm.
- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — duplicate grouping + bulk-reject-as-duplicates.
- New migration — `BEFORE INSERT` trigger on `withdrawal_requests` enforcing the 10-minute / same-amount / same-recipient block while a previous request is still pending.
