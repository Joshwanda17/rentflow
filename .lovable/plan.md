

# Make Currency Dynamic Across the App

## What This Does
When you switch currency (e.g. UGX to USD), all amounts everywhere in the app will update to show the selected currency with live exchange rates. Currently only a few places respond to the currency switcher — this fix covers the remaining ~290 files.

## How It Works

### Phase 1: Create standalone currency formatter (biggest impact)

**New file: `src/lib/currencyFormat.ts`**
- A non-React utility that reads the selected currency from `localStorage` (`welile-currency` key) and cached live rates (`welile-live-rates` key)
- Provides `formatDynamic(amountInUGX)` and `formatDynamicCompact(amountInUGX)` functions
- Falls back to UGX if no preference is set

**Update `formatUGX` in `src/lib/rentCalculations.ts`**
- Redirect to `formatDynamic()` — this single change fixes ~272 files instantly since they all import `formatUGX` from here

### Phase 2: Fix inline hardcoded formatters (~17 files)

Replace local `formatCurrency` / `formatUGX` definitions that use `new Intl.NumberFormat('en-UG', { currency: 'UGX' })` with the `useCurrency().formatAmount` hook in these components:

- `TransactionList.tsx`, `IncomeStatementView.tsx`, `RevenueChart.tsx`
- `WithdrawRequestDialog.tsx`, `FoodMarketDialog.tsx`, `BillPaymentDialog.tsx`, `DepositFlow.tsx`
- `COOWithdrawalApprovals.tsx`, `COOPartnerWithdrawalApprovals.tsx`
- `CFOWithdrawalApprovals.tsx`, `CFOPartnerPayoutProcessing.tsx`
- `FinOpsWithdrawalVerification.tsx`, `PartnerOpsWithdrawalQueue.tsx`
- `DepositRentAuditWidget.tsx`, `AgentCollectionsWidget.tsx`, `FinancialStatementsPanel.tsx`
- `AngelCalculator.tsx`, `AngelInvestorCard.tsx`
- `FinancialStatement.tsx` page
- Non-component file: `agentReportPdf.ts` (use `formatDynamic`)

### Phase 3: Fix `paymentMethods.ts` and hardcoded string prefixes

- Update `formatCurrency` in `src/lib/paymentMethods.ts` to use `formatDynamic`
- Search and replace hardcoded `"UGX "`, `"USh "` string literals across components

### Phase 4: Update chart tooltip formatters

- `RevenueChart.tsx` tooltip and Y-axis use hardcoded UGX — update to use dynamic formatter

## Technical Detail

The standalone utility mirrors the hook's logic but reads directly from localStorage:

```typescript
// src/lib/currencyFormat.ts
const STORAGE_KEY = 'welile-currency';
const RATES_KEY = 'welile-live-rates';

export function formatDynamic(amountInUGX: number): string {
  const code = localStorage.getItem(STORAGE_KEY) || 'UGX';
  const cached = localStorage.getItem(RATES_KEY);
  const rates = cached ? JSON.parse(cached) : fallbackRates;
  const rate = rates[code] || 1;
  const converted = amountInUGX * rate;
  // Format using Intl.NumberFormat with the selected currency code/locale
}
```

This approach avoids needing to refactor 272 files from `formatUGX(x)` to a hook call — they keep the same function signature but now output in the user's selected currency.

