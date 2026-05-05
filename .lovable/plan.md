# Allow agent to fund Angel Pool from either wallet

Today the dialog and edge function always debit the **investor's** wallet. We will add a clear payment-source toggle so the agent can choose:

- **Investor's Wallet** — debit `investor_id`'s wallet (current behaviour, default).
- **Agent's Wallet** — debit the logged-in agent's own wallet (their withdrawable balance), useful when the agent is fronting the share purchase on the partner's behalf.

## UI changes — `src/components/agent/AgentAngelPoolInvestDialog.tsx`

In the **Amount** step (Step 2), under the existing investor card:

1. Fetch the agent's own withdrawable balance once when the dialog opens (via `get_user_available_balance` RPC for strict-rule compliance).
2. Render a 2-tile selector ("Investor Wallet" / "Agent Wallet"), each showing the wallet name + live balance, with a clear "Selected" highlight.
3. Recompute `canProceed` against whichever wallet is selected (its balance must cover `actualAmount`).
4. Show "Insufficient balance" against the chosen wallet, not always the investor's.
5. In the **Preview** step (Step 3) add a "Funded By" row showing the chosen source so the agent confirms intent before clicking Confirm.

Pass the new field `funding_source: 'investor' | 'agent'` to the edge function.

## Edge function changes — `supabase/functions/agent-angel-pool-invest/index.ts`

1. Accept `funding_source` in the request body; default `'investor'` for backward compatibility. Validate it's one of the two allowed values.
2. Resolve the **funding user id**: `investor_id` if `'investor'`, else `user.id` (agent).
3. Balance check uses `get_user_available_balance(funding_user_id)` (strict withdrawable rule) instead of the cached `wallets.balance`. Reject if insufficient.
4. The wallet `cash_out` ledger leg's `user_id` becomes the funding user. The platform `cash_in` (`pool_capital_received`) leg's description is annotated with `funded_by_agent=true` when applicable, so CFO reconciliation can distinguish.
5. The investment row records `payment_method` plus a new metadata field `funded_by` (`'investor' | 'agent'`) so the audit trail is permanent. (Stored in existing `investment_reference` if no metadata column exists, but we'll add a `funded_by` column via migration if missing — see step 6.)
6. **Migration** — add `funded_by text not null default 'investor'` (CHECK in `('investor','agent')`) to `angel_pool_investments`. Plus a small index for analytics.
7. Agent commission logic stays unchanged — still credited to the agent (1%), regardless of funding source.
8. Email already sent to the investor stays unchanged; we add a `funded_by` line to the template and pass it through (small visual addition, no breaking change).

## Safety / governance

- Strict withdrawable RPC means agent can never overspend their float — only their truly withdrawable balance can fund a share purchase.
- System event `agent_angel_pool_investment` payload gains `funded_by` for full auditability.
- Backward compatible: existing callers without `funding_source` behave exactly as before.

## Files touched

1. `src/components/agent/AgentAngelPoolInvestDialog.tsx` — wallet picker UI + agent balance fetch + payload field.
2. `supabase/functions/agent-angel-pool-invest/index.ts` — funding source routing + strict balance check + ledger user routing + system event metadata.
3. `supabase/functions/_shared/transactional-email-templates/angel-pool-share-purchase.tsx` — small "Funded by" row.
4. New migration adding `funded_by` to `angel_pool_investments`.
