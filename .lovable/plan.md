Investigation result

The 9,900 shown on the agent wallet card is not coming from `wallets.withdrawable_balance` for the user in the screenshot. I found the matching user:

- User: JOSHUA WANDA
- Cached wallet withdrawable: UGX 0
- `get_user_available_balance`: UGX 0
- Agent commission ledger net: UGX 9,900
- All wallet ledger net: UGX 502,000

So the issue is a frontend display bug: the Agent Wallet hero card labels `commissionBalance` as “Withdrawable” instead of using the actual `withdrawableBalance` returned by the RPC/gate.

I also found the broader problem you suspected:

- 18 agent accounts show commission figures above true withdrawable.
- Total overstatement from this commission display path is about UGX 2,091,627.
- 17 wallets have cached withdrawable above a strict ledger-backed value.
- The current baseline-anchored RPC still allows some old cached amounts to remain withdrawable, especially when the ledger is zero or negative. This conflicts with your new rule: if it does not exist in the ledger, it must not be withdrawable.

Permanent fix plan

1. Make the backend RPC strict again

Update `get_user_available_balance(p_user_id uuid)` so withdrawable is:

```text
available = max(
  0,
  min(wallets.withdrawable_balance, max(0, wallet_ledger_net)) - pending_withdrawal_holds
)
```

Where `wallet_ledger_net` is calculated only from production wallet ledger rows:

```text
cash_in  = positive
cash_out = negative
```

This means:

- Negative ledger net => withdrawable UGX 0.
- No ledger backing => withdrawable UGX 0.
- Cached wallet bucket can only reduce what is shown, never increase it.
- Pending withdrawals are deducted from the amount shown and from withdrawal gating.

2. Keep baseline snapshot for audit, but remove it from spendable math

The previous baseline table is still useful as an audit marker for historical drift, but it should not make cached historical balances withdrawable. I will leave the baseline/review artifacts in place for CFO review, but `get_user_available_balance` will stop using `baseline_withdrawable + delta` as the spendable cap.

3. Fix the Agent Wallet hero card

Change `UnifiedWalletHeroCard` so the tile labeled “Withdrawable” displays `withdrawableBalance`, not `commissionBalance`.

Current incorrect path:

```text
Withdrawable tile -> commissionBalance -> shows UGX 9,900
```

Correct path:

```text
Withdrawable tile -> withdrawableBalance -> shows UGX 0 for Joshua
```

4. Fix agent total balance display

On the Agent Dashboard, change the wallet hero `balance` prop from:

```text
floatBalance + commissionBalance + otherBalance
```

to:

```text
floatBalance + withdrawableBalance
```

This prevents old commission ledger categories from inflating the prominent total balance when those funds are not currently withdrawable.

5. Fix wallet sheet display consistency

In `FullScreenWalletSheet`, ensure the prominent total card and agent breakdown use the same ledger-backed values:

```text
total visible balance = floatBalance + withdrawableBalance
withdrawable line = withdrawableBalance
```

Not stale `wallet.balance` or commission-only calculations.

6. Fix `useAgentBalances`

Update `useAgentBalances` so:

- `withdrawableBalance` is always the RPC result, clamped at zero.
- It does not fall back to cached wallet withdrawable if the RPC succeeds.
- `commissionBalance` remains available as an earnings/history metric, but it is no longer used as spendable money.
- `otherBalance` is calculated only as a diagnostic and not added to prominent spendable totals.

7. Fix withdrawal flow wording

The withdrawal modal already gates against `computeLedgerAvailable`, but its bucket breakdown still labels cached `availableBalance` in a way that can confuse users. I will update that text so the modal says:

```text
Ledger-backed withdrawable: UGX X
Operational float: locked
Advance: liability, not withdrawable
```

This matches the business rule in memory: advance is a liability and float is company money.

8. Fix approval edge function to use the same RPC

The `approve-withdrawal` backend function still computes a raw all-time ledger net inline and calls `reconcile_wallet_from_ledger`, which is risky with the new wallet governance rules. I will change it to use `get_user_available_balance` for the funding user before approval.

That makes the UI, withdrawal submission, and Financial Ops approval all use one source of truth.

9. Add a strict drift inspection query/function

Add a read-only diagnostic function/view for finance staff to see accounts where:

```text
wallets.withdrawable_balance > strict ledger-backed withdrawable
```

This gives CFO/Finance Ops a clean list of accounts whose cached wallet buckets should not be trusted.

10. Update project memory

Update the wallet baseline memory to reflect the revised rule:

- Baseline remains for audit/review only.
- Spendable/withdrawable must be strict ledger-backed.
- Never use commission net, cached wallet balance, or baseline snapshot as withdrawable unless backed by wallet ledger net.

Files/functions to change

- Database migration:
  - Replace `public.get_user_available_balance(p_user_id uuid)` with strict ledger-backed formula.
  - Add optional finance diagnostic view/RPC for strict drift cases.
- `src/hooks/useAgentBalances.ts`
- `src/components/wallet/UnifiedWalletHeroCard.tsx`
- `src/components/dashboards/AgentDashboard.tsx`
- `src/components/wallet/FullScreenWalletSheet.tsx`
- `src/components/payments/WithdrawFlow.tsx`
- `supabase/functions/approve-withdrawal/index.ts`
- `src/lib/computeLedgerAvailable.ts` comments/fallback alignment
- `mem/architecture/wallet-baseline-anchor.md` and `mem/index.md`

Expected result after implementation

For the screenshot case:

```text
Agent card withdrawable: UGX 0
Withdraw modal available: UGX 0
Withdrawal approval gate: UGX 0
```

For all users:

```text
Displayed withdrawable <= ledger-backed wallet net
Displayed withdrawable <= cached withdrawable bucket
Pending withdrawals reduce displayed withdrawable
Float remains visible but locked
Commission can be shown as earnings/history, not as withdrawable money
```