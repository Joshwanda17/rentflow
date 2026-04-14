

## Plan: Advance Payout Date on Compound & Update Confirmation UI

### Problem
When compounding a partner's ROI, the `next_roi_date` stays stale. The confirmation dialog shows "Unchanged (until CFO approves)" — which is misleading since compounding doesn't require CFO approval. Partners appear overdue immediately after compounding.

### What Changes

**1. Both compound handlers advance `next_roi_date` by +1 month**

In `src/components/coo/COOPartnersPage.tsx`, update the two compound functions:

- **`handlePortfolioCompound`** (line 328) — the portfolio detail view compound
- **`handleCompound`** (line 2742) — the nearing-payout section compound

Both currently do:
```typescript
.update({ investment_amount: newAmount })
```

Change to:
```typescript
const currentDate = new Date(portfolio.next_roi_date || new Date());
const newDate = new Date(currentDate);
newDate.setMonth(newDate.getMonth() + 1);

.update({ investment_amount: newAmount, next_roi_date: newDate.toISOString().split('T')[0] })
```

This advances the payout date by exactly 1 month, matching the same logic used by CFO approval.

**2. Confirmation dialog shows the new date**

Update the compound preview dialog (line 2239–2242). Replace:
```
"Unchanged (until CFO approves)"
```
With the calculated new date:
```
"May 15, 2026" (formatted from current next_roi_date + 1 month)
```

Also update `compoundPreview` state to include `nextRoiDate` so the dialog can display it.

**3. Update notifications and audit logs**

Include the new payout date in the notification message and audit metadata so there's a clear trail.

### Files

| File | Action |
|------|--------|
| `src/components/coo/COOPartnersPage.tsx` | **Edit** — advance `next_roi_date` in both compound handlers, update preview dialog text |

### Impact

- **Partners**: No longer appear as "OVERDUE" immediately after compounding — their next payout date moves forward 1 month
- **Operations/COO**: Confirmation dialog now shows the exact new payout date for transparency
- **Audit trail**: New date is recorded in audit logs and notifications
- **CFO workflow**: Unaffected — CFO approval still advances date on regular payouts as before
- **Ledger**: Unchanged — same double-entry `roi_expense`/`roi_reinvestment` pattern

