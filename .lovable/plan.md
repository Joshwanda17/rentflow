# Redesign Partner Operations Dashboard

## What Changes

Replace the current QuickNavGrid-based overview with a design modeled on the COO Partners Page — a unified, data-rich dashboard with summary cards, inline filters, tabbed sub-sections, and direct access to all partner operations from one screen.

## New Layout (Top → Bottom)

### A. Header Bar

- Title "Partner Operations" with subtitle, Refresh button, and Create Portfolio button (right-aligned)
- Matches COO Partners Page header pattern

### B. Daily Brief Strip

- Keep the existing `PartnerOpsBrief` component at the top (already matches the design language)

### C. Summary Cards Row (4 cards, `grid grid-cols-2 lg:grid-cols-4`)

Using the COO-style `SummaryCard` pattern (rounded-2xl, accent borders, icon pill):

1. **Total Portfolios** — count of all portfolios (primary accent)
2. **Active Portfolios** — count of active ones (emerald accent)
3. **Total Invested** — formatted sum (amber accent)
4. **Nearing Payouts** — clickable card showing count of portfolios due in 7 days, opens the existing nearing payouts dialog (violet accent). If pending approvals > 0, this card swaps to show pending approvals with a warning accent.

### D. Tabbed Navigation (replaces QuickNavGrid)

Horizontal scrollable tab bar with pill-style tabs:

- **Portfolios** (default) — renders the COOPartnersPage inline (the full partner table with all its filters, detail views, actions)
- **Escalations** — renders escalation cards (existing logic)
- **Directory** — renders PartnerDirectory
- **Capital Flow** — renders PartnerCapitalFlow
- **ROI Payouts** — renders ROIPaymentHistory
- **Churn Alerts** — renders PartnerChurnAlerts

Each tab shows a badge count where relevant (escalations count, churn alerts).

### E. Escalation Banner (conditional)

When there are open escalations and user is NOT on the Escalations tab, show a slim alert banner below the tabs: "{N} open escalations — tap to review". Clicking switches to the Escalations tab.

## Implementation Details

### File: `src/components/executive/PartnersOpsDashboard.tsx`

1. **Remove** QuickNavGrid import and usage, remove the view state machine (`type View`), remove `renderContent()` switch pattern
2. **Add** a `tab` state with values: `'portfolios' | 'escalations' | 'directory' | 'capital' | 'roi' | 'churn'`, default `'portfolios'`
3. **Replace** KPICard usage with inline summary cards matching COO pattern (`rounded-2xl border p-4` with accent colors)
4. **Add** horizontal tab bar using a scrollable flex container with pill buttons (active state: `bg-primary text-primary-foreground`, inactive: `bg-muted/50 text-muted-foreground`)
5. **Render** the selected tab's component directly below (no BackButton needed — tabs handle navigation)
6. **Keep** all existing dialog mounts (Edit, Fund, Create, Maturity) at the bottom
7. **Keep** auto-renew logic and all action handlers unchanged
8. **Remove** the tooltip info section at the bottom (unnecessary with tabs)

### Responsive Behavior

- Summary cards: 2-col on mobile, 4-col on desktop
- Tab bar: horizontally scrollable on mobile with `overflow-x-auto scrollbar-hide`
- All sub-components already handle their own responsiveness

## Files Changed

- `src/components/executive/PartnersOpsDashboard.tsx` — full redesign of layout and navigation

## No database changes needed

keep the table as it's just remove suspend partner,, delete partner, top-up and delete portfolios.