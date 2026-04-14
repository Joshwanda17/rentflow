

## Add Renew & Delete Actions to CFO Advance Management

### Problem
The CFO Advance Management tab has select + delete functionality that applies globally, but the user wants:
1. **Completed advances**: Select → **Renew** (re-issue the advance with same agent/terms)
2. **All advances**: Select → **Delete** (already exists but needs to be more visible per-tab)

### Plan

**File: `src/components/cfo/CFOAdvancesManager.tsx`**

1. **Add "Renew" state and dialog** — when completed advances are selected, show a "Renew" button that opens IssueAdvanceSheet pre-filled with the selected advance's agent ID. On renewal, set the old advance status to `renewed` or keep as `completed`.

2. **Add a `renewDialogOpen` state** and a `renewAgentId` state. When the user selects completed advances and clicks "Renew", open IssueAdvanceSheet with `preselectedAgentId` set to the first selected advance's agent.

3. **Conditional action bar** — show context-aware buttons based on the current tab filter:
   - On the **Completed** tab: show "🔄 Renew (N)" and "🗑 Delete (N)" buttons
   - On other tabs: show "🗑 Delete (N)" button only
   - Both only appear when `selectedIds.size > 0`

4. **Clear selection on tab change** — reset `selectedIds` when the filter tab changes.

5. **Renew handler** — for bulk renew, open the IssueAdvanceSheet pre-filled with the first selected agent. For single renew, same behavior. The old completed advance stays as-is (historical record).

### Technical Details

- Reuse existing `IssueAdvanceSheet` with its `preselectedAgentId` prop
- Move action buttons into a sticky action bar that appears when items are selected
- Add `RefreshCw` icon import for the renew button
- Reset selections on tab switch via `onValueChange` callback

