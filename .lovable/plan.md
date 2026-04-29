# Agent deposits default to Float

## Problem

Agents (e.g. ATUHAIRE CAROLYNE) are submitting their cash deposits with `deposit_purpose = 'personal_deposit'`, which routes the credit to **withdrawable** at Financial Ops approval. Per policy, agent-collected cash is company money and belongs in the **float bucket**.

The routing logic in `approve-deposit` is already correct:
- `operational_float` → `agent_float_deposit` category → `float_balance`
- `personal_deposit` → `wallet_deposit` category → `withdrawable_balance`

The fix is at the **point of submission**: agents should default to Operational Float, with an explicit opt-out for genuine personal top-ups.

## Scope

- **Apply to**: every user with the `agent` role (active or in role switcher).
- **Do NOT touch**: existing approved/pending rows, ledger, or wallet balances. Per the fresh-start anchor rule, today's mis-routed personal deposits stay where they are.

## Changes

### 1. `src/components/payments/DepositFlow.tsx` — Agent default

When the dialog opens for a user whose active role is `agent` and no `defaultPurpose` was passed by the parent:
- Pre-select `operational_float`.
- Set `purposeEntryPoint = 'agent_default'` (new tag, for audit).
- Still show the purpose grid so the agent can switch.
- If they switch to `personal_deposit`, show an inline confirm panel:
  > "This deposit will land in your withdrawable balance, not your operational float. Use this only for your own salary or personal top-ups — not for cash collected from tenants."
  > [ Cancel ] [ Yes, this is my own money ]
- The confirmation choice (`personal_confirmed_at`, `personal_confirmation_text`) is stamped into the `audit` blob saved with the request so Financial Ops can see the agent explicitly chose personal.

The `mustChoosePurpose` branch (forced fresh choice) keeps precedence — it already forces an empty selection for sensitive flows, and we don't want to override that.

### 2. `supabase/functions/agent-deposit/index.ts` — Server backstop

Cross-check on submission:
- If the submitter has the `agent` role AND `deposit_purpose = 'personal_deposit'` AND the audit blob lacks `personal_confirmed_at`, reject with `agent_personal_deposit_requires_confirmation` and a friendly message. Forces clients (including any direct API caller) through the confirmation gate.

### 3. Financial Ops review UI — Visibility chip

In `src/components/financial-ops/TidVerification.tsx` and `ReconciliationReviewScreen.tsx`:
- Show a chip on each pending row:
  - `🏘️ Float` (operational_float)
  - `💰 Personal — confirmed` (personal_deposit with `personal_confirmed_at` in audit)
  - `⚠️ Personal — no confirm` (personal_deposit without confirm — legacy or bypassed)
- The chip uses the existing `deposit_purpose` field plus the audit blob; no schema change.

### 4. Memory update

Append to `mem://business-model/agent-deposit-policy`:
> Agent personal deposits require explicit in-UI confirmation (stamped `personal_confirmed_at`); the default for any deposit submitted by an agent is `operational_float`. Server-side `agent-deposit` edge function rejects unconfirmed personal deposits.

## Out of scope (per your decision)

- No retro-reclassification of the ~1.62M ATUHAIRE rows already approved to withdrawable today, nor SSENKAALI's 50K. They stay in withdrawable. (Historical drift continues to flow through the existing CFO Historical Drift Review queue if anyone wants to reverse them later.)
- No change to `approve-deposit` routing logic — it's already correct.
- No change to wallet buckets, ledger schema, or the strict withdrawable RPC.

## Files touched

- `src/components/payments/DepositFlow.tsx` — agent default + confirm panel
- `supabase/functions/agent-deposit/index.ts` — server backstop
- `src/components/financial-ops/TidVerification.tsx` — visibility chip
- `src/components/financial-ops/ReconciliationReviewScreen.tsx` — visibility chip
- `mem://business-model/agent-deposit-policy` — policy update
