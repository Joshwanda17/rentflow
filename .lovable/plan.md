

# Unified Wallet Balance — Dashboard Hero Cards

## The Problem

The previous changes updated the wrong components. The cards visible on each role's dashboard are:

| Role | Component | Current Label | Shows |
|------|-----------|---------------|-------|
| Agent | `AgentWalletHeroCard.tsx` | "Float Balance" | `floatBalance` as primary |
| Supporter | `PortfolioSummaryCards.tsx` | "Available Balance" | `walletBalance` |
| Tenant | `TenantWalletHeroCard.tsx` | "Available Balance" | `walletBalance` |
| Landlord | `LandlordWalletHeroCard.tsx` | "Available Balance" | `walletBalance` |

These are the purple gradient hero cards on each dashboard. None were modified.

## Changes

### 1. `src/components/agent/AgentWalletHeroCard.tsx`

- **Line 57**: Change label from `"Float Balance"` → `"Total Balance"`
- **Line 60**: Change displayed value from `formatAmount(floatBalance)` → `formatAmount(floatBalance + commissionBalance)` (i.e. total wallet)
- **Lines 64-68**: Replace the Commission row with unified secondary text:
  `"Withdrawable: {commissionBalance} · Locked: {floatBalance}"`

### 2. `src/components/supporter/PortfolioSummaryCards.tsx`

- **Line 57**: Change label from `"Available Balance"` → `"Total Balance"`
- **Lines 64-73**: Below the balance, add secondary text:
  `"Withdrawable: {walletBalance} · Invested: {rentSecured}"`

### 3. `src/components/tenant/TenantWalletHeroCard.tsx`

- **Line 61**: Change label from `"Available Balance"` → `"Total Balance"`
- **After line 67** (after the balance display, before the "Ready to pay" badge): Add secondary text:
  `"Used for Rent: {rentDue}"`

### 4. `src/components/landlord/LandlordWalletHeroCard.tsx`

- **Line 59**: Change label from `"Available Balance"` → `"Total Balance"`
- **After line 65** (after balance display): Add secondary text:
  `"Withdrawable: {walletBalance}"`

## What Does NOT Change
- The 3-column stat grids at the bottom of each card stay as-is
- The trust strips stay as-is
- The FullScreenWalletSheet (already updated correctly)
- All backend logic, ledger, withdrawal enforcement

## Files Changed

| File | Change |
|------|--------|
| `AgentWalletHeroCard.tsx` | Label → "Total Balance", show total, add Withdrawable/Locked row |
| `PortfolioSummaryCards.tsx` | Label → "Total Balance", add Withdrawable/Invested row |
| `TenantWalletHeroCard.tsx` | Label → "Total Balance", add "Used for Rent" row |
| `LandlordWalletHeroCard.tsx` | Label → "Total Balance", add "Withdrawable" row |

