

# Add Collection History Log to TenantRentCollector

## What Changes

Add a "Collection History" section below the active rent requests that queries the `general_ledger` for past rent collection entries for the selected tenant, showing a chronological log of all manual and auto collections.

## Data Source

Query `general_ledger` where:
- `user_id = selectedTenant.id`
- `ledger_scope = 'wallet'`
- `direction = 'cash_out'`
- `source_table = 'rent_requests'`
- Categories: `rent_repayment`, `rent_obligation`, etc.

Order by `transaction_date DESC`, limit 20.

## UI Design

A new card section titled "Collection History" with a compact table/list showing:
- **Date** — formatted `transaction_date`
- **Amount** — using `CompactAmount`
- **Category** — human-readable badge (e.g. "Rent Repayment", "Rent Obligation")
- **Description** — truncated ledger description
- Empty state when no history exists

## Implementation

**File:** `src/components/executive/TenantRentCollector.tsx`

1. Add a second `useQuery` for collection history, enabled when `selectedTenant` is set
2. Query `general_ledger` as described above
3. Render a "Collection History" section after the active requests block — a list of compact rows inside a Card, each showing date, amount, category badge, and description
4. Invalidate this query alongside the existing ones after a successful collection
5. Import `CompactAmount`, `History` icon, and date formatting utility

No database or backend changes needed.

