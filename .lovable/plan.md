

## Plan: Debt Recovery for Unauthorized Withdrawal Payouts

### Context
The screenshot shows rejected withdrawals with a "Re-Approve & Complete" button. The current flow re-approves and pays out again via the `approve-withdrawal` edge function. The new requirement adds a **debt recovery path** so that when a rejected withdrawal was already physically paid out, re-approval records the amount as a debt and progressively recovers it from future wallet credits.

### What Changes

**1. New Database Table: `debt_recovery_cases`**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| withdrawal_request_id | uuid UNIQUE | Links to the rejected withdrawal (prevents duplicates) |
| user_id | uuid | The user who owes |
| original_amount | numeric | Full unauthorized payout amount |
| recovered_amount | numeric default 0 | Running total recovered so far |
| remaining_amount | numeric | Generated column: original_amount - recovered_amount |
| recovery_percentage | integer default 20 | Configurable per case (10%, 20%, etc.) |
| status | text default 'active' | active, completed, paused |
| created_by | uuid | Admin who initiated recovery |
| created_at, updated_at | timestamptz | |

RLS: Only staff roles can read/write. Enable realtime not needed.

**2. New Database Table: `debt_recovery_deductions`**

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| case_id | uuid FK → debt_recovery_cases | |
| user_id | uuid | |
| amount | numeric | Amount deducted this cycle |
| ledger_txn_group_id | text | Links to general_ledger |
| remaining_after | numeric | Remaining debt after this deduction |
| created_at | timestamptz | |

**3. New Ledger Category: `debt_recovery`**
- Add to `validate_ledger_category` allowlist
- Add to `LOCKED_CATEGORIES` in `ledgerConstants.ts`
- Wallet scope `cash_out` from user = reduces user balance
- Platform scope `cash_in` = platform recovers money (reduces "Money We Owe")

**4. Update `approve-withdrawal` Edge Function**
When a rejected withdrawal is re-approved for recovery:
- Accept a new optional body param: `recovery_mode: true`
- Instead of deducting from wallet and paying out again, it:
  - Updates withdrawal status to `re_approved_for_recovery`
  - Creates a `debt_recovery_cases` record with the full amount
  - Logs audit entry with action_type `debt_recovery_initiated`
  - Does NOT create ledger withdrawal entries (no money leaves)

**5. New Edge Function: `process-debt-recovery`**
Called by the daily cron (or triggered on wallet credit events):
- Fetches all `active` debt_recovery_cases
- For each case, checks user's current wallet balance
- Calculates deduction: `MIN(balance, remaining * recovery_percentage / 100)`
- If deduction > 0:
  - Creates ledger entries (user `cash_out` wallet / platform `cash_in`) with category `debt_recovery`
  - Description: "Debt Recovery – Unauthorized Withdrawal Adjustment"
  - Records in `debt_recovery_deductions`
  - Updates `recovered_amount` on the case
  - If fully recovered, sets status to `completed`
- All deductions logged in `audit_logs`

**6. Update `FinOpsWithdrawalVerification.tsx` (Rejected Tab)**
- Change "Re-Approve & Complete" button to show two options:
  - **"Re-Approve & Pay Out"** (existing flow — for cases where money was NOT already paid)
  - **"Flag for Debt Recovery"** (new flow — for cases where money WAS already paid out)
- "Flag for Debt Recovery" opens a dialog:
  - Shows user name, amount
  - Recovery percentage selector (10%, 20%, 30%, 50%)
  - Confirm button
  - Calls `approve-withdrawal` with `recovery_mode: true`

**7. New UI Component: `DebtRecoveryPanel.tsx`**
- Added to Financial Ops Command Center
- Shows active recovery cases with:
  - User name, original amount, recovered so far, remaining
  - Progress bar
  - Option to pause/resume or adjust percentage
- Shows completed cases in a separate tab

**8. Wallet Transparency (User-Facing)**
- Each `debt_recovery` ledger entry visible in user's transaction history
- Description clearly states "Debt Recovery – Unauthorized Withdrawal Adjustment"
- User can see original debt and remaining balance in their wallet transactions

### Financial Statement Impact
- `debt_recovery` with `cash_in` on platform scope = reduces "Money We Owe" (the unauthorized payout was a liability)
- Properly reconciles the platform balance sheet

### Controls & Validation
- `withdrawal_request_id` UNIQUE constraint prevents duplicate recovery cases
- Recovery percentage configurable per case
- Deductions capped to available balance (never go negative)
- Full audit trail in `audit_logs` and `debt_recovery_deductions`

### Technical Details

```text
Flow: FinOps clicks "Flag for Debt Recovery"
  → approve-withdrawal (recovery_mode=true)
    → withdrawal_requests.status = 're_approved_for_recovery'
    → INSERT debt_recovery_cases
    → INSERT audit_logs

Daily Cron / Wallet Credit Trigger:
  → process-debt-recovery
    → For each active case:
      → Check wallet balance
      → Deduct MIN(balance, remaining * pct / 100)
      → Ledger: user cash_out (wallet) + platform cash_in
      → Update recovered_amount
      → If remaining = 0 → status = 'completed'
```

### Files Changed
- **Migration SQL**: Create `debt_recovery_cases`, `debt_recovery_deductions`, update `validate_ledger_category`
- **`supabase/functions/approve-withdrawal/index.ts`**: Add `recovery_mode` branch
- **`supabase/functions/process-debt-recovery/index.ts`**: New edge function
- **`src/lib/ledgerConstants.ts`**: Add `debt_recovery`
- **`src/components/financial-ops/FinOpsWithdrawalVerification.tsx`**: Add debt recovery option on rejected cards
- **`src/components/financial-ops/DebtRecoveryPanel.tsx`**: New management panel
- **`src/components/financial-ops/FinancialOpsCommandCenter.tsx`**: Include DebtRecoveryPanel

