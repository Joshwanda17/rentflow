# Reinvestment History View for Supporter Dashboard

## What it does

A new component showing the supporter their compounding history — every cycle where ROI was reinvested back into principal — with a visual timeline of principal growth over time.

## Data source

The `audit_logs` table already contains all reinvestment events:

- `action_type = 'roi_compounded'` (full compound)
- `action_type = 'roi_split_compound'` (split reinvestment, future)
- `metadata` includes: `roi_amount`, `new_principal`, `partner_id`, `reason`, `reference`, and for splits: `cash_amount`, `reinvest_amount`

Query: `audit_logs WHERE action_type IN ('roi_compounded', 'roi_split_compound') AND metadata->>'partner_id' = user.id ORDER BY created_at DESC`

## Implementation

### 1. Create `src/components/supporter/ReinvestmentHistory.tsx`

- Fetches audit_logs for the current user's reinvestment events
- Displays a **timeline view** with each entry showing:
  - Date of reinvestment
  - Amount reinvested (full ROI or split reinvest portion)
  - New principal after reinvestment
  - Type badge: "Full Compound" or "Split Reinvest"
  - Reference code
- **Principal growth chart** at the top: a simple line/area chart using existing data points (`new_principal` over time), grouped by portfolio
- Empty state when no reinvestments exist yet

### 2. Add to Supporter Menu Drawer

- Add a "Reinvestment History" menu item in `SupporterMenuDrawer.tsx`
- Routes to `/reinvestment-history`

### 3. Create route page `src/pages/ReinvestmentHistory.tsx`

- Simple page wrapper that renders the `ReinvestmentHistory` component
- Back navigation to dashboard
- add the page as a menu item in the coo dashboard and card button in the partner Ops

### Files changed

- **Create**: `src/components/supporter/ReinvestmentHistory.tsx`
- **Create**: `src/pages/ReinvestmentHistory.tsx`
- **Edit**: `src/components/supporter/SupporterMenuDrawer.tsx` — add menu item
- **Edit**: `src/App.tsx` — add route