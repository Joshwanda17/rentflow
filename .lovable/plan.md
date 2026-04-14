

## Plan: Wire Agent Wallet Hero Card Tap

### Problem
The `UnifiedWalletHeroCard` on the Agent dashboard is missing the `onOpenWallet` prop, so tapping it does nothing. The state (`showWallet`) and sheet (`FullScreenWalletSheet`) are already wired up — only the prop is missing.

### Fix
**File: `src/components/dashboards/AgentDashboard.tsx`** — line 282

Add `onOpenWallet={() => setShowWallet(true)}` to the existing `UnifiedWalletHeroCard`. One-line change, no other files affected.

