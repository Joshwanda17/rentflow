

# Fix Proxy Partner Withdrawal Showing Zero Balance

## Problem
In `ProxyPartnerFunds.tsx`, the `WithdrawRequestDialog` is rendered without passing the `walletBalance` prop. The dialog defaults `walletBalance` to `0`, so the agent sees a zero balance when withdrawing for a partner — even though the partner has available funds.

## Fix — `src/components/agent/ProxyPartnerFunds.tsx`

Pass the `prefillAmount` (which is already set to `partner.available`) as `walletBalance` to the dialog:

```tsx
// BEFORE (line ~200):
<WithdrawRequestDialog
  open={withdrawOpen}
  onOpenChange={setWithdrawOpen}
  prefillAmount={prefillAmount}
  prefillReason={prefillReason}
/>

// AFTER:
<WithdrawRequestDialog
  open={withdrawOpen}
  onOpenChange={setWithdrawOpen}
  walletBalance={prefillAmount}
  prefillAmount={prefillAmount}
  prefillReason={prefillReason}
/>
```

Single prop addition. The `prefillAmount` state already holds the correct partner available balance from `handleWithdraw`.

| File | Change |
|---|---|
| `src/components/agent/ProxyPartnerFunds.tsx` (~line 200) | Add `walletBalance={prefillAmount}` to `WithdrawRequestDialog` |

