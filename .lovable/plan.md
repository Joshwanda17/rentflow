

# Add Tenant Repayment Tracker to COO Dashboard + Confirm Golden Path

## Status: Deposit & Withdrawal Flows

Both flows already follow the golden path:
- `trg_deposit_to_ledger` — dropped (migration `20260410081534`)
- `trg_deduct_wallet_on_withdrawal_request` — dropped (migration `20260410075620`)
- `approve-deposit` — already uses `create_ledger_transaction` RPC with balanced double-entry
- `approve-withdrawal` — already uses `create_ledger_transaction` RPC with balanced double-entry
- No direct wallet mutations in deposit/withdrawal code

**Remaining anti-patterns** (direct `.update({ balance })` on wallets):
- `supabase/functions/product-purchase/index.ts` — 4 direct wallet mutations
- `supabase/functions/agent-withdrawal/index.ts` — 1 direct wallet mutation

These should be fixed separately to fully eliminate drift sources.

## New Feature: Tenants View in COO Dashboard

The `MissedDaysTracker` component already exists and shows tenant repayment progress, overdue status (Critical/Warning/On Track), and agent contact info. It just needs wiring into the COO dashboard.

### Changes

**1. `src/pages/coo/Dashboard.tsx`**

- Add `MissedDaysTracker` import
- Add `Home` (or `Users`) icon import for the nav item
- Add a new quick-nav card to `quickNavItems`:
  ```
  { id: 'tenants', label: 'Tenants', icon: Home, color: '...', description: 'Repayment tracker' }
  ```
- Add a new `case 'tenants'` in `renderContent()` that renders `MissedDaysTracker` with a section header and description

No new tables, no new queries, no edge functions — pure UI wiring.

