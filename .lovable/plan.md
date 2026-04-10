

# Tag and Filter the Ledger — Classification Column

## Overview
Add a `classification` column to `general_ledger`, populate it for all 11,355 existing entries based on category, and update reporting queries to filter out test/dev data.

## Database Migration

### Step 1: Add column + populate via UPDATE

```sql
ALTER TABLE public.general_ledger
ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'production';
```

Then batch-update all existing rows using the category mapping:

**`production`** (locked categories — default):
`wallet_deposit`, `wallet_withdrawal`, `wallet_transfer`, `wallet_deduction`, `referral_bonus`, `rent_disbursement`, `rent_principal_collected`, `access_fee_collected`, `registration_fee_collected`, `roi_wallet_credit`, `roi_expense`, `roi_reinvestment`, `agent_commission_earned`, `agent_commission_withdrawal`, `agent_commission_used_for_rent`, `agent_float_deposit`, `agent_float_used_for_rent`, `system_balance_correction`, `orphan_reassignment`, `orphan_reversal`, `tenant_repayment`, `agent_repayment`, `partner_funding`, `share_capital`, `rent_receivable_created`, `rent_disbursement`

**`legacy_real`**:
`deposit`, `roi_payout`, `agent_commission`, `agent_commission_payout`, `supporter_facilitation_capital`, `supporter_rent_fund`, `supporter_capital`, `rent_repayment`, `tenant_access_fee`, `supporter_platform_rewards`, `agent_proxy_investment`, `proxy_investment_commission`, `agent_investment_commission`, `rent_payment_for_tenant`, `landlord_rent_payment`, `rent_obligation`, `rent_obligation_reversal`, `rent_obligation_reversal_adjustment`, `credit_access_repayment`, `advance_repayment`, `pool_capital_received`, `pool_rent_deployment`, `pool_rent_deployment_reversal`, `angel_pool_investment`, `coo_proxy_investment`, `coo_proxy_investment_reversal`, `wallet_to_investment`, `proxy_partner_withdrawal`, `pending_portfolio_topup`, `rent_float_funding`, `debt_clearance`, `agent_bonus`, `tenant_default_charge`, `platform_expense`, `marketing_expense`, `account_merge`

**`test_dev`**:
`test_funds_cleanup`, `opening_balance`

**`admin_correction`**:
`balance_correction`, `correction_reversal`, `🔧 Manual Adjustment`, `reconciliation`, `manager_credit`, `manager_debit`, `wallet_deduction_general_adjustment`, `wallet_deduction_cash_payout_retraction`

### Step 2: Auto-classify future entries

New entries use locked categories and get `DEFAULT 'production'` automatically. No trigger needed.

## Code Changes

### Update CFO/COO reporting queries
Add `.in('classification', ['production', 'legacy_real'])` filter to key reporting queries in:

- `src/hooks/useCFOOverviewData.ts` — treasury KPI cards
- `src/components/cfo/DailyCashPositionReport.tsx` — daily cash
- `src/components/coo/FinancialMetricsCards.tsx` — COO metrics
- `src/hooks/useFinancialStatements.ts` — income/cash flow/balance sheet

This ensures test and correction entries are excluded from financial reports while remaining fully visible in audit/search views.

### No changes to
- Transaction search, ledger detail drawers, or wallet history — these show all entries for full traceability
- No data deletion or balance edits

## Result
- Every ledger entry tagged with its classification
- Reports show only real money (production + legacy_real)
- Test/dev data preserved but filtered out of analytics
- Future entries auto-classified as `production`

