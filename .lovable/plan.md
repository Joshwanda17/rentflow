

## Filter Partners to Only Those with Active/Funded Portfolios

### Problem
Users with the `supporter` role but no portfolio funds appear in the COO Partners page and the Partners Ops directory. The COO Partners page currently includes users with just a wallet balance (no portfolio), which is also undesired.

### Changes

**1. `src/components/coo/COOPartnersPage.tsx`** (~line 309)
- Tighten the filter from `r.funded > 0 || r.activeDeals > 0 || r.walletBalance > 0` to **`r.funded > 0 || r.activeDeals > 0`** — removing the wallet-balance-only condition. A supporter must have funded portfolio capital to appear.

**2. `src/components/executive/PartnerDirectory.tsx`** (~line 157–176)
- After building the partner rows from `allProfiles.map(...)`, add a `.filter()` to exclude partners with no portfolio activity: **`totalInvested > 0 || activePortfolios > 0`**.
- This ensures the Partner Ops directory only lists supporters who have actual capital deployed.

### What stays the same
- The `PartnersOpsDashboard` main table already fetches from `investor_portfolios` directly, so it naturally only shows funded accounts.
- No database changes needed.

