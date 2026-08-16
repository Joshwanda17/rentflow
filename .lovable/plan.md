# Remediation plan — merchant float overstatement (38,973,832 → evidenced 5,000)

Read-only until approved. No ledger writes, no reconciliation entries, no schema changes are made by this plan document.

## Step 0 — Stop the bleeding on the reporting surface (SHIP THIS FIRST, ON ITS OWN)

This step is executed and verified **before any work begins on Steps 1–5**. It is a standalone unit of work: nothing in Steps 1–5 is started until Step 0 is live and confirmed on the CFO board. Rationale: every hour the board keeps showing UGX 38,973,832 as spendable float is an hour a treasury decision can be made on a number the ledger does not support. Removing that exposure does not depend on any of the deeper fixes, so it must not wait for them.

- `get_merchant_float_positions()` gains an evidence classification per desk: `evidenced`, `asserted_only`, `clamp_artifact`, `unverified_other`.
- The headline total on "Money With Merchant Agents" reports the **evidenced** total only. Asserted and clamp-artifact amounts move into a clearly separated "Unverified — excluded from float" block with the reason per desk.
- No desk is deleted or zeroed in the database at this stage. No ledger writes, no reconciliation entries, no wallet mutations — read/derive and display only. This is presentation truth, so the CFO stops seeing a number they could act on while the underlying books are still under investigation.
- Step 0 exit criteria, all of which must hold before Step 1 is opened: the board headline equals the evidenced total; every excluded desk shows an explicit reason; the previously displayed 38,973,832 no longer appears anywhere as available float; and the 15-desk classification matches the read-only audit anchored 2026-08-16 23:59:59+03.

## Step 1 — The clamp: make suppressed debits visible instead of absorbed

The clamp stays (removing it would let live edge functions fail mid-settlement), but it stops being silent and stops being lossy in reporting.

- `apply_wallet_movement` continues to floor the cached bucket at zero, but every clamp event records the **full suppressed amount** — desk, bucket, category, ledger entry id, requested delta, resulting shortfall — into the existing `wallet_overdraw_events` table, which today logs the clamp but is not consumed by any float reporting path.
- A new derived figure, `clamped_shortfall`, is exposed per user from the strict pivot (`v_user_wallet_strict`) so any surface showing a bucket balance can also show "this figure is X higher than the ledger supports."
- Desks whose balances are genuinely correct are unaffected: their clamped shortfall is zero, so nothing about their display changes. That is the safety property — the change is additive and only surfaces on desks that were already wrong.
- Float availability gates (claim eligibility, payout reservation) switch to `min(cache, ledger_net)` so a clamp artifact can never authorize a real payout. This is the same strict-rule shape already used for withdrawable balance.

## Step 2 — Authorization on `merchant_float_reconciliations`

- Write access (insert/update) restricted to `cfo`, `financial_ops`, `manager`, `super_admin` via RLS + explicit grants. Merchant agents lose write access entirely; they keep read access to their own desk.
- Self-authorship is blocked regardless of role: no row may be authored by the holder of the desk it credits.
- Evidence becomes structurally required for any type that increases a desk position (`opening_balance`, `reimbursement_recorded`): a provider reference (TID / MoMo transaction id) or an explicit named waiver with a reason. Reason-length alone is not evidence.
- **Existing non-authorized rows are not deleted and not silently corrected.** They are marked `authorization_status='unauthorized_legacy'` and excluded from every position calculation. Each one then needs a named human decision — ratify (with evidence attached) or reverse. Ratification is a new, attributable row, never an in-place edit of history.

## Step 3 — The `display_only` double-count

- `trg_stamp_merchant_reconciliation_truth` stops forcing a constant. It derives `ledger_effect` from what actually happened: `posted` when a balance-moving production leg exists for that reconciliation, `display_only` only when none does.
- The 14 affected rows are corrected **by reclassification, not by a compensating write**. Their `ledger_effect` is restated to `posted` so the aggregation stops adding them on top of the ledger leg that already carries them. No reversing ledger entry is created, because no ledger entry was wrong — only the label was. This is the single-write property you asked for.
- A regression guard asserts the invariant directly: for every reconciliation row, `ledger_effect='display_only'` implies zero matching production legs. This runs in the existing payout acceptance test suite.

## Step 4 — Auto-remediate vs. human sign-off

**Auto-remediable (mechanical, no judgment):**
- Presentation reclassification of desks into evidenced / unverified buckets.
- `ledger_effect` restatement for the 14 mislabeled rows.
- Backfill of `clamped_shortfall` diagnostics.
- Tightening of grants, RLS, and the self-authorship block.

**Requires a named human sign-off, per desk, recorded with identity and reason:**
- **The 10,888,671 (Tugabirwe Apophia, Hilary Evanz).** Real money left the company, was credited once and reversed twice, and there is no trace of restoration. Restoring it naively re-creates a discrepancy: Hilary's TIDs are already in `ledger_reconciled_tids` (replay is a silent no-op), Tugabirwe's replay would over-credit, and both desks have overlapping `needs_review` out-of-pocket claims for the same shortfall. Correct sequence: resolve or void the overlapping out-of-pocket claims first, then post one balanced, attributable correction per desk for the exact evidenced amount, with the CFO named on it. No automation touches this.
- **The Bayo Mercy authorship pattern.** A merchant agent authored balance-creating entries about her own desk and others while holding the largest position on the board. That is a governance and possibly conduct matter, not a data-cleanup task. Each of her entries needs individual adjudication; the pattern itself needs a decision from the CFO/COO about the entries' standing.
- **Every `unauthorized_legacy` row**: ratify with evidence, or reverse.

## Step 5 — Catching this class of defect automatically

Three independent layers, because each of the three root causes fails differently.

1. **Clamp-drift detector (scheduled).** A recurring check comparing every wallet bucket against the strict pivot, raising an alert whenever `cache − ledger_net > 0` on a merchant desk. This is the check that would have caught all 11 clamp-artifact desks on day one. It reuses the existing finance-anomaly alert framework (categorized `financial_integrity`, materiality-routed) rather than adding a new alert channel.
2. **Assertion-coverage check.** For every desk position, the share of the balance supported by provider-referenced evidence. Any desk over a materiality threshold whose evidenced share falls below a configured percentage raises an alert. A board total where evidenced coverage is under, say, 90% should page, not sit quietly.
3. **Structural regression tests.** Added to the payout acceptance suite: (a) `display_only` implies no production legs; (b) no reconciliation row is authored by its own desk holder; (c) no reconciliation row exists from a non-authorized role; (d) no merchant desk reports a float position exceeding its ledger net. These fail the build rather than waiting for a cron.

## What I will not do

- No writes of any kind until this plan is approved.
- No automated correction of the missing 10,888,671.
- No deletion or in-place rewriting of existing reconciliation history.
- No removal of the clamp itself (it would break live settlement paths); only its silence is removed.

## Verification once approved

- Board headline equals the evidenced total; excluded amounts are itemized with per-desk reasons.
- Clamp-drift detector, run against today's data, reproduces the 11 desks this audit found by hand.
- `owed_to_agent` drops by exactly the previously double-counted amount, with no new ledger rows created.
- Regression tests fail if any of the four structural invariants is reintroduced.