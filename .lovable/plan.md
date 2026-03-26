## Partner Ops Dashboard — Card-Based Navigation Redesign

### Problem

The current Partner Ops dashboard dumps everything on one long scrolling page (KPIs, escalations, directory, capital flow, churn alerts, portfolio table, ROI history). This is cluttered and hard to navigate, especially on mobile.

### Solution

Adopt the COO dashboard's card-based navigation pattern: a clean overview with color-coded quick-nav cards that open dedicated sub-views. All existing components are reused — no new data sources or database tables.

### Navigation Cards (Overview Grid)


| Card              | Icon          | Existing Component                               | Color      |
| ----------------- | ------------- | ------------------------------------------------ | ---------- |
| Portfolios        | Wallet        | `ExecutiveDataTable` (portfolio table + dialogs) | Blue       |
| Escalations       | AlertTriangle | Escalation alerts section                        | Red/Orange |
| Partner Directory | Users         | `PartnerDirectory`                               | Emerald    |
| Capital Flow      | DollarSign    | `PartnerCapitalFlow`                             | Indigo     |
| ROI Payouts       | TrendingUp    | `ROIPaymentHistory` + link to ROI Trends         | Purple     |
| Churn Alerts      | Shield        | `PartnerChurnAlerts`                             | Amber      |


### Overview Page Shows

1. **Daily Brief** — `PartnerOpsBrief` (compact, stays on overview)
2. **KPI strip** — 4 key metrics in a responsive grid (Total Partners, Active Portfolios, Total Invested, Pending Approval as highlight)
3. **Quick Nav Grid** — 2-col mobile / 3-col desktop, same card style as COO
4. **Escalation count badge** on the Escalations card if any are open

### Sub-Views

Each card navigates to a dedicated view with:

- Mobile "Back to Overview" button (same pattern as COO)
- Section header with icon
- The corresponding component rendered full-width

The **Portfolios** sub-view includes the toolbar (New Portfolio, Bulk Actions), the data table, and all dialogs (Edit, Fund, Create, Change Maturity). This keeps the heaviest UI off the overview.

### Technical Approach

**File: `src/components/executive/PartnersOpsDashboard.tsx**` — Full rewrite using the COO pattern:

- `useState('overview')` for active tab
- `quickNavItems` array defining the 6 cards
- `renderContent()` switch statement routing to sub-views
- All existing hooks (portfolios query, escalations query, mutations) remain but are conditionally loaded only when their sub-view is active
- Auto-renew logic stays at the top level (runs regardless of active tab)

**No new files needed** — all sub-components already exist. The refactor is purely in `PartnersOpsDashboard.tsx`.

### Responsive Behavior

- **Mobile (< 768px)**: 2-column nav grid, back button on sub-views, stacked KPIs
- **Desktop**: 3-column nav grid, all content wider, KPIs in a 4-col row
- where needed add the info icon with information.