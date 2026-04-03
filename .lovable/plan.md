## Partner Financial Activity Page — Partner Ops 

### What we're building

A new dedicated page accessible from Partner Ops that shows **all financial activity** for partners in one advanced table. This consolidates:

this must also appear in the COO dashboard sidebar menu item

- **ROI Payouts** (from `pending_wallet_operations` where operation_type contains 'roi')
- **Wallet Withdrawals** (from `pending_wallet_operations` where category is 'withdrawal')
- **Top-ups** (from `pending_wallet_operations` where operation_type contains 'topup')
- **Wallet Deductions/Retractions** (from `wallet_deductions`)
- **Ledger entries** (from `general_ledger` filtered to partner-related categories)

Each record shows status (pending/approved/rejected), amount, partner name, date, type, and reference.

### Changes

**1. New component — `src/components/executive/PartnerFinancialActivity.tsx**`

- Query `pending_wallet_operations` (all partner-related ops) and `wallet_deductions` 
- Join with `profiles` to get partner names
- Normalize into a unified row format: `{ type, partner_name, amount, status, date, reference, description }`
- Use `ExecutiveDataTable` with columns: Type, Partner, Amount, Status, Date, Reference, Description
- Filters: dropdown for type (Payouts, Withdrawals, Top-ups, Retractions, All), dropdown for status (Pending, Approved, Rejected, All)
- Status badges: color-coded (green=approved, yellow=pending, red=rejected)
- CSV + PDF export via ExecutiveDataTable built-in

**2. Update — `src/components/executive/PartnersOpsDashboard.tsx**`

- Add a new button card above the tab bar (similar to the Nearing Payouts highlight card)
- Card: icon `Receipt`, label "Financial Activity", description "View all partner payouts, withdrawals, top-ups & retractions"
- Clicking it sets a new view state that renders `PartnerFinancialActivity` inline with a "Back to Overview" header
- Add `'activity'` to the Tab type union for state management

**3. No database changes needed**
All data already exists in `pending_wallet_operations`, `wallet_deductions`, and `general_ledger`. Executive RLS policies were just added.

### Files


| File                                                    | Action                                 |
| ------------------------------------------------------- | -------------------------------------- |
| `src/components/executive/PartnerFinancialActivity.tsx` | New — unified financial activity table |
| `src/components/executive/PartnersOpsDashboard.tsx`     | Add nav card + wire activity view      |
