

## Send the deposit-confirmation email from the CFO "Pay Out to Any User's Wallet" → ROI Payout flow, using a real trackable PAY- reference

### What's wrong today

The CFO has **two separate ROI payout entry points**, and only one currently sends the email:

| Entry point | Edge function | Reference ID | Sends `partner-wallet-deposit` email? |
|---|---|---|---|
| **Queue:** "ROI Requests" tab (COO-approved partner payouts) | `approve-wallet-operation` | `PAY-MO8DYAFP-C0T6` (COO-generated, stored on `pending_wallet_operations.reference_id`) | ✅ Yes — already correct, uses `op.reference_id` |
| **Ad-hoc:** "Pay Out to Any User's Wallet" → category **ROI Payout - Expense** | `cfo-direct-credit` | **None generated today** | ❌ No email at all |

The ad-hoc tool the user tested is the second row. It writes ledger entries directly, never creates a `pending_wallet_operations` row, never generates a `PAY-...` reference, and never sends the partner email — so any email the user received from that screen would either be missing or have a fallback ID like `op.id` from another test run. That is what they're describing.

### Fix (one file)

**`supabase/functions/cfo-direct-credit/index.ts`** — add ROI-payout-aware reference generation + email send. No DB schema changes, no other edge functions touched.

1. **Generate a real PAY- reference for every CFO direct credit**, in the same exact format the COO uses (`COOPartnersPage.generateRef('PAY')` → `PAY-{base36(Date.now())}-{4 random base36}`). Store it:
   - in the ledger entries' `reference_id` column (both legs), so it's traceable in `general_ledger`
   - in the `audit_logs.metadata.reference_id` field
   - returned in the response so the toast can show `Ref: PAY-…` like the COO toast does

2. **When the credit is an ROI payout** (detected by `wallet_category === 'roi_wallet_credit'` or `platform_category === 'roi_expense'`), send the `partner-wallet-deposit` email to the target user using the **exact same template payload shape** already used by `approve-wallet-operation`:
   - `transaction_id` = the new `PAY-…` ref (the trackable one)
   - `amount` = the credited amount
   - `date` = today, formatted `dd MMMM yyyy`
   - `wallet_id_last4` = last 4 chars of the recipient's `wallets.id` (hyphens stripped)
   - `partner_name` = `targetProfile.full_name`
   - `source` = `"Platform"` (per prior memory rule, never `"CFO Direct Credit"`)
   - `currency` = `"UGX"`, `company_name` = `"Welile"`, `logo_url` = the existing Welile logo URL
   - Idempotency key = `partner-wallet-deposit-cfo-${groupId}` so re-tries don't duplicate

3. **Email send rules** (mirror `approve-wallet-operation`):
   - Skip if `targetProfile.email` is missing
   - Wrap in try/catch — never block the credit response on email failure
   - Only send for the `credit` operation (debits don't get a deposit email)

### Out of scope

- The COO→CFO queue email path (`approve-wallet-operation`) is **already correct** — `op.reference_id` is the COO-generated `PAY-…` and the email uses it. No change there.
- No other CFO categories (marketing, payroll, tax, etc.) get the deposit email — only `roi_wallet_credit` / `roi_expense`.
- No changes to the email template itself, no DB migrations, no UI changes.

### Files touched

- `supabase/functions/cfo-direct-credit/index.ts` — add `generateRef('PAY')` helper, attach `reference_id` to ledger entries + audit log + response, send `partner-wallet-deposit` email when category is ROI.

### Why this lets you track it

After the fix, every ROI payout — whether it comes from the COO queue OR the ad-hoc CFO tool — produces a single `PAY-XXXXXXXX-XXXX` reference that appears in:
- The CFO toast shown after approval/credit
- The `general_ledger.reference_id` column on both legs of the transaction
- The `audit_logs.metadata.reference_id`
- The `transaction_id` field of the email the partner receives

Searching that one string in any of those four places returns the same payout — fully traceable end-to-end.

