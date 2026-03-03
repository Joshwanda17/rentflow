

## Plan: Add Deposit Button Below Merchant Code Pills

Looking at the screenshot, the merchant code pills sit right below the username. The best placement for a deposit action is directly below the pills — a compact "Deposit" button that opens the existing `DepositDialog`.

### Approach

**File: `src/components/supporter/MerchantCodePills.tsx`** (edit)
- Add an optional `onDeposit` callback prop to `MerchantCodePills`
- Below the pills row, render a small "Deposit" button (compact, pill-style with a `Plus` or `Wallet` icon) that calls `onDeposit` when provided
- Keeps the component reusable — dashboards that don't need deposit can omit the prop

**File: `src/components/dashboards/AgentDashboard.tsx`** (edit)
- Add `DepositDialog` state (`depositOpen` / `setDepositOpen`)
- Pass `onDeposit={() => setDepositOpen(true)}` to `<MerchantCodePills />`
- Render `<DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />` alongside other dialogs

### Visual Result
```text
SSENKAALI PIUS ✓ Verified
Welile Agent

[🟡 MTN 090777 📋]  [🔴 Airtel 4380664 📋]
        [➕ Deposit Funds]
```

The deposit button uses the same compact pill aesthetic — `rounded-full`, success/primary color accent, subtle border — so it feels native to the merchant code area rather than a separate CTA.

