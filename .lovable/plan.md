

# Push Notifications on Successful Transactions

## Overview
Add user-facing push notifications to all major financial transaction edge functions. Currently, these functions only notify managers. After this change, the transacting user(s) will also receive a push notification confirming their transaction succeeded.

## Edge Functions to Update

Each function below will get a fire-and-forget `send-push-notification` call to the relevant user(s) right after the existing `notify-managers` call:

| # | Edge Function | Who Gets Notified | Message Example |
|---|---|---|---|
| 1 | `wallet-transfer` | Sender + Recipient | "Transfer of UGX X sent/received" |
| 2 | `agent-deposit` | Depositing agent + tenant | "Deposit of UGX X recorded" |
| 3 | `agent-withdrawal` | Agent | "Withdrawal of UGX X processed" |
| 4 | `tenant-pay-rent` | Tenant | "Rent payment of UGX X confirmed" |
| 5 | `approve-deposit` | Each deposit's user | "Your deposit of UGX X has been approved" |
| 6 | `cfo-direct-credit` | Target user | "Your wallet has been credited UGX X" |
| 7 | `fund-rent-pool` | Funding user | "Rent pool funded with UGX X" |
| 8 | `portfolio-topup` | Partner | "Portfolio top-up of UGX X confirmed" |
| 9 | `manager-portfolio-topup` | Partner | "Portfolio credited UGX X" |
| 10 | `coo-wallet-to-portfolio` | Partner | "UGX X moved to portfolio" |
| 11 | `process-credit-draw` | User | "Credit draw of UGX X processed" |
| 12 | `disburse-rent-to-landlord` | Landlord | "Rent of UGX X disbursed to your wallet" |
| 13 | `wallet-deduction` | Target user | "UGX X deducted from your wallet" |

## Implementation Pattern

Each function already has `supabaseUrl` and `supabaseServiceKey` available. The addition follows the same fire-and-forget pattern used for manager notifications:

```typescript
// Push notification to user (fire-and-forget)
fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${supabaseServiceKey}`,
  },
  body: JSON.stringify({
    userIds: [userId],
    payload: {
      title: "✅ Transaction Successful",
      body: `UGX ${amount.toLocaleString()} has been ...`,
      url: "/dashboard",
      type: "success",
    },
  }),
}).catch(() => {});
```

## What Won't Change
- The existing `notify-managers` calls remain untouched
- No database migrations needed
- No frontend changes needed — the existing service worker and push subscription system already handles incoming notifications
- All new calls are fire-and-forget so they won't slow down the transaction response

