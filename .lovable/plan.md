# Replace "Active" Badge with Check Icon & Rename "Invest" to "Fund Angel Pool"

## What Changes

### 1. Replace "Active" Badge with Check Icon (both Tenant and Angel committed views)

In `TenantCommittedSummary` (line 161-163) and `AngelCommittedSummary` (line 268-270), replace:

```tsx
<Badge variant="success" ...>Active</Badge>
```

with a white check icon on a purple circular background:

```tsx
<div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
  <Check className="h-3.5 w-3.5 text-white" />
</div>
```

### 2. Rename "Invest" to "Fund Angel Pool"

- **Line 337**: `Invest More` → `Fund Angel Pool`
- **Line 633**: `Invest in Angel Pool` → `Fund Angel Pool`
- **Line 457**: Toast message: `Angel pool investment of...` → `Angel Pool funded with...`

### 3. Add Post-Funding Chain Explanation (info block in AngelCommittedSummary)

don't add it i need explanation to me 

Add a small info section after the CTAs in `AngelCommittedSummary` explaining what happens after funding:

```
What happens next:
1. Wallet balance deducted instantly
2. Shares allocated to your account
3. Ownership % calculated and recorded
4. Investment appears on Angel Pool dashboard
5. Returns realized at company exit events
```

This will be a collapsible or compact text block below the footer.

## The Full Chain (for your reference)

When a user taps "Fund Angel Pool":

1. **Frontend** calls the `angel-pool-invest` edge function with the amount
2. **Edge function** validates: auth, minimum amount (USh 20,000/share), pool capacity (25,000 total shares), wallet balance
3. **Shares calculated**: `shares = floor(amount / 20,000)`; actual amount = shares × 20,000
4. **Ownership computed**: pool % = (shares / 25,000) × 100; company % = (shares / 25,000) × 8
5. **Ledger entry** created (`cash_out`, category `angel_pool_investment`) — this triggers the `sync_wallet_from_ledger` trigger which auto-deducts wallet balance
6. **Investment record** inserted into `angel_pool_investments` table with status `confirmed`
7. **System event** logged via `logSystemEvent`
8. **Response** returns: reference ID, shares, ownership percentages, new balance
9. **Dashboard** (`AngelPoolDashboard`) shows real-time aggregates: total raised, shares remaining, investor leaderboard

## Files Changed

- **Edit**: `src/components/angel-pool/CapitalOpportunityEntry.tsx` — badge → check icon, rename buttons, add chain info