

# Unified Wallet Balance — Implementation Plan

## Changes

### 1. `src/components/wallet/FullScreenWalletSheet.tsx`

**Line 54**: Change `displayBalance` and `balanceLabel`:
```ts
// FROM:
const displayBalance = isAgent ? commissionBalance : (wallet?.balance || 0);
const balanceLabel = isAgent ? 'Commission Balance' : 'Available Balance';

// TO:
const displayBalance = wallet?.balance || 0;
const balanceLabel = 'Total Balance';
```

**After line 187** (after `<WalletDisclaimer>`): Add role-based secondary info row inside the purple gradient card:
- **Agent**: Small white/70 text: `"Withdrawable: {commissionBalance} · Locked: {floatBalance}"`
- **Funder/supporter**: `"Withdrawable: {balance} · Invested: {lockedBalance}"` (use available props)
- **Tenant**: `"Used for Rent: {X}"` (simple label)
- **Others**: No secondary row

**Line 415** (WithdrawRequestDialog walletBalance prop): Keep as-is — agents still limited to `commissionBalance`.

### 2. `src/components/agent/AgentFloatBalanceCard.tsx`

Replace the 3-cell grid with a single card showing:
- **Primary**: "Total Balance: {totalBalance}" (bold, prominent)
- **Secondary**: Small muted text: "Withdrawable: {commissionBalance} · Locked: {floatBalance}"

### 3. `src/components/payments/PartnerWalletWidget.tsx`

Replace the 3-card grid with:
- **Primary**: Large single balance number (availableBalance)
- **Secondary**: Small text row: "Contributed: {lockedBalance} · Rewards: +{roiEarned}"

### 4. `src/components/wallet/WithdrawRequestDialog.tsx`

Add an informational label near the amount input showing "Withdrawable balance: {walletBalance}" so users understand the limit. No logic changes.

## Files Changed

| File | Change |
|------|--------|
| `FullScreenWalletSheet.tsx` | Show `wallet.balance` as "Total Balance", add role-based secondary row |
| `AgentFloatBalanceCard.tsx` | Single balance + small split text |
| `PartnerWalletWidget.tsx` | Single primary balance + secondary row |
| `WithdrawRequestDialog.tsx` | Add "Withdrawable balance" info label |

## What Does NOT Change
- `useAgentBalances` hook — still provides float/commission split
- Withdrawal enforcement — agents still capped at `commissionBalance`
- Ledger logic, RPC functions, categories — all untouched
- `TenantWalletHeroCard` — already correct

