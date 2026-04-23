

# Path B — Surface "Other" withdrawable on Agent card + CFO guardrail

## 1. `useAgentBalances.ts` — expose `otherBalance`

Add a new field to `AgentSplitBalances`:
- `otherBalance = max(0, rawWithdrawable − commissionBalance)`

This is money sitting in the withdrawable bucket that did NOT come from `agent_commission_earned` (e.g. CFO admin-expense credits, manual reimbursements). Keep the existing invariant warning log, but stop force-overriding `withdrawableBalance = commissionBalance`. Instead:
- `withdrawableBalance = rawWithdrawable` (truth from wallet row)
- `commissionBalance` stays as ledger-derived
- `otherBalance` = the gap

Return `otherBalance` from the hook.

## 2. `AgentWalletHeroCard.tsx` — add "Other" pill

In the row under the Total Balance that currently shows Commission + Float pills, conditionally render a third pill when `otherBalance > 0`:

```
Commission: 0   Float: 3,000   Other: 500,000
```

Style: same compact style as existing pills, amber/neutral color (`text-amber-300`) so it visually reads as "not commission, not float — review with CFO". Tooltip/title: `"Funds credited by CFO under a non-commission category. Withdrawable but not counted as earnings."`

Also update Total Balance math to `floatBalance + commissionBalance + otherBalance` so the headline matches reality (currently it shows `float + commission` only, which is why the 500K appears invisible on the agent card).

Pass `otherBalance` from the parent (wherever `AgentWalletHeroCard` is consumed — `useAgentBalances` already provides it).

## 3. `cfo-direct-credit/index.ts` — confirmation guardrail

Add a pre-credit check:
1. Look up the target user's roles via `user_roles`.
2. If they hold the `agent` role AND the chosen category routes to `withdrawable_balance` AND category ≠ `agent_commission_earned`, AND the request body does NOT include `confirm_non_commission: true`:
   - Return `409` with `{ code: "CONFIRM_NON_COMMISSION_AGENT_CREDIT", message: "Recipient is an agent. Crediting them under '<category>' will appear in their withdrawable bucket but NOT as commission. Re-submit with confirm_non_commission=true to proceed.", suggested_category: "agent_commission_earned" }`.
3. If the flag is present, proceed normally.

Frontend (`CfoDirectCreditDialog` or wherever the CFO triggers this) catches the 409, shows a confirm modal, and re-submits with the flag. (Tiny dialog change — single useState + AlertDialog.)

## Files touched

- `src/hooks/useAgentBalances.ts` — add `otherBalance`, stop overriding `withdrawableBalance`.
- `src/components/agent/AgentWalletHeroCard.tsx` — third pill + total math fix.
- `supabase/functions/cfo-direct-credit/index.ts` — 409 confirmation gate.
- The CFO direct-credit dialog component — handle the 409 + re-submit. (I'll locate it during implementation.)

## What does NOT change

- No ledger writes, no migrations, no wallet repair. The 500K stays where it is, classified as `general_admin_expense`.
- Funder/Supporter card behavior unchanged.
- `approve-withdrawal` logic unchanged — the user can still withdraw the 500K because it's in the withdrawable bucket.

