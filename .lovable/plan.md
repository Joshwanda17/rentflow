

# Proxy Partner Withdrawal Status Tracking

## Problem
When a proxy agent clicks "Withdraw" for a partner, there's no status tracking per partner. The agent can click withdraw multiple times, creating duplicate withdrawal requests. The partner card should show "Pending" status and disable the withdraw button until the request is approved/completed.

## Approach
Track proxy partner withdrawal status by:
1. Adding a `linked_party` column to `withdrawal_requests` so we can link a withdrawal to a specific partner
2. Passing the `partnerId` from `ProxyPartnerFunds` through to the `WithdrawRequestDialog` so it gets stored on the withdrawal request
3. Querying pending withdrawal requests per partner to determine button state
4. Showing a "Pending" badge and disabling the withdraw button when a pending request exists

## Database Change

Add `linked_party` column to `withdrawal_requests`:
```sql
ALTER TABLE withdrawal_requests ADD COLUMN linked_party UUID;
```

## File Changes

### `src/components/wallet/WithdrawRequestDialog.tsx`
- Add optional `linkedParty?: string` prop
- When inserting into `withdrawal_requests`, include `linked_party: linkedParty` if provided

### `src/components/agent/ProxyPartnerFunds.tsx`
- Add state for `selectedPartnerId`
- Pass `linkedParty={selectedPartnerId}` to `WithdrawRequestDialog`
- Query `withdrawal_requests` for pending requests where `linked_party` matches each partner ID and `status = 'pending'`
- For each partner card:
  - If a pending withdrawal exists: show "Pending" badge (amber), disable the withdraw button
  - If approved/completed: show "Approved"/"Delivered" badge
  - If no pending request and available > 0: show active withdraw button as today

| File | Change |
|---|---|
| Migration | Add `linked_party` UUID column to `withdrawal_requests` |
| `WithdrawRequestDialog.tsx` | Accept + store `linkedParty` prop on insert |
| `ProxyPartnerFunds.tsx` | Track `selectedPartnerId`, query pending withdrawals, disable button + show status badge per partner |

