

## Plan: Portfolio Top-Up Approval Gate via Financial Ops

### Problem
Currently, when COO or Partner Operations initiates a wallet-to-portfolio top-up, the money is **immediately deducted** from the partner's wallet via ledger entries, and the pending record is created as a formality. The principal (`investment_amount`) is not updated at all — neither immediately nor on approval. This creates two issues:
1. Money leaves the wallet before Financial Ops verifies the transaction
2. The portfolio principal never actually increases from top-ups

### New Flow

```text
COO/Partner Ops submits top-up
        │
        ▼
  pending_wallet_operations record created (status: "pending")
  ── NO wallet deduction, NO ledger entries ──
        │
        ▼
  Shows as "⏳ Pending" in Financial Ops Approval Queue
  Shows as "Pending Top-Up" badge on portfolio in COO/Partner Ops view
        │
        ├── Financial Ops APPROVES ──▶ Wallet deducted via ledger
        │                             Portfolio investment_amount increased
        │                             Partner notified: "Top-up approved"
        │                             Audit logged
        │
        └── Financial Ops REJECTS ──▶ No money moves
                                      Partner notified: "Top-up rejected"
                                      Audit logged
```

### Changes

**1. `supabase/functions/coo-wallet-to-portfolio/index.ts`** — Remove immediate ledger entries

- Keep wallet balance check (validate partner has enough funds)
- Keep pending_wallet_operations insert (status: "pending")
- **Remove** the `create_ledger_transaction` RPC call (lines 130–157) — no wallet deduction at submission
- Update response to indicate "pending_verification" status
- Keep audit log, notifications

**2. `supabase/functions/manager-portfolio-topup/index.ts`** — Remove immediate ledger entries for wallet path

- Keep wallet balance check
- Keep pending_wallet_operations insert
- **Remove** the ledger RPC call (lines 147–174) and the post-deduction negative balance check/rollback (lines 182–224)
- **Remove** the wallet_transactions insert (lines 227–232) — premature
- Keep audit, notifications

**3. `supabase/functions/approve-wallet-operation/index.ts`** — Add portfolio top-up approval logic

After the existing ledger insert block (which handles wallet credits), add a new section for `portfolio_topup` operations:

- When `op.operation_type === 'portfolio_topup'` and `op.source_table === 'investor_portfolios'`:
  - Re-verify wallet balance (fresh check to prevent race conditions)
  - Create balanced ledger entries: wallet `cash_out` (partner_funding) + platform `cash_in` (partner_funding)
  - Update `investor_portfolios.investment_amount` += top-up amount
  - Notify partner: "Your top-up of UGX X has been approved and applied"
  - Log to audit_logs

- On rejection of `portfolio_topup`:
  - No money moves (nothing to reverse since no deduction happened)
  - Notify partner: "Your top-up was rejected. Reason: ..."

**4. No UI changes needed** — The COO/Partner Ops dashboard already:
- Shows pending top-up badges via `pendingTopUps` state
- Financial Ops Approval Queue already shows `portfolio_topup` items with the "💰 Portfolio Deposit" label
- The approve/reject bulk actions already route through `approve-wallet-operation`

### Files

| File | Action |
|------|--------|
| `supabase/functions/coo-wallet-to-portfolio/index.ts` | **Edit** — remove ledger RPC call, keep only pending record |
| `supabase/functions/manager-portfolio-topup/index.ts` | **Edit** — remove wallet-path ledger RPC + rollback + wallet_transactions |
| `supabase/functions/approve-wallet-operation/index.ts` | **Edit** — add portfolio_topup approval logic (wallet deduct + principal update) |

### Impact

- **Financial Ops**: Full gatekeeping authority — no money moves without their approval
- **COO/Partner Ops**: Can still submit top-ups, but see "Pending" status until approved
- **Partners**: Wallet balance stays intact until Financial Ops approves; principal only increases on approval
- **Audit trail**: Complete — submission logged by COO, approval/rejection logged by Financial Ops
- **Ledger integrity**: Maintained — balanced double-entry only happens once, at approval time

