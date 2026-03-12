

# Funder Wallet Section Enhancement

## What Changes

### 1. Wallet Balance Label — Replace emoji with Lucide icon
In `PortfolioSummaryCards.tsx`:
- Replace `💰` emoji with `<Wallet />` from lucide-react
- The `$` symbol comes from the SVG icon next to the balance (a dollar-sign path). Replace it with a `<Wallet />` Lucide icon instead.

### 2. Wallet Balance Click → New Wallet Details Sheet (not Investment Breakdown)
Currently clicking wallet balance opens `InvestmentBreakdownSheet` (shows portfolios). Change it to open a **new `WalletDetailsSheet`** that shows:

- **Wallet balance** prominently at the top
- **Wallet transaction history** below — fetched from `wallet_transactions` table, enriched with sender/recipient names from `profiles`

The existing `InvestmentBreakdownSheet` remains accessible from the "Supported" stat button.

### 3. New Component: `WalletDetailsSheet.tsx`
A bottom sheet showing:
- **Header**: Wallet icon + "My Wallet" title
- **Balance card**: Current wallet balance (formatted in UGX, no `$`)
- **Transaction list**: Scrollable list of `wallet_transactions` ordered by `created_at desc`, showing:
  - Direction indicator (sent vs received based on `sender_id` match)
  - Amount with +/- prefix and color coding
  - Description (if any)
  - Counterparty name (from profiles lookup)
  - Timestamp (relative + absolute)
  - Running context (e.g., "From: John" or "To: Mary")

### Files to Change

| File | Change |
|---|---|
| `src/components/supporter/PortfolioSummaryCards.tsx` | Replace `💰` with `<Wallet />` icon, replace `$` SVG with `<Wallet />`, wire balance click to new `WalletDetailsSheet` instead of `InvestmentBreakdownSheet` |
| `src/components/supporter/WalletDetailsSheet.tsx` | **New** — Bottom sheet with wallet balance + detailed transaction history |

