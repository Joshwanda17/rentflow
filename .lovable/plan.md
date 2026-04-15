

## Plan: Wallet + Proxy Agent Top-Up (Skip Approval, Instant Deduction)

### Summary
Replace the 4 payment methods (Cash, MoMo, Bank, Wallet) with just **Wallet** and **Proxy Agent** on both the Partner Operations (Manager) and COO dashboards. Since money comes from already-verified wallets, skip Financial Ops approval entirely -- deduct immediately, record a wallet transaction the partner can see, and park the top-up for maturity.

### What changes

**1. UI -- `FundInvestmentAccountDialog.tsx` (Manager/Partner Ops)**
- Replace `PAYMENT_OPTIONS` with 2 options: **Wallet** (partner's own) and **Proxy Agent**
- On dialog open, fetch partner wallet balance AND proxy agent assignment + agent wallet balance
- Show balance inline for whichever option is selected; disable Proxy Agent if none assigned
- Remove `transaction_reference` field, `isRefValid()` logic, and all MoMo/Bank/Cash UI
- Update preview to say "Instant deduction -- applied at maturity" instead of "Pending Verification"

**2. UI -- `COOPartnersPage.tsx` (COO inline wallet transfer)**
- Add a Proxy Agent option alongside the existing Wallet option in the inline dialog
- Fetch proxy agent data when dialog opens; show agent name + balance
- Pass `payment_method` (`wallet` or `proxy_agent`) and `source_wallet_user_id` to the edge function

**3. Edge Function -- `manager-portfolio-topup/index.ts`**
- Change `VALID_METHODS` to `["wallet", "proxy_agent"]`
- Remove all cash/MoMo/bank branches and reference validation
- For `proxy_agent`: look up `proxy_agent_assignments` for the partner, fetch agent wallet, validate balance
- **Instant wallet deduction**: Create `wallet_transactions` record (sender = wallet owner, recipient = platform) so the partner/agent sees it in their transaction history
- Create `pending_wallet_operations` with `status: "approved"` (pre-approved, no Financial Ops step)
- Create ledger entries immediately (double-entry: wallet `cash_out` for deduction, portfolio `cash_in` for pending capital)
- Audit log with full metadata (payment_method, source_wallet_owner, agent details if proxy)

**4. Edge Function -- `coo-wallet-to-portfolio/index.ts`**
- Same changes as manager-portfolio-topup: accept `wallet` or `proxy_agent`
- For `proxy_agent`: resolve agent via `proxy_agent_assignments`, validate agent wallet balance
- Instant deduction + wallet transaction record + ledger entries
- Remove the "pending Financial Ops approval" messaging from notifications; replace with "Applied at maturity"

**5. Supporter's `FundAccountDialog.tsx`**
- No changes needed -- this is the supporter's own self-service dialog (already wallet-only)

### What stays the same
- The `merge-pending-topups` / `apply-pending-topups` maturity logic is unchanged -- capital still merges at payout
- Notification flow to partner and executives is preserved (updated messaging only)
- Audit logging structure preserved

### Technical detail

```text
Flow (both dashboards):
  User selects Wallet or Proxy Agent
  → Balance shown instantly
  → Submit
  → Edge function:
     1. Validate wallet balance (partner or agent)
     2. INSERT wallet_transactions (visible to partner/agent)
     3. INSERT general_ledger (cash_out from wallet, cash_in to portfolio)
     4. INSERT pending_wallet_operations (status='approved', operation_type='portfolio_topup')
     5. INSERT audit_logs
     6. INSERT notifications
     7. Return success — no approval step
```

### Files modified
- `src/components/manager/FundInvestmentAccountDialog.tsx`
- `src/components/coo/COOPartnersPage.tsx`
- `supabase/functions/manager-portfolio-topup/index.ts`
- `supabase/functions/coo-wallet-to-portfolio/index.ts`

