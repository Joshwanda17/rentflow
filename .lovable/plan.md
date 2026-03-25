

## Pending Portfolio Top-Up — Clean Column Approach

### Summary
Add an `operation_type` column to `pending_wallet_operations` to cleanly distinguish top-up deposits from regular operations. Top-ups are wallet-debited immediately but held as "pending" until portfolio maturity, then applied.

### Database Change

**Add column to `pending_wallet_operations`:**
```sql
ALTER TABLE public.pending_wallet_operations
  ADD COLUMN operation_type text NOT NULL DEFAULT 'standard';
```
- Values: `'standard'` (all existing records), `'portfolio_topup'` (new top-ups)
- Clean filtering: `WHERE operation_type = 'portfolio_topup' AND status = 'pending'`
- No impact on existing data — default covers all current rows

### Edge Function Changes

**1. `manager-portfolio-topup/index.ts`** — Stop increasing `investment_amount` directly. Instead:
- Deduct wallet immediately (existing behavior)
- Insert into `pending_wallet_operations` with `operation_type: 'portfolio_topup'`, `status: 'pending'`
- Record ledger entries with category `pending_portfolio_topup`
- Notification says "pending until maturity"

**2. `portfolio-topup/index.ts`** — Same change for self-serve partner top-ups

**3. New: `apply-pending-topups/index.ts`** — Called at maturity/renewal:
- Query `pending_wallet_operations` WHERE `operation_type = 'portfolio_topup'` AND `source_id = portfolio_id` AND `status = 'pending'`
- Sum amounts → increase portfolio `investment_amount`
- Update each record: `status = 'approved'`, set `reviewed_at`, `reviewed_by`
- Record activation ledger entries + notify partner

### Frontend Changes

**4. `COOPartnersPage.tsx`** — In the partner detail portfolio cards:
- Fetch pending top-ups per portfolio from `pending_wallet_operations` WHERE `operation_type = 'portfolio_topup'` AND `status = 'pending'`
- Show badge: "2 pending top-ups: UGX 5,000,000"
- Add "Apply Pending Deposits" button (visible when portfolio has matured and has pending top-ups)
- Button calls `apply-pending-topups` edge function

**5. `FundInvestmentAccountDialog.tsx`** — Update UI copy:
- Preview section shows "Pending until maturity" instead of "New Capital"
- Success toast indicates funds are secured but held

### Architecture

```text
Top-up initiated (COO or Partner)
  ├─ Wallet debited immediately
  ├─ pending_wallet_operations row created:
  │    operation_type = 'portfolio_topup'
  │    status = 'pending'
  │    source_id = portfolio_id
  │
  └─ On maturity/renewal:
       ├─ apply-pending-topups called
       ├─ SUM pending amounts → add to investment_amount
       └─ status → 'approved'
```

### Files affected
- **Migration**: Add `operation_type` column to `pending_wallet_operations`
- **Edge functions**: `manager-portfolio-topup` (update), `portfolio-topup` (update), `apply-pending-topups` (new)
- **Frontend**: `COOPartnersPage.tsx` (pending badge + apply button), `FundInvestmentAccountDialog.tsx` (copy updates)

