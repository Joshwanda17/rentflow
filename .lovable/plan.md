

# CFO Payouts in Financial Statements

## Problem
Several CFO-approved payout categories are recorded in the general ledger but **not captured** by the financial statement aggregation logic. This means the Income Statement and Cash Flow understate expenses.

### Missing Categories

| Ledger Category | Source | Currently Captured? |
|---|---|---|
| `platform_expense_disbursement` | Financial agent transfers | No |
| `salary_payment` | Payroll disbursements | No |
| `employee_advance` | Payroll advances | No |
| `agent_requisition` | Agent fund requisitions (via `pending_wallet_operations`) | No |
| `listing_bonus` (uses `platform_expense`) | House listing bonuses | Yes (already in `operatingExpenses`) |
| `roi_payout` | Partner ROI payments | Yes (already in `platformRewards`) |
| `agent_commission` | Agent commissions | Yes (already in `agentCommissions`) |

## Changes

### File: `src/hooks/useFinancialStatements.ts`

**1. Add new expense line items to the Income Statement data structure**

Update `IncomeStatementData` interface to break operating expenses into sub-categories:
- `operatingExpenses` → split into:
  - `generalOperating` (existing `operational_expenses`, `platform_expense`)
  - `payrollExpenses` (new: `salary_payment`, `employee_advance`)
  - `agentRequisitions` (new: `agent_requisition`)
  - `financialAgentExpenses` (new: `platform_expense_disbursement`)

**2. Update aggregation logic (lines 250-260)**

Add new `sumWithDirectionFallback` calls:
```
payrollExpenses = sumWithDirectionFallback(platformOut, platformIn, ['salary_payment', 'employee_advance'])
agentRequisitions = sumWithDirectionFallback(platformOut, platformIn, ['agent_requisition'])
financialAgentExpenses = sumWithDirectionFallback(platformOut, platformIn, ['platform_expense_disbursement'])
```

Update `operatingExpenses` to include all sub-items in the total.

**3. Add these categories to `PLATFORM_CATEGORIES` in `approve-wallet-operation` (line 134)**

Ensure `agent_requisition`, `salary_payment`, `employee_advance`, `platform_expense_disbursement` are scoped as `platform` so they appear in platform-scoped queries.

**4. Add to `costCategories` array (line 304)**

Include the new categories in the Balance Sheet's all-time cost calculation.

**5. Update Cash Flow data structure and logic**

Add explicit line items under Operating Activities:
- `payrollPaid` 
- `agentRequisitionsPaid`
- `financialAgentExpensesPaid`

These feed into `netOperating` calculation.

### File: `src/components/manager/FinancialStatementsPanel.tsx`

**6. Update `IncomeStatementSection`**

Add new line items under Operating Expenses:
```
<LineItem label="Payroll & Staff Costs" ... />
<LineItem label="Agent Requisitions" ... />
<LineItem label="Financial Agent Expenses" ... />
<LineItem label="General Operating Expenses" ... />
<LineItem label="Total Operating Expenses" ... bold />
```

**7. Update `CashFlowSection`**

Add corresponding outflow lines under Platform Operating Activities:
```
<LineItem label="Payroll Paid" ... />
<LineItem label="Agent Requisitions Paid" ... />
<LineItem label="Financial Agent Expenses Paid" ... />
```

**8. Update CSV export rows**

Add the new line items to both Income Statement and Cash Flow CSV export sections.

### File: `supabase/functions/approve-wallet-operation/index.ts`

**9. Add missing categories to `PLATFORM_CATEGORIES` array (line 134)**

Add: `'agent_requisition'`, `'salary_payment'`, `'employee_advance'`, `'platform_expense_disbursement'`

This ensures these entries get `ledger_scope: 'platform'` and appear in financial statement queries.

## Summary

| Area | Change |
|---|---|
| Data types | Add sub-fields to `IncomeStatementData` and `CashFlowData` |
| Aggregation | 3 new `sumWithDirectionFallback` calls for missing categories |
| Income Statement UI | 4 new line items under Operating Expenses |
| Cash Flow UI | 3 new outflow line items |
| CSV export | Matching new rows |
| Edge function | Add categories to `PLATFORM_CATEGORIES` for correct scoping |

**Files changed:** `useFinancialStatements.ts`, `FinancialStatementsPanel.tsx`, `approve-wallet-operation/index.ts`

