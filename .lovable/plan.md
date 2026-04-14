

## Rename "Approved Top-up" badge to "Pending Principal"

The approved top-up has been verified but not yet merged into the portfolio's active principal — it will only be applied at the next ROI cycle. The badge should reflect this state clearly.

### Changes in `src/components/coo/COOPartnersPage.tsx`

1. **Header badge** (line ~1680): Change from `✅ Approved Top-up {amount}` to `⏳ Pending Principal +{amount}` with amber/orange styling instead of green, since the funds are not yet active.

2. **Detail badge** (line ~1741): Change from `✅ X approved top-up(s): {amount} — applied at next ROI cycle` to `⏳ X pending principal addition(s): {amount} — merges at next ROI cycle`

3. **Badge color**: Switch from emerald (green) to a blue or amber tone to distinguish "pending principal" (waiting to merge) from fully applied capital. Amber is more appropriate since it signals "in progress / waiting".

### Result
- Badge reads: `⏳ Pending Principal +USh 1,000,000`
- Detail reads: `⏳ 1 pending principal addition: USh 1,000,000 — merges at next ROI cycle`
- Clearly communicates that approved funds are parked and will be picked up by the merge engine

