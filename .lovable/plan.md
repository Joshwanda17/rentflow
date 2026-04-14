

## Plan: Fix Partner Wallet Card Interactivity

### Problem
The entire `UnifiedWalletHeroCard` is wrapped in a single `<button>`, so tapping anywhere opens the wallet sheet. The three metric cards (Houses, Return/Mo, Deployed) are not individually interactive.

### Changes

**1. Refactor `UnifiedWalletHeroCard` (supporter role)**

- Change the outer wrapper from `<button>` to a `<div>` — the card itself should NOT be clickable.
- Make only the **balance area** and the **"View Wallet" footer link** clickable (these open `FullScreenWalletSheet`).
- Make the three supporter metric cards individually tappable via new callback props:
  - **Houses** → navigates to "My Houses" section (scrolls to it or opens the collapsible)
  - **Return/Mo** → opens `MyPortfolioAccounts` / investment accounts view
  - **Deployed** → opens `MyPortfolioAccounts` + Angel Shares view

**2. Add callback props to `UnifiedWalletHeroCard`**

```
onOpenWallet?: () => void;       // balance tap + "View Wallet" tap
onHousesTap?: () => void;        // Houses card
onReturnTap?: () => void;        // Return/Mo card
onDeployedTap?: () => void;      // Deployed card
```

Remove the internal `useState(showWallet)` and `FullScreenWalletSheet` render from the component — let the parent (`SupporterDashboard`) control wallet visibility (it already has `showWallet` state at line 97).

**3. Update `SupporterDashboard`**

Wire the new props:
- `onOpenWallet` → `setShowWallet(true)`
- `onHousesTap` → scroll to `#my-houses` section
- `onReturnTap` → scroll to `MyPortfolioAccounts`
- `onDeployedTap` → scroll to `MyPortfolioAccounts` + show Angel Shares tab

Add `id` attributes to the relevant sections for scroll targeting.

### Files Modified
- `src/components/wallet/UnifiedWalletHeroCard.tsx`
- `src/components/dashboards/SupporterDashboard.tsx`

