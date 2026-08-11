# Two workstreams: landlord-float in wallet totals, and Email Transactions clarity

## Workstream A — Landlord pay float counts toward "Total Money in All Wallets"

CFO-allocated landlord pay float lives in `agent_landlord_float` and never writes a `general_ledger` row, so the hero card total ignores it. It stays out of the agent's spendable wallet; instead the headline total is extended to include this pool.

### A1. Record float consumption where the balance actually changes
`deduct_agent_float_for_payout(p_payout_id)` (live: decrements `agent_landlord_float.balance` and bumps `total_paid_out`) also updates the matching `agent_landlord_float_allocations` row's `paid_out_amount`, using the same match ladder as the existing trigger: `agent_id + rent_request_id` first, fall back to `agent_id + tenant_id`, oldest `open`/`partially_paid` row. Without this, the next unrelated CFO funding re-derives `balance` from `SUM(remaining_amount)` and resurrects already-spent float.

Refinement on the pasted plan (verified against the live function): `apply_landlord_payout_to_allocation()` is already idempotent through `landlord_payouts.allocation_applied_id`. So instead of blanking the trigger, `deduct_agent_float_for_payout` will stamp `allocation_applied_id` with the allocation it consumed. That makes the trigger a natural no-op for this path (no double-add) while still covering payout rows that reach `pending_finops_disbursement`/`completed` without passing through the deduct RPC. The trigger body is left intact and gains a comment pointing at the deduct path as the primary writer.

### A2. Symmetric refund fix
`refund_agent_float_for_payout(p_payout_id, p_reason)` restores the amount to `agent_landlord_float.balance` but never reverses `paid_out_amount`. It will decrement `paid_out_amount` (floored at 0) on the allocation recorded in `allocation_applied_id`, and clear that stamp so the payout can be re-applied cleanly later.

`trg_alfa_status` already recomputes allocation `status` from `paid_out_amount` on every UPDATE, so no separate status write is needed in either direction.

### A3. Fold the pool into the headline totals
`refresh_wallet_totals_cache()` (live definition confirmed: single scan of `v_user_wallet_strict` plus a `targets` CTE for strict/drift) gains one variable, `v_landlord_float_total = SUM(balance) FROM agent_landlord_float`, added to exactly three outputs:
- `total_balance` — the hero number
- `total_float` — landlord float is float-type, not withdrawable, so the Operations Float sub-card still sums to the headline
- `strict_total` — added in lockstep, otherwise the change creates a permanent false drift / "Needs Review" on `WalletOverviewCard`

Untouched: `total_wallets`, `active_wallets`, `total_withdrawable`, `drifted_wallets`, `total_drift`.

### Files (A)
- One new migration, SQL only: `deduct_agent_float_for_payout`, `refund_agent_float_for_payout`, `apply_landlord_payout_to_allocation` (comment only), `refresh_wallet_totals_cache`.
- No frontend or edge-function changes — the hero card already reads `get_wallet_totals()` / `get_wallet_totals_strict()` off the cache.

### Verification (A)
1. Run `refresh_wallet_totals_cache()` then `get_wallet_totals()`; confirm `total_balance` and `total_float` each rose by `SUM(agent_landlord_float.balance)` and `strict_total` moved identically.
2. Trace one lifecycle: fund an allocation, refresh, confirm hero total up; deduct for a payout, refresh, confirm hero total down, `paid_out_amount` up, and a following unrelated allocation for the same agent does not revive the spent amount.
3. Confirm `WalletOverviewCard` stays on "Ledger reconciled" (no new drift).

## Workstream B — Email Transactions panel: operator clarity pass

Copy, labelling and confirmation work only on `src/components/financial-ops/EmailTransactionsPanel.tsx`. No matching, crediting or auto-debit logic changes. Reuses the file's existing `BadgeTip` tooltip and its existing swipe `AlertDialog` pattern.

### B1. Plain-English label maps (new consts near the top of the file)
`CHANNEL_LABELS` (`mtn_momo` → "MTN MoMo"), `MATCH_METHOD_LABELS` (translates `auto_match_method`, e.g. `late_email_tid_match`), `DB_FIELD_LABELS` (`deposit_requests.credited_at` → "our credit records"), `describeMatchSignal()` extracted from the existing inline ladder, and `humanizeEnumFallback()` so an unmapped future value never renders raw or `undefined`. Visible chips show only the translated label; raw values are demoted into `BadgeTip` details or a `title` attribute. `DebugPollDialog` stays technical by design.

### B2. Filter pills
`'Needs routing 1 · money in'` → `'Incoming — needs routing'`, `'Needs routing 2 · money out'` → `'Outgoing — needs routing'`. Each of the four ambiguous pills (`needs_routing`, `needs_routing_out`, `unparsed`, `credited`) gets a `title` sourced from the existing explanatory code comments, plus one `HelpCircle` + `BadgeTip` legend near the "Mail labels" heading listing all four meanings in one discoverable place.

### B3. Distinguish the two confidence badges
Channel badge keeps its `%` but reads as a labelled channel name with a muted "channel match" caption. Match-confidence badge moves to a distinct hue family so the two are never confusable by colour. One `HelpCircle` legend near the layout toggle explains high/medium/low confidence, reusing wording already in the file.

### B4. Confirmation dialog for money-moving bulk actions (land last)
Generalize the existing `AlertDialog` into one shared dialog driven by new state (`pendingBulkAction` with kind + rows, plus an ack flag). It shows a dynamic title, an honest effect statement (money-moving for auto-debit, "does not move any funds" for the mark actions), an itemized scrollable preview with a bold total, a reversibility note (marks have a short Undo window; auto-debit is not trivially reversible), and a required acknowledgment checkbox for auto-debit only. Click handlers for `runAutoDebit`, `applyBulkMark`, `startRouteQueue` and `resolveAlertRows` open the dialog; confirm calls the unchanged functions with identical arguments. The blocking `window.prompt()` for bulk-mark reason is replaced by an in-dialog input feeding the existing `presetReason` param. `startHistoryQueue` is read-only and untouched.

### B5. "Nothing needs review" empty state
When a filter returns zero rows, show a `CheckCircle2` + bold line + helper line state (mirroring the existing true-empty copy), with helper text varying by active filter. `GmailStyleEmailList.tsx` is checked read-only to see whether it needs the same treatment.

### B6. Layout-toggle tooltip
A `title` on the existing Ops/Inbox layout button explaining what each mode is for.

### Sequencing (B) — separate reviewable commits
1. Quick wins: toggle tooltip, empty state, pill renaming.
2. Filter-pill legend and per-pill titles.
3. Label maps threaded through their call sites plus badge distinction.
4. Bulk-action confirmation dialog (highest risk, alone).

### Files (B)
- `src/components/financial-ops/EmailTransactionsPanel.tsx` — all changes.
- `src/components/financial-ops/GmailStyleEmailList.tsx` — read-only check for B5.
- No backend changes.

### Verification (B)
Typecheck after each phase. Then manually walk the panel: legends visible, badges visually distinct, unmapped enum falls back cleanly, empty state appears on a zero-row filter, and Auto-debit / Mark as paid in open a dialog with a correct itemized total before anything fires, with Cancel doing nothing.