

## Fix: Double-Credit Impact on Onesmus's Deposit

### What Happened

This is the same deposit double-credit bug we just fixed. When Onesmus's 60k deposit was approved, the old `approve-deposit` function:

1. **Manually credited** 60k to the wallet
2. **Trigger chain** (`trg_deposit_to_ledger` → `sync_wallet_from_ledger`) credited another 60k
3. Wallet showed 120k instead of 60k
4. The auto-rent-deduction logic then saw 120k available and deducted 120k toward rent

Result: 120k was applied to rent repayment when only 60k was actually deposited. The rent request's `amount_repaid` is now inflated by 60k.

### Status of the Root Cause Fix

The `approve-deposit` edge function has already been patched — the manual wallet credit was removed. **No new deposits will be double-credited.** However, the function needs to be redeployed if it hasn't been already.

### Data Correction Needed

We need to reverse the excess 60k that was incorrectly applied:

1. **Identify the affected records** — Query Onesmus's ledger entries and the specific deposit request to confirm the exact amounts
2. **Reverse the excess rent repayment** — Reduce `rent_requests.amount_repaid` by 60k (the overpayment)
3. **Insert a corrective ledger entry** — A `cash_in` entry of 60k (category: `balance_correction`) to restore the wallet to the correct post-deposit state
4. **Audit log** the correction with full metadata

### Changes

**Database migration (data correction):**
- Query to identify Onesmus's affected deposit and the double-credited amount
- Corrective `UPDATE` on `rent_requests.amount_repaid` (-60k)
- Corrective `INSERT` into `general_ledger` (+60k cash_in, category `balance_correction`)
- Insert audit trail entry

**Edge function redeployment:**
- Confirm `approve-deposit` is deployed with the fix (no manual wallet credit)

### Before Proceeding

I need to query the database to identify Onesmus's exact user ID, the affected deposit request, and confirm the amounts before writing the correction. Shall I proceed?

