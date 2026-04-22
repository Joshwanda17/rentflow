

## Add sorting to bulk transfer preview

Add sortable columns to the confirmation dialog preview list in `src/components/executive/TenantAgentLinker.tsx` so you can reorder the affected rent requests by **Request ID**, **Current Agent**, or **Amount** before confirming.

### What changes

In the `AlertDialog` preview (the 3-column grid showing rows being moved):

- Make the existing **Request ID**, **Current Agent**, **Amount** header labels clickable buttons.
- Clicking a header sorts by that column; clicking again toggles asc/desc. Active column shows an `ArrowUp`/`ArrowDown` icon, inactive columns show a faded `ArrowUpDown` icon (matching the pattern already used in `ExecutiveDataTable`).
- Default sort: **Amount, descending** (largest outstanding first — most useful at confirm time).
- Sort state resets each time the dialog reopens so it doesn't leak between transfers.

### Sort logic

| Column | Comparator |
|---|---|
| Request ID | `String(a.id).localeCompare(b.id)` |
| Current Agent | Resolved agent display name via existing `agents` lookup, then `localeCompare` |
| Amount | Numeric `a.outstanding - b.outstanding` |

The sorted array is derived with `useMemo` from `movingRequests` + `sortKey` + `sortDir` so it doesn't recompute on unrelated re-renders. The underlying `movingRequests` filter, the validation logic (`canSubmitTransfer`, `sameAgent`, `hasMovableRequests`), and the actual `transferAllMutation` payload are unchanged — sorting is display-only.

### Files to change

- `src/components/executive/TenantAgentLinker.tsx` — add `previewSortKey` / `previewSortDir` state, `sortedMovingRequests` memo, dialog-open reset effect, and convert the three header cells into sort buttons with arrow icons (`ArrowUp`, `ArrowDown`, `ArrowUpDown` from `lucide-react`).

