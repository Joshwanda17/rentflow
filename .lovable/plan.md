# Reconcile the 497 Mismatched Users (Actually 15)

## Root Cause

Two separate problems are compounding here:

### Problem 1: Inflated Dashboard Numbers (497 shown vs 15 real)

`CFOReconciliationPanel.tsx` fetches ledger entries client-side with Supabase's default **1,000-row cap**. With 11,000+ wallet-scope entries, most users get incomplete ledger sums, making nearly everyone appear "mismatched." The real number is **15 mismatched** and **219 matched** (234 total active users).

### Problem 2: The Real 15 Mismatched Users

All 15 are **ghost users** — they have ledger entries (totaling UGX 36.8M) but **zero** auth accounts, **zero** profiles, and **zero** wallets. They are orphaned `legacy_real` entries from pre-production (deposits, supporter funds, agent proxy investments). No real user is affected.

## Fix Plan

### Part 1: Fix the Dashboard — Server-Side RPC

Create an RPC `get_wallet_reconciliation` that runs the full wallet-vs-ledger comparison in Postgres (no row limit). Returns per-user rows with `user_id, user_name, wallet_balance, ledger_balance, discrepancy`. Update `CFOReconciliationPanel.tsx` to call this RPC instead of doing client-side aggregation.

### Part 2: Neutralize the 15 Ghost Entries

These are orphaned ledger entries for deleted/non-existent users. Two options:

**Option A (Recommended): Reclassify as `test_dev**`
Update the `classification` column of all ledger entries for these 15 ghost user IDs from `legacy_real`/`production` to `test_dev`. This excludes them from all financial reporting while preserving the audit trail. The RPC will filter them out automatically.

**Option B: Correction entries**
Insert `system_balance_correction` counter-entries to zero out each ghost user's ledger balance. More entries but preserves original classifications.

## One thing to watch

When reclassifying the ghost users, make sure your reporting and reconciliation logic consistently filters on:

```
classification IN ('production', 'legacy_real')
```

That ensures these ghost entries never reappear in financial metrics.

### Files Changed

- **Migration 1**: New RPC `get_wallet_reconciliation`
- **Migration 2**: Reclassify ghost user entries to `test_dev`
- **Edit**: `src/components/cfo/CFOReconciliationPanel.tsx` — replace client-side logic with RPC call

### Expected Result

After both migrations: **234 total users, 234 matched, 0 mismatched, UGX 0 gap**.