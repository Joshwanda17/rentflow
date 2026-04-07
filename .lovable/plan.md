

# Redesign CFO Dashboard Overview — Sovereign Vault Aesthetic

## Reference Analysis (from screenshot)

The design shows a mobile-first financial dashboard with:
- **Three stacked summary cards** at the top: "USER WALLETS" (neutral), "PLATFORM LEDGER" (neutral), "SYSTEM VARIANCE" (red/warning with "Reconcile Now" button)
- **Active Channels** section with "View All Network Traffic" link — each channel shows icon in colored circle, name, transaction count ("1,248 TRANSACTIONS TODAY"), amount, and trend percentage
- **Agent Performance** section with Daily/Monthly toggle pills, table-like layout showing agent avatar, name, tier, and tenants managed count
- **Bottom tab bar**: DASHBOARD, LEDGER, CHANNELS, AGENTS

## Approach

Restyle the CFO dashboard **overview** (default case in `renderContent`) to match the Sovereign Vault aesthetic. Keep all existing data queries from `PlatformVsWalletSummary` and `ChannelBalanceTracker` — just restyle the rendering. Create a new `CFODashboardOverview` component that consolidates the overview content.

## File Changes

### New: `src/components/cfo/CFODashboardOverview.tsx`

Replaces the current inline default case. Combines data from existing queries into the Sovereign Vault layout:

1. **Three stacked cards** (full-width, rounded-2xl, subtle shadows):
   - **User Wallets**: uppercase `tracking-widest` label, large bold amount, "+X% from last audit" subtitle
   - **Platform Ledger**: same style, "Syncing in real-time" subtitle with refresh icon
   - **System Variance**: red/pink gradient background if variance > 0, warning icon, "Reconcile Now" button that navigates to reconciliation tab

2. **Active Channels** section:
   - Header: bold "Active Channels" + "View All Network Traffic" link (navigates to channels/reconciliation)
   - Each channel: colored circle icon (Smartphone for MTN, signal for Airtel, Building for Bank, Banknote for Cash), name, "X TRANSACTIONS TODAY" uppercase subtitle, right-aligned amount + trend badge

3. **Agent Performance** section:
   - Header: "Agent Performance" + Daily/Monthly toggle pills
   - Table header: AGENT DETAIL / TENANTS MANAGED
   - Each row: numbered rank badge, avatar placeholder, name, tier subtitle, right-aligned tenant count in primary badge

4. **Bottom summary** (optional): Total float processed card with purple gradient

Data sources — reuse existing query patterns from `PlatformVsWalletSummary` and `ChannelBalanceTracker`, plus `AgentPerformanceRankings` data.

### Modified: `src/pages/cfo/Dashboard.tsx`

- Import `CFODashboardOverview` 
- Replace the default case contents with `<CFODashboardOverview onNavigate={setActiveTab} />`
- Pass `onNavigate` so "Reconcile Now" and "View All" links can switch tabs

| File | Change |
|---|---|
| `src/components/cfo/CFODashboardOverview.tsx` | New component — Sovereign Vault styled overview with wallet cards, channels, agent performance |
| `src/pages/cfo/Dashboard.tsx` | Replace default case with `<CFODashboardOverview>` |

