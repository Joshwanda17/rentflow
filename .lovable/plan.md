

# Purge Ledger Integrity Alerts

## Root Cause Analysis

The dashboard shows **113 drift** and **15 negatives**, but the actual numbers are **32 drift** and **2 negatives**. The inflation is caused by the client-side integrity check in `useCFOOverviewData.ts` fetching `general_ledger` entries via the Supabase JS client, which caps at **1,000 rows**. With 8,185 wallet-scope entries, most users get incomplete ledger sums, producing false alerts.

## Two-Part Fix

### Part 1: Fix the Dashboard (eliminate false alerts)

Create a **database RPC** `get_ledger_integrity_checks` that runs the integrity queries server-side with full data access. Returns `{ wallet_drift_count, missing_group_count, negative_balance_count }`.

Update `useCFOOverviewData.ts` to call this RPC instead of doing client-side aggregation.

### Part 2: Purge the Real 32 Drift + 2 Negative Users

**32 Wallet/Ledger Drift users**: Most are wallets stuck at 0 while the ledger shows positive balances (e.g., one user has UGX 86.8M in the ledger but wallet shows 0). These need the wallet force-reconciled to match the ledger truth.

**2 Negative Ledger users**: Need `system_balance_correction` entries (same pattern used in the previous April 2026 purge) to zero them out.

Create a **one-time migration** that:
1. Inserts `system_balance_correction` ledger entries for the 2 negative-balance users
2. Force-syncs all 32 drifted wallets to their ledger-derived balance
3. Logs each correction to `audit_logs`

### Files Changed

- **Migration 1**: New RPC `get_ledger_integrity_checks`
- **Migration 2**: One-time data correction (32 drift + 2 negatives)
- **Edit**: `src/hooks/useCFOOverviewData.ts` — replace client-side integrity logic with single RPC call

### Expected Result

After both migrations run, the Ledger Integrity panel should show **0 / 0 / 0** (green across the board), and the numbers will be accurate going forward since the RPC bypasses the 1,000-row limit.

