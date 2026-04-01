

# Fix: Add Executive Notifications for Portfolio Top-Ups

## Problem

When a portfolio is topped up (any of the 3 paths), **only the partner** receives a notification. Neither the CFO nor the COO is notified, and the CFO dashboard has no view of pending portfolio top-ups. This creates a governance blind spot.

**Example:** ALEETE's portfolio WIP2602283615 was topped up by 5.5M — only ALEETE saw the notification. No executive was alerted.

## Current Notification Recipients

| Top-Up Path | Who Gets Notified | Gap |
|---|---|---|
| Partner self-top-up | Partner only | No executive alert |
| Manager/COO top-up | Partner only | COO did it but CFO doesn't know |
| COO wallet-to-portfolio | Partner only | Same gap |
| Apply pending top-ups | Partner only | No confirmation to CFO |

## Plan

### 1. Add CFO + COO notifications to all 3 top-up Edge Functions

In each function (`portfolio-topup`, `manager-portfolio-topup`, `coo-wallet-to-portfolio`), after the partner notification, query `user_roles` for users with `cfo` and `coo` roles, then insert a notification for each:

```
Title: "📊 Portfolio Top-Up Submitted"
Message: "UGX 5,500,000 top-up for ALEETE (WIP2602283615) — pending verification."
Type: "info"
```

### 2. Add CFO + COO notification to `apply-pending-topups`

When pending top-ups are applied, notify both executives:

```
Title: "✅ Portfolio Top-Ups Applied"  
Message: "2 pending top-up(s) totaling UGX 5,500,000 applied to ALEETE (WIP2602283615). New capital: UGX X."
```

### 3. Add a "Pending Portfolio Top-Ups" section to the CFO dashboard

Create a small card/section in the CFO dashboard that queries `pending_wallet_operations` where `operation_type = 'portfolio_topup'` and `status = 'pending'`, showing count and total amount. This gives the CFO visibility without needing to visit the COO's Partners page.

## Files Changed

- `supabase/functions/portfolio-topup/index.ts` — add executive notifications
- `supabase/functions/manager-portfolio-topup/index.ts` — add executive notifications  
- `supabase/functions/coo-wallet-to-portfolio/index.ts` — add executive notifications
- `supabase/functions/apply-pending-topups/index.ts` — add executive notifications
- CFO dashboard component — add pending top-ups visibility card

## Technical Details

- Executive users are resolved via: `SELECT user_id FROM user_roles WHERE role IN ('cfo', 'coo')`
- Notifications are batch-inserted (one query for all executives)
- Non-blocking: notification failures are logged but don't fail the top-up operation
- The CFO card is read-only — applying top-ups remains a COO-only action

