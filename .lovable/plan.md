

## Wallet Retraction for Partners & CFO Visibility

### Summary
Add a "Cash Payout Retraction" category to the existing wallet deduction tool and create a dedicated CFO feed showing all wallet deductions with partner details.

### Changes

**1. Add retraction category — `src/components/financial-ops/WalletDeductionPanel.tsx`**
- Add `{ value: 'cash_payout_retraction', label: 'Cash Payout Retraction' }` to the `DEDUCTION_CATEGORIES` array

**2. Allow category server-side — `supabase/functions/wallet-deduction/index.ts`**
- Add `'cash_payout_retraction'` to the `validCategories` array (line 78-85)

**3. New component — `src/components/cfo/WalletRetractionsFeed.tsx`**
- Read-only feed querying `wallet_deductions` table
- Join with `profiles` twice: once for target user (partner name/phone), once for `deducted_by` (admin name)
- Display columns: Partner name, phone, amount, date/time, reason, performing admin, category badge
- Entries with `cash_payout_retraction` category get a highlighted badge labeled "Retracted from Partner Wallet"
- All other deduction categories also shown for full CFO visibility
- Filter/tab toggle to isolate retraction-specific entries
- Sorted by most recent first

**4. CFO sidebar nav — `src/components/layout/executiveSidebarConfig.ts`**
- Add under the Finance section: `{ label: 'Wallet Retractions', icon: Wallet, id: 'retractions' }`
- Import appropriate icon (reuse `Wallet` or add `MinusCircle` from lucide)

**5. CFO dashboard wiring — `src/pages/cfo/Dashboard.tsx`**
- Import `WalletRetractionsFeed`
- Add `case 'retractions': return <WalletRetractionsFeed />`
- Add a compact summary of recent retractions to the default overview section

### Files

| File | Action |
|------|--------|
| `src/components/financial-ops/WalletDeductionPanel.tsx` | Add category to array |
| `supabase/functions/wallet-deduction/index.ts` | Add category to valid list |
| `src/components/cfo/WalletRetractionsFeed.tsx` | New component |
| `src/components/layout/executiveSidebarConfig.ts` | Add nav item |
| `src/pages/cfo/Dashboard.tsx` | Wire tab + overview widget |

No database migrations needed.

