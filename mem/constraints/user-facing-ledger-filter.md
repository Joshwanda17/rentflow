---
name: User-facing ledger views must hide admin corrections
description: Any query that surfaces general_ledger rows to the end user (wallet statements, recent activity, auto-charges, related-entry drawers, agent wallet reports) MUST filter .neq('classification','admin_correction') AND .neq('category','system_balance_correction'). Reconciliation/CFO-correction legs are bookkeeping, not real movements.
type: constraint
---
**Rule.** End-user wallet UIs must not show admin/CFO reconciliation legs. They are bookkeeping corrections that already adjust the strict-withdrawable headline; surfacing them as "transactions" confuses users and erodes trust.

**Why.** The strict `get_user_available_balance` already incorporates admin corrections into the displayed balance. Showing the raw correction legs as line items would double-count the cognitive impact (user sees both "−100,000 wallet correction" and a smaller balance).

**How to apply.** Every Supabase query against `general_ledger` that renders rows to the end user MUST chain:
```ts
.neq('classification', 'admin_correction')
.neq('category', 'system_balance_correction')
```

**In scope (already patched 2026-04-30):**
- `src/components/wallet/WalletStatement.tsx`
- `src/components/wallet/WalletLedgerStatement.tsx`
- `src/components/wallet/RecentBalanceChanges.tsx`
- `src/components/wallet/RecentAutoCharges.tsx`
- `src/components/wallet/LedgerEntryDetailDrawer.tsx` (related-group fetch)
- `src/lib/fetchAgentWalletData.ts` (agent wallet PDF report)

**Explicitly out of scope** (do NOT add the filter): CFO/FinOps/Manager/COO/CEO/CTO/HR dashboards, `LedgerHealthPanel`, `WalletReconciliationAuditPanel`, `LedgerReconciliationPanel`, `MoneyFlowTrace`, `ManagerLedgerSummary`, `ManagerBankingLedger`, `GeneralLedger`, `FinancialTransactionsTable`, `TransactionSearch`, `RentCollectionsFeed`, `AnchoredCacheDriftPanel`, `PhantomDriftPanel`. Operators MUST see corrections to audit them.

**Balance computations** (`computeLedgerAvailable`, `useAgentBalances`, `get_user_available_balance`) are governed separately by the strict-withdrawable rule and the existing `classification IN ('production','legacy_real')` filters — do not add the admin_correction exclusion there or you will hide real corrections from the available-balance math.
