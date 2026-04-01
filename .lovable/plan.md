&nbsp;

# Add Push Notifications for All Activities to Managers

## Problem

Managers currently receive **zero push notifications** for platform activities. All push notifications are sent only to the directly involved user (partner, agent, tenant). Managers have no real-time mobile alerts for critical operations happening on the platform.

## Approach

Create a **shared helper function** that all edge functions can call to notify managers after any significant activity. This avoids duplicating the same "query manager roles + send push" logic across 30+ functions.

WHEN A DEPOSIT IS MADE THE COO SHOULD BE NOTIFIED, THEN WHEN HE APPROVES TE DEPOSIT, THE FINANCIAL OPS SHOULD BE NOTIFIED AFTER VERIFYING THE DEPOSIT THE CFO ALSO SHOULD BE NOTIFIED, WHEN THE CFO APPROVES ALSO. FOR EACH WALLET ACTIVITY THE MANAGERS SHOULD RECEIVE THE NOTIFICATIONS.

### Step 1: Create a shared `notify-managers` helper Edge Function

A lightweight internal-only edge function that other functions call. It accepts a title, body, and optional metadata, then:

1. Queries `user_roles` for all users with `role = 'manager'` and `enabled = true`
2. Sends push notifications to all of them via the existing `send-push-notification` function

This keeps the logic in one place and makes it trivial to add manager notifications to any function.

### Step 2: Add manager push notifications to all key edge functions

Each function will add a single `fetch()` call to `notify-managers` after its main operation succeeds. Activities to cover:


| Category                 | Edge Functions                                                                                                                                        | Notification Example                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Deposits**             | `approve-deposit`, `agent-deposit`                                                                                                                    | "💰 Deposit approved: UGX X for [user]"    |
| **Withdrawals**          | `agent-withdrawal`, `reject-withdrawal`, `approve-wallet-operation`                                                                                   | "💸 Withdrawal requested: UGX X by [user]" |
| **Rent**                 | `approve-rent-request`, `fund-tenants`, `tenant-pay-rent`, `manual-collect-rent`, `disburse-rent-to-landlord`                                         | "🏠 Rent request approved for [tenant]"    |
| **Portfolio/Investment** | `portfolio-topup`, `manager-portfolio-topup`, `coo-wallet-to-portfolio`, `apply-pending-topups`, `coo-invest-for-partner`, `agent-invest-for-partner` | "📊 Portfolio top-up: UGX X for [partner]" |
| **User Management**      | `create-supporter-invite`, `register-tenant`, `register-employee`, `transfer-tenant`, `delete-user`                                                   | "👤 New tenant registered by [agent]"      |
| **Financial Ops**        | `fund-rent-pool`, `fund-agent-landlord-float`, `platform-expense-transfer`, `cfo-direct-credit`, `wallet-transfer`                                    | "🏦 Rent pool funded: UGX X"               |
| **Credit**               | `process-credit-draw`, `approve-loan-application`                                                                                                     | "📋 Loan application approved for [user]"  |
| **Listings**             | `credit-listing-bonus`, `approve-listing-bonus`                                                                                                       | "🏡 Listing bonus credited for [house]"    |
| **Supporter**            | `activate-supporter`, `supporter-account-action`, `process-supporter-roi`                                                                             | "💼 Supporter activated: [name]"           |
| **Repayments**           | `check-repayment-status`                                                                                                                              | "⚠️ Overdue repayment detected: [tenant]"  |


### Step 3: Add manager push from client-side actions

For activities triggered from the UI that don't go through edge functions (role changes, broadcast messages), add a call to `send-push-notification` targeting manager user IDs:

- `BulkAssignRoleDialog` / `BulkRemoveRoleDialog` — role changes
- `InlineRoleToggle` / `MobileRoleEditor` — individual role changes
- `BroadcastMessageDialog` — broadcast sent

## Files to Create

- `supabase/functions/notify-managers/index.ts` — shared helper

## Files to Edit (~25 edge functions)

- All edge functions listed in the table above — add a single non-blocking `fetch()` call to `notify-managers` after the main operation
- `src/components/manager/BulkAssignRoleDialog.tsx` — add manager push
- `src/components/manager/BulkRemoveRoleDialog.tsx` — add manager push
- `src/components/manager/InlineRoleToggle.tsx` — add manager push
- `src/components/chat/BroadcastMessageDialog.tsx` — add manager push

## Technical Details

`**notify-managers` function pattern:**

```typescript
// Receives: { title, body, url?, type? }
// 1. Queries user_roles for role='manager', enabled=true
// 2. Calls send-push-notification with those user IDs
// Non-blocking, fire-and-forget from callers
```

**Caller pattern (in each edge function):**

```typescript
// After main operation succeeds, fire-and-forget:
fetch(`${supabaseUrl}/functions/v1/notify-managers`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
  body: JSON.stringify({
    title: "💰 Deposit Approved",
    body: `UGX ${amount.toLocaleString()} deposit for ${userName}`,
    url: "/deposits"
  })
}).catch(() => {});  // Never block the main operation
```

- All notifications are **non-blocking** — failures are silently caught
- The `notify-managers` function deduplicates by querying `user_roles` each time (managers may change)
- Note: Per the database write-suppression policy, these are **push-only** — no rows are inserted into the `notifications` table
- &nbsp;