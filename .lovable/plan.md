# Wallet Routing v2 — Recipient-Type Classification

## Why this is needed
Today, where money lands (withdrawable vs float) is decided by **(category, role)** inside `wallet_route_for_category`. For agents, almost every credit — including payroll, ROI, and admin reimbursements — is force-routed to **float** and becomes non-withdrawable. That violates the principle: **withdrawability is determined by who receives the money, not the category.** Result: payroll paid to an agent is locked in float and the employee/agent cannot cash out their own salary.

This plan introduces an **explicit `recipient_type`** that travels with every CFO-initiated movement and becomes the authoritative signal for routing. Categories continue to drive accounting (revenue/expense/neutral), reporting, and ledger posting — but they no longer decide which bucket of the wallet the money lands in.

---

## Core Model

Every CFO money movement carries:

- `recipient_type` — `user` | `operational_wallet`
- `category` — for accounting / reporting only
- `target_user_id` — the wallet owner

Routing rule (non-negotiable):

```text
recipient_type = user                → withdrawable_balance (user owns it)
recipient_type = operational_wallet  → float_balance        (company controlled)
```

Categories no longer route. Role no longer routes. Only `recipient_type` routes.

---

## What changes

### 1. Database — new authoritative router

New migration creates `wallet_route_by_recipient(p_recipient_type text, p_direction text)` returning `(bucket, sign)`:

```text
recipient_type=user,                direction=credit  → ('withdrawable',  1)
recipient_type=user,                direction=debit   → ('withdrawable', -1)
recipient_type=operational_wallet,  direction=credit  → ('float',         1)
recipient_type=operational_wallet,  direction=debit   → ('float',        -1)
otherwise                                              → RAISE 'RECIPIENT_TYPE_REQUIRED'
```

`apply_wallet_movement` gains a 5th arg `p_recipient_type text DEFAULT NULL`:

- If `p_recipient_type` is provided, use the new router.
- If `NULL`, fall back to the existing `wallet_route_for_category(user_id, category, direction)` so legacy callers (rent engine, agent float, ROI cron) keep working until they are migrated. A `NOTICE` is logged each time the legacy path runs so we can track migration progress.

The wallet write-lockdown trigger and `wallet.sync_authorized` flow are unchanged — `apply_wallet_movement` remains the sole writer.

### 2. Backend rejection rules

New SQL guard inside `apply_wallet_movement` (runs before any wallet update):

```text
IF category IN ('payroll_expense','roi_wallet_credit','agent_commission_earned',
                'system_balance_correction','wallet_transfer','marketing_expense',
                'general_admin_expense','research_development_expense','tax_expense',
                'interest_expense','equipment_expense')
   AND recipient_type = 'operational_wallet'
THEN RAISE 'INVALID_ROUTING: % cannot target an operational wallet', category;
```

Symmetric guard: rent disbursement / float top-up / agent working capital cannot have `recipient_type = 'user'`.

The `cfo-direct-credit` edge function adds the same checks before invoking `create_ledger_transaction`, returning a 422 with a clear message so the UI can surface it.

### 3. Edge function `cfo-direct-credit`

- Require `recipient_type` in the request body (`zod`-validated, must be `user` or `operational_wallet`).
- Pass it into `create_ledger_transaction` via `metadata.recipient_type` and into `apply_wallet_movement` via the new 5th arg.
- Drop the role-based `CONFIRM_NON_COMMISSION_AGENT_CREDIT` confirmation gate — recipient type now expresses intent explicitly, so the agent-aware nudge is no longer needed.
- Remove the `EXPENSE_CATEGORIES → system_balance_correction` translation hack (lines 80–86 of `index.ts`); the wallet leg category stays truthful because routing no longer depends on it.

### 4. CFO Direct Credit UI (`src/components/cfo/DirectCreditTool.tsx`)

Add a **required** Recipient Type selector directly under the User picker, before the Category selector:

```text
Recipient
  ( ) User wallet — money belongs to the recipient (Withdrawable)
  ( ) Operational wallet — company-controlled (Float, NOT withdrawable)
```

- Default: empty (forces explicit choice).
- The existing wallet-bucket preview card now reads `recipientType`, not `walletCategory`. It shows green "Withdrawable" or amber "Operational Float — not withdrawable" with the helper text **"Only Available Balance can be withdrawn"**.
- Submit blocked until both Category and Recipient are chosen.
- The picker shows agent users with a small badge `Agent` so the CFO sees the role, but the agent role no longer changes routing.

### 5. Wallet display

Two components surface wallet balance to staff/users:

- `src/components/wallet/WalletCard.tsx` (and any agent dashboard equivalent)
- Agent dashboard "Earnings/Float" cards

Update them to consistently show:
- **Available Balance (Withdrawable)** — large, primary
- **Float (Restricted)** — secondary, with helper text *"Operational funds — not available for withdrawal"*

Withdraw button is disabled when `withdrawable_balance == 0`, even if `float_balance > 0`.

### 6. One-time data correction

A migration runs a single reconciliation pass:

```text
For every general_ledger row where:
  scope = 'wallet'
  AND direction IN ('cash_in','credit')
  AND category = 'payroll_expense'
  AND user is currently an agent
  AND the original posting landed in float_balance:

  → Issue a balance-correction transfer:
    apply_wallet_movement(user_id, 'system_balance_correction', amount, 'in', 'user')
    apply_wallet_movement(user_id, 'agent_float_settlement',     amount, 'out')
  → Insert audit_logs row referencing original ledger group_id
```

Same pass runs for any historic credit categorised as payroll / ROI / commission / admin reimbursement that ended up in float for an agent. Drift counts are written to a `wallet_routing_v2_corrections` audit table so CFO can verify the cleanup.

### 7. Diagnostics

- New table `wallet_routing_violations` captures any rejected movement (category vs recipient mismatch) with full context. Surfaced in the existing **CFO → Reconcile** tab next to `PhantomDriftPanel`.
- The phantom drift cron (`detect_phantom_wallet_drift`) keeps running; recipient-type routing should drive drift to zero over time.

---

## Files touched

**Database (new migration)**
- `wallet_route_by_recipient()` (new)
- `apply_wallet_movement()` — add `p_recipient_type` arg + guard + violation logging
- `wallet_routing_violations` table + RLS
- `wallet_routing_v2_corrections` audit table
- One-time reconciliation DO block for misrouted historical payroll/ROI/commission

**Edge function**
- `supabase/functions/cfo-direct-credit/index.ts` — accept + validate + forward `recipient_type`; drop expense-category translation hack and agent-confirmation gate

**Frontend**
- `src/components/cfo/DirectCreditTool.tsx` — Recipient Type selector, updated bucket preview, send `recipient_type` in mutation body
- Wallet display components (`WalletCard` + agent earnings card) — consistent two-bucket layout with helper text and disabled withdraw when withdrawable=0

**Memory updates**
- New: `mem://architecture/wallet-routing-v2` — recipient-type is the sole routing signal
- Update: `mem://business-model/wallet-three-bucket-model` — note that the role-based agent override is deprecated
- Update Core: replace the role-aware float rule with the recipient-type rule

---

## Out of scope
- The rent engine, ROI cron, agent float settlement, and tenant repayment paths keep using the legacy 2-arg router for now (they always pass operational/agent semantics). Migrating them to explicit `recipient_type` is a follow-up tracked in memory but not in this change.
- No changes to fees, commission rates, or any business logic — purely routing + UI.

---

## Acceptance checks
1. CFO sends payroll to an agent with `recipient_type=user` → lands in **withdrawable_balance**, agent can cash out immediately.
2. CFO attempts payroll with `recipient_type=operational_wallet` → backend returns 422 `INVALID_ROUTING`, no wallet write happens.
3. CFO sends rent disbursement with `recipient_type=user` → backend rejects (rent disbursement must be operational).
4. Historic payroll rows misrouted to agent float are moved to withdrawable, with an audit row per correction.
5. Wallet card shows two clear buckets with the helper line "Only Available Balance can be withdrawn".
6. `wallet_routing_violations` records every rejected movement for CFO review.