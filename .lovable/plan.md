## Goal

Make the four highlighted dropdown filters in the **Partner Management Table** (`All Wallets`, `Status (Filter)`, `Compounding/ROI Mode`, `Contact (Phone)`) actually work across the entire dataset — not just the currently visible page.

## Current behavior (the bug)

- The partners table loads **50 rows per page** from the server (server-side pagination, scoped only to the search box).
- The four Select filters and sorting run **client-side over `rows`** — meaning over only the 50 rows on screen.
- Result: picking `Compounding`, `Has Phone`, `Has Balance`, or `Suspended` often shows "No matching partners found" (or only a handful) even when many matches exist on other pages. The pager also collapses to "1/1", hiding the rest of the data.
- The Payout Range filter already has the correct fix (it pre-fetches all matching IDs across pages into `allRowsForPayoutFilter`). The other four filters do not.

## Fix

Extend the existing "fetch all matching IDs across pages" pattern to also activate whenever **any** local filter (status, ROI mode, contact, wallet) is engaged — not just the payout date range.

### Technical changes (single file: `src/components/coo/COOPartnersPage.tsx`)

1. **Rename + repurpose** `allRowsForPayoutFilter` → `allRowsForLocalFilter` (and its loading flag) so it represents "all rows across pages, scoped to current search" whenever ANY local filter is active.

2. **Update the prefetch `useEffect`** (currently keyed on `payoutDateFrom/payoutDateTo`) to trigger on **any** of:
   - `filterStatus !== 'all'`
   - `filterRoiMode !== 'all'`
   - `filterContact !== 'all'`
   - `filterWallet !== 'all'`
   - `payoutDateFrom || payoutDateTo`
   
   When none are active, clear `allRowsForLocalFilter` and fall back to the paged `rows`.

3. **`processed` memo**: source from `allRowsForLocalFilter ?? rows` whenever any local filter is active (already partially done for payout). Apply all filters against that source.

4. **Pager**: `hasLocalFilter` already collapses `totalPages` to 1 — keep that behavior so the user sees the complete filtered set on a single virtual page (consistent with how Payout Range works today).

5. **Loading + empty states**:
   - While `loadingAllRowsForLocalFilter` is true, show skeleton rows (reuse the existing `isSearching` skeleton path).
   - Empty state copy: distinguish "No partners match the selected filters" (already present) from "Loading filtered partners…".

6. **Result counter** (`{processed.length} of {rows.length} (filtered)`): when filtering across all pages, compare against `totalCount` instead of `rows.length` so the counter reads e.g. "37 of 1,240 (filtered)" rather than "37 of 50".

7. **No changes** to: search debounce, server pagination, column memoization, CSV export logic (already correct — it re-fetches all matching partners and re-applies filters).

### Files affected

- `src/components/coo/COOPartnersPage.tsx` (only)

## Out of scope

- The `Payout Range`, `Import`, `Update Dates`, `Export CSV` buttons — already working.
- Search box behavior — already optimized in the previous turn.
- Any backend/RPC changes — purely client-side wiring.

## Expected result

Picking `Compounding`, `Suspended`, `Has Phone / No Phone`, or `Has Balance / Empty` (alone or combined with Payout Range and Search) returns the **complete** matching set across all pages, with an accurate counter and no false "No matching partners found".