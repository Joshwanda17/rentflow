---
name: ROI Payout Cycle Idempotency
description: A portfolio can receive its ROI only once per payout cycle; duplicate/repeated ROI credits are blocked at the approval + ledger boundary
type: feature
---
**Rule:** one ROI credit per portfolio per payout cycle. The cycle is keyed by the portfolio's current `next_roi_date` (which only advances after an ROI approval), so accidental double-submits or repeated executions resolve to the SAME key and the second is refused.

**Idempotency key:** `roi-cycle-<portfolio_id>-<next_roi_date>` (falls back to `roi-cycle-<portfolio_id>-<YYYY-MM-DD today>` if next_roi_date is null).

**Enforcement (defense in depth):**
1. `approve-wallet-operation` edge fn (authoritative, covers all approval-based `roi_payout`/`supporter_platform_rewards` credits incl. managed-proxy + split cash leg):
   - Pre-check: if any `general_ledger` row already has that `idempotency_key`, the pending op is set `status='rejected'` (metadata.duplicate_roi_blocked) and skipped — no credit.
   - The ROI `create_ledger_transaction` call passes `idempotency_key: roiCycleKey`. `create_ledger_transaction` already advisory-locks + returns the existing group WITHOUT posting on a key hit.
   - Race guard: after the RPC, if the key's earliest row predates this invocation (`ledgerPostStart − 1500ms`), it was a concurrent idempotent hit → reject + `continue` BEFORE the wallet delta-recovery (which would otherwise re-credit via apply_wallet_movement).
2. Client `COOPartnersPage.handlePay` + `handleSplitPayout`: pre-flight block if (a) a ledger row with the cycle key exists, or (b) an open `pending_wallet_operations` (status pending/pending_coo_approval/coo_approved/awaiting_verification, category roi_payout) already exists for the portfolio. Clear toast, no duplicate pending op created.

Historical ROI rows have null idempotency_key so there are no false positives. Detection/report of past duplicates: `get_duplicate_roi_credits` + CFO Duplicate ROI Credit Monitor (see mem://features/cfo/duplicate-roi-credit-monitor).
