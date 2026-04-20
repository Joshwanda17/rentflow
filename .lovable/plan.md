

## Fix: CFO Direct Credits Must Land in the Withdrawable Bucket

### Problem
When the CFO credits a user (e.g. UGX 50,000 to Joshua Wanda from the Funder dashboard context), the money shows up in the ledger but the **withdrawable bucket stays at UGX 100**. Joshua can see the balance but cannot withdraw it.

**Root cause**: `cfo-direct-credit` sends the credit with `wallet_category = 'system_balance_correction'` (the default when no category is picked). The wallet bucket router (`wallet_route_for_category`) only routes categories it explicitly recognises. `system_balance_correction` is not in the credit allowlist, so the router returns `bucket='none'` and the money **never lands in withdrawable / float / advance** — it orphans between ledger and buckets.

Current credit-routing allowlist (withdrawable):
`wallet_deposit, wallet_transfer, cfo_direct_credit, agent_commission_earned, agent_commission, agent_bonus, partner_commission, referral_bonus, proxy_investment_commission, salary_payout, roi_payout`

`system_balance_correction`, `roi_wallet_credit`, GAAP expense categories → all unrouted.

### Fix (two layers — both cheap, both needed)

**1. Router: add `system_balance_correction` + `roi_wallet_credit` to the withdrawable-credit allowlist.**
Migration to `CREATE OR REPLACE FUNCTION public.wallet_route_for_category(...)` adding those two categories so cash_in lands in `withdrawable_balance`. These are the canonical categories the CFO uses to put spendable money into a user's wallet, so they MUST be withdrawable. (We also add the symmetric `cash_out` route for `system_balance_correction` so CFO debits subtract from withdrawable correctly.)

**2. Backfill Joshua's wallet** to reflect ledger reality.
Use the existing `recompute_wallet_buckets` / equivalent to rebuild his three buckets from ledger, so his orphaned 50,000 CFO credit finally appears as withdrawable.

### Implementation steps
1. **Migration**: update `wallet_route_for_category` to add:
   - cash_in withdrawable: `system_balance_correction`, `roi_wallet_credit`
   - cash_out withdrawable: `system_balance_correction`
2. **Data fix**: recompute Joshua's wallet buckets (UUID `cb798acb-68bc-4b4e-a414-a3d374e030b6`) so withdrawable reflects the CFO credit.
3. **Memory update**: append router category → bucket mapping to `mem://business-model/wallet-three-bucket-model` so future CFO category additions don't silently orphan money.

### What this does NOT change
- No change to edge function code, RLS, or the ledger itself.
- Float and advance buckets stay isolated (company money / liabilities).
- Withdrawal gate in `approve-withdrawal` stays as-is — it's correct; we're just making sure money the CFO *intends* to be withdrawable actually reaches that bucket.

### Verification after fix
- Joshua's `withdrawable_balance` should equal his ledger net (≈ 50,100).
- Retrying the UGX 50,000 withdrawal through Funder dashboard should succeed.
- New CFO credits with default category now route correctly without needing the operator to pick a specific wallet_category.

