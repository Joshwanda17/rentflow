

# Proxy Partner Funds Visibility in Agent Wallet

## Problem
When CFO approves an ROI payout routed to an agent's wallet (via `target_wallet_user_id`), the money arrives but the agent has no way to distinguish proxy partner funds from their own earnings. They don't know which partner the money belongs to or how much to deliver.

## Solution
Add a **tabbed UI** inside the agent's `FullScreenWalletSheet` with two tabs:
1. **Wallet Statement** (existing `WalletLedgerStatement`)
2. **Proxy Partners** (new — shows partner-specific balances with withdraw buttons)

## Changes

### 1. New Component: `src/components/agent/ProxyPartnerFunds.tsx`

Queries `general_ledger` for the agent's wallet entries where `category = 'roi_payout'` and `linked_party` is set (these are proxy partner credits). Groups by `linked_party` (partner ID), resolves partner names from `profiles`, and calculates:
- **Total received** per partner (sum of `cash_in` entries with `roi_payout` category)
- **Total withdrawn/sent** per partner (sum of `cash_out` entries linked to that partner)
- **Available balance** per partner (received minus withdrawn)

Each partner card shows:
- Partner name and phone
- Total received, total delivered, available balance
- **Withdraw** button — opens `WithdrawRequestDialog` with the amount pre-filled to the available balance, and the reason pre-filled with `Proxy payout delivery for [partner name]`

All withdraw actions log to `audit_logs` with `action_type: 'proxy_partner_withdrawal'` and metadata including partner ID, amount, and agent ID.

### 2. Update `src/components/wallet/FullScreenWalletSheet.tsx`

Replace the direct `<WalletLedgerStatement />` render (around line 273) with a `<Tabs>` component:

```
<Tabs defaultValue="statement">
  <TabsList variant="pills">
    <TabsTrigger value="statement">Wallet Statement</TabsTrigger>
    <TabsTrigger value="proxy">Proxy Partners</TabsTrigger>
  </TabsList>
  <TabsContent value="statement">
    <WalletLedgerStatement />
  </TabsContent>
  <TabsContent value="proxy">
    <ProxyPartnerFunds />
  </TabsContent>
</Tabs>
```

The "Proxy Partners" tab only shows for users who have proxy partner entries (query on mount, hide tab if count is 0).

### 3. Ledger Description Enhancement

In the `approve-wallet-operation` edge function, when `isManaged` is true, the ledger entry `description` already contains `[Agent Wallet]` prefix and partner name. The `linked_party` field is set to the partner's `user_id`. This is sufficient for the new component to group by partner — no edge function changes needed.

## Summary

| Change | File |
|--------|------|
| New proxy partner funds component with per-partner balances and withdraw buttons | `src/components/agent/ProxyPartnerFunds.tsx` (new) |
| Add tabs (Statement / Proxy Partners) to wallet sheet | `src/components/wallet/FullScreenWalletSheet.tsx` |

No database migration or edge function changes required. All data already exists in `general_ledger` via `linked_party` and `category` fields.

