

## Why agent deposits show up in the Funder wallet

### Root cause (verified in code + DB)

`DepositFlow` is a generic dialog used by tenants, agents, supporters and partners. It always:
1. Inserts into `deposit_requests` and credits the user's **personal `wallets` row** via `wallet_deposit` (this is the only wallet table — there is no separate "agent wallet" or "funder wallet" row; there's one wallet per user).
2. Then, **only if** the user manually selects "Operational Float" *and* has the `agent` role, `approve-deposit` runs an extra ledger sweep into `agent_landlord_float`.

For Akandwanaho Wycliffe, the two recent deposits were tagged `operational_float` and were swept correctly. But every other agent deposit — and any earlier one where the agent picked "Personal Deposit", "Partnership Deposit", or "Other" — sits in the personal wallet and is therefore visible in:

- the personal Wallet card (which the agent perceives as "the funder side"), and
- any UI that reads the `wallets.balance` / `withdrawable_balance` columns regardless of role.

There is no bug routing money to a *different user's* funder wallet. The confusion is that the agent's **own personal wallet** doubles as the "funder" view because a single user can hold multiple roles, and DepositFlow doesn't enforce the agent-context default.

### Fix

Make agent deposits route to the operational float **by default**, with the agent only able to opt out into "Personal Deposit" by an explicit toggle. Same pattern other role-aware dialogs already use.

#### 1. DepositFlow becomes role-aware

Add an optional prop `defaultPurpose?: DepositPurpose` and a `lockPurpose?: boolean` to `src/components/payments/DepositFlow.tsx`.
- When `defaultPurpose` is provided, pre-select it and (if `lockPurpose`) hide the purpose grid behind a small "Change purpose" link.
- For agents, the only sensible non-float purpose is "Personal Deposit" (their own salary top-up). Hide partnership / personal-rent-repayment options when launched from the agent dashboard.

#### 2. AgentDashboard passes the agent context

In `src/components/dashboards/AgentDashboard.tsx` (line 526) and anywhere else an agent opens DepositFlow:
```tsx
<DepositFlow
  open={showQuickDeposit}
  onOpenChange={setShowQuickDeposit}
  defaultPurpose="operational_float"
  allowedPurposes={['operational_float', 'personal_deposit']}
/>
```

Same change in `FullScreenWalletSheet` when the active role is `agent`.

#### 3. Backend safety net (non-negotiable)

In `supabase/functions/approve-deposit/index.ts`, when approving a deposit, after the `wallet_deposit` ledger entry:
- Look up the depositor's roles.
- If the user has the `agent` role **and** `deposit_purpose` is null/`'other'`/missing, default-treat it as `operational_float` and run the same sweep block (lines 178–237). This guarantees that even legacy clients or older mobile builds that don't send a purpose still route agent money to the float bucket, not the personal wallet.
- Log this as `auto_routed_to_float` in `audit_logs` so the override is auditable.

#### 4. One-time cleanup for Akandwanaho

His two April deposits are already correctly in the float. The remaining UGX 93,000 in `withdrawable_balance` is genuine commission, not a misrouted deposit — keep it as-is.

But for any *historical* agent deposit on the platform that was tagged `personal_deposit` / `other` while the user was an agent and never legitimately a personal top-up, run a reconciliation query (preview-only, manager confirms before applying) that shows: `deposit_id, amount, current location (wallet vs float), suggested target`. Then a follow-up insert sweeps each confirmed row from wallet → operational float using the same `agent_float_deposit` double-entry the live function uses.

### Files touched

- `src/components/payments/DepositFlow.tsx` — add `defaultPurpose`, `allowedPurposes`, `lockPurpose` props; render purpose grid filtered/locked.
- `src/components/dashboards/AgentDashboard.tsx` — pass agent defaults to all DepositFlow instances (lines ~526, plus the wallet sheet trigger).
- `src/components/wallet/FullScreenWalletSheet.tsx` — when current role is agent, pass the same defaults.
- `supabase/functions/approve-deposit/index.ts` — backend default-to-float for agents missing/ambiguous purpose, with audit log entry.
- New migration `*_reconcile_agent_misrouted_deposits.sql` — preview report only; actual sweep entries created via `create_ledger_transaction` in a follow-up after you review the list.

### What you'll see after the fix

- An agent tapping **Deposit** from their dashboard sees the form pre-set to **🏘️ Operational Float**, with only one alternative ("Personal Deposit") behind a toggle.
- Approved agent deposits flow into the **Operations Float** card (`agent_landlord_float`), not the personal Wallet card.
- Even if a stale app posts without a purpose, the edge function snaps it to float for any user with the agent role.
- The "funder wallet shows my agent money" complaint disappears because the personal `wallets.balance` only ever holds genuine personal deposits and earned commission for that user.

