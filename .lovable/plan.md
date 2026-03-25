

## Filter COO Partners to Active Portfolios/Wallets Only

### Problem
Currently, the COO Partners page fetches **all** users with the `supporter` role, including those with no portfolios and empty wallets. This clutters the view with inactive partners.

### Solution
Filter the partner list after aggregation to only include partners who have:
- **Active portfolios** (`funded > 0` or `activeDeals > 0`), OR
- **Active wallet balance** (`walletBalance > 0`)

### Changes

**File: `src/components/coo/COOPartnersPage.tsx`**

1. After building `tableRows` (around line 290–309), add a `.filter()` before `.sort()` to exclude partners with zero funded amount AND zero wallet balance.

2. Update the summary metrics to reflect the filtered list (total partners count, active/suspended counts, etc.) while keeping `totalPartners` as the raw supporter count for context.

3. Add a small info badge in the summary showing "X of Y supporters shown (with active portfolios or wallets)" so the COO knows filtering is applied.

