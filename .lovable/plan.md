

# Move Withdrawals, Capital Opportunities, and Wallet Deductions to More Tools

## What changes

The three main-view buttons — **Withdrawals & Payouts**, **Capital Opportunities**, and **Wallet Deductions** — will be removed from the home grid and added as entries in the existing "More Tools" bottom sheet. Only **Verify Deposits** remains as a primary action on the home screen.

## File: `src/components/financial-ops/FinancialOpsCommandCenter.tsx`

### 1. Expand the `tools` array

Add three new entries to the `tools` array (before or after existing items):

```ts
{ id: 'withdrawals', label: 'Withdrawals & Payouts', icon: Banknote },
{ id: 'opportunities', label: 'Capital Opportunities', icon: TrendingUp },
{ id: 'deductions', label: 'Wallet Deductions', icon: MinusCircle },
```

### 2. Update the `Tool` type

Expand `Tool` to include the new IDs:

```ts
type Tool = null | 'ops' | 'queue' | 'search' | 'recon' | 'ledgers' | 'audit' | 'withdrawals' | 'opportunities' | 'deductions';
```

### 3. Remove the `View` type entries and home-screen buttons

- Remove `'withdrawals' | 'opportunities' | 'deductions'` from the `View` type (it becomes just `'home' | 'deposits'`).
- Delete the three `<button>` blocks for Withdrawals, Capital Opportunities, and Wallet Deductions from the home grid (lines ~145-190).
- Delete the three `if (view === '...')` sub-view blocks for withdrawals, opportunities, and deductions (lines ~63-101). Move their rendering into the `activeTool` block instead.

### 4. Render the new tools in the `activeTool` block

Add cases for the three new tool IDs alongside existing ones:

```tsx
{activeTool === 'withdrawals' && (
  <>
    <FinOpsWithdrawalVerification />
    <PendingWalletOperationsWidget />
    <FloatPayoutVerification />
  </>
)}
{activeTool === 'opportunities' && (
  <OpportunitySummaryForm onClose={() => setActiveTool(null)} />
)}
{activeTool === 'deductions' && <WalletDeductionPanel />}
```

### Summary

One file changed. The home screen will show only the Verify Deposits button and the More Tools sheet will contain all 9 tools including the three moved items.

