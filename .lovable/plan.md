

Let me first inspect the actual PDFs the user generated to see what's wrong, then check the data in the ledger to see what's actually there.

Plan of investigation:
1. Parse both PDFs to see exactly what's missing
2. Query general_ledger to see what categories actually have data
3. Compare what's shown vs what should be shown

Let me parse the PDFs and check the DB.

---

After inspection (I'll run these in plan execution):
- The current export queries `general_ledger` filtering by `category` and `ledger_scope='platform'`, then groups daily
- The list of categories shown in the pie comes from whatever appeared in the last-30-day window
- Likely problem: many GAAP expense categories (`marketing_expense`, `payroll_expense`, `general_admin_expense`, `research_development_expense`, `tax_expense`, `interest_expense`, `equipment_expense`) and revenue categories may have ZERO entries in last 30d so they don't appear in the pie at all → user sees "incomplete" report
- Also the breakdown in `RevenueExpenseDashboard` likely uses a hardcoded list of revenue/expense categories that excludes things like Welile Dowry, R&D, Marketing as standalone line items

## Plan: Make CFO Revenue/Expense reports show EVERY category, always

### Root cause
The current dashboard only lists categories that have transactions in the last 30 days. Empty categories (Marketing, R&D, Welile Dowry, Operations, Payroll, etc.) silently disappear from both the pie chart AND the per-category download list. So when the CFO clicks "Export All", they get a report missing the very categories they expected to audit.

### Fix — three layers

**Layer 1 — Use the canonical category list, not what happens to have data**

In `src/components/cfo/RevenueExpenseDashboard.tsx`:
- Define two explicit canonical lists pulled from `LOCKED_CATEGORIES`:
  - **Revenue categories**: `access_fee_collected`, `registration_fee_collected`, `agent_commission_earned` (platform side), `partner_commission`, plus any Welile Dowry / service income category that exists
  - **Expense categories**: `marketing_expense`, `payroll_expense`, `general_admin_expense`, `research_development_expense`, `tax_expense`, `interest_expense`, `equipment_expense`, `roi_expense`, `agent_commission_withdrawal`, `rent_disbursement`, `debt_recovery` (cash-out side)
- Always render every category in the breakdown list — even if total = UGX 0 — with a muted "No activity" pill
- Pie chart still only plots non-zero slices (cleaner visual) but the **download list is complete**

**Layer 2 — Confirm "Welile Dowry" exists as a category**

Welile Dowry isn't in the current `LOCKED_CATEGORIES` constant. I need to confirm with you:

→ Is "Welile Dowry" a NEW expense category we need to add to the locked allowlist + database validators, or is it an existing one under a different name (e.g., `general_admin_expense`)?

**Layer 3 — Improve the per-category PDF**

In `src/lib/categoryReportExport.ts`:
- When a category has zero transactions, the PDF currently says "No transactions in the last 30 days." → Keep this, but **also** include:
  - A "Why this category exists" block (1-line description per category, e.g., "Marketing Expense — costs of customer acquisition, ads, campaigns, brand activations")
  - The cumulative all-time total for that category (separate query) so the CFO sees "0 in last 30d, X total since launch"
- For the **All Categories** PDF (`exportAllCategoriesReport`), the summary table at the top now shows EVERY canonical category with its 30d total AND all-time total side-by-side, so nothing can silently disappear

### Files touched
1. `src/components/cfo/RevenueExpenseDashboard.tsx` — canonical category lists, render zero-activity rows, pass full list to "Export All"
2. `src/lib/categoryReportExport.ts` — per-category description map, all-time total query, richer summary table in combined PDF
3. `src/lib/ledgerConstants.ts` — add a `CATEGORY_DESCRIPTIONS` map + `REVENUE_CATEGORIES` / `EXPENSE_CATEGORIES` arrays so the same source of truth feeds the dashboard, the exports, and any future report
4. *(maybe)* New migration to add `welile_dowry_expense` to `LOCKED_CATEGORIES` — pending your answer above

### Out of scope
- Changing the pie chart visuals
- Date range picker (still fixed at 30 days for now — we can add 90d/YTD next)
- Other dashboards

### One quick question before I build
What exactly should "Welile Dowry" map to in the ledger?
1. A brand-new category I should add to `LOCKED_CATEGORIES` (e.g., `welile_dowry_expense`)
2. An alias for `general_admin_expense`
3. An alias for `marketing_expense`
4. Something else (please describe)

