

## Plan: Restructure CFO Payout Categories with Subcategories and Automated Recurring Payouts

### What Changes

**1. Restructure payout categories with subcategories** in `DirectCreditTool.tsx`

Replace the flat category list with a hierarchical structure:

| Category | Subcategories | Ledger Mapping |
|----------|--------------|----------------|
| 📈 ROI Payout | *(none — standalone)* | roi_wallet_credit / roi_expense |
| 🏠 Rent Disbursement | *(none — standalone)* | rent_disbursement |
| 📢 Marketing Expenses | Marketing Materials | system_balance_correction (expense) |
| 🤝 Agent Commissions | *(none — standalone)* | agent_commission_earned |
| 🔬 Research & Development | *(none — standalone)* | system_balance_correction (expense) |
| 🏢 Operational Expenses | Salaries, Transport, Food, Office Rent, Internet, Airtime, Stationery, Property & Equipment, Taxes, Interests | system_balance_correction (expense) |

The UI will show a two-step selection: pick a category first, then pick a subcategory if one exists. All new subcategories map to existing locked ledger categories (`system_balance_correction`) tagged with a `sub_category` metadata field for reporting granularity.

**2. Add automated recurring payout toggle**

- Add a new database table `scheduled_payouts` to store recurring payout rules (user, amount, category, subcategory, frequency/date, enabled flag)
- After the CFO searches and selects a user, a toggle appears: "Automate this payout"
- When toggled ON, the CFO sets a recurrence schedule (e.g., monthly on day X)
- A cron-triggered edge function (`process-scheduled-payouts`) runs daily, finds due payouts, and executes them via the same `cfo-direct-credit` flow

### Files to Create/Edit

| File | Action |
|------|--------|
| `src/components/cfo/DirectCreditTool.tsx` | Restructure categories into parent/child, add subcategory selector, add automation toggle UI |
| `src/components/cfo/PayoutAutomationToggle.tsx` | **New** — toggle + schedule picker component |
| `supabase/functions/cfo-direct-credit/index.ts` | Accept `sub_category` field, pass through to ledger metadata |
| `supabase/functions/process-scheduled-payouts/index.ts` | **New** — cron function to execute due scheduled payouts |
| Database migration | Create `scheduled_payouts` table with RLS |

### Database: `scheduled_payouts` table

```text
id              uuid PK
created_by      uuid (CFO who set it up)
target_user_id  uuid
amount          numeric
category_id     text (e.g. 'operational_expense')
sub_category    text (e.g. 'salaries')
reason          text
frequency       text ('monthly')
day_of_month    int
enabled         boolean default true
last_run_at     timestamptz
next_run_at     timestamptz
created_at      timestamptz
```

RLS: Only CFO/super_admin can read/write. The cron edge function uses service role.

### How It Works

1. CFO opens "Pay Out to Any User's Wallet"
2. Selects "Platform → Wallet" (credit)
3. Picks a category (e.g., Operational Expenses)
4. Picks a subcategory (e.g., Salaries)
5. Searches and selects a user
6. Enters amount and reason
7. Optionally toggles "Automate this payout" — picks a day of month
8. Submits: immediate payout runs now, and if automated, a schedule is saved
9. Daily cron checks `scheduled_payouts` and auto-executes due ones

### Technical Notes

- All new subcategories use existing locked ledger categories (`system_balance_correction` for expenses) — no database category changes needed
- The `sub_category` label is stored in the ledger entry's `description` and `metadata` for reporting traceability
- Debit categories (Fee Collection, Penalty, etc.) remain unchanged
- The cron job reuses the same `cfo-direct-credit` edge function with service-role auth

