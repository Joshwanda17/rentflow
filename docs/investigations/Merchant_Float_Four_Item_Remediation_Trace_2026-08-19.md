# Merchant Float — Four-Item Remediation Trace (read-only)

**Date:** 19 Aug 2026. **Writes performed:** none. No ledger, wallet, reconciliation or deposit row
was created, updated or deleted. No reversal has been posted.

---

## Item 1 — Double reversal of 14 Aug: CONFIRMED, still uncorrected

The two migrations are both present and both ran:

- `20260814140355_5908b849-2fce-4c2a-b0c2-7c21926e6e85.sql` — selects approved deposits created
  `2026-08-14 13:55:00+00 … 13:56:30+00`, posts `agent_float_deposit` / `cash_out` / `float` /
  `admin_correction`, key `sweep-reversal-<id>`, then flips each deposit to `rejected`.
- `20260814140634_6e4f5ee3-eef8-4a7b-9cde-7c467c54a0e9.sql` — three minutes later selects the **same**
  deposits by the same window, now matching on `status = 'rejected'` (i.e. exactly the rows the first
  migration had just rejected), and posts a second debit `system_balance_correction` / `cash_out` /
  `float` / `admin_correction`, key `sweep-reversal-balance-<id>`. The distinct category and
  idempotency key meant nothing deduplicated it.

Live state of that deposit window: **15 rows, UGX 32,810,000, all 15 `rejected`.**
Per-source_id leg census (`general_ledger` where `source_table='deposit_requests'`):

| Desk agent | Amount | Original credit | Reversal 1 (`agent_float_deposit`) | Reversal 2 (`system_balance_correction`) | Any later corrective credit | Last leg |
|---|---|---|---|---|---|---|
| Babrah Tusingwire | 2,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Bayo Mercy | 50,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Bayo Mercy | 110,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Bayo Mercy | 500,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Bayo Mercy | 5,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Catherine Nabaggala | 2,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Hilary Evanz | 2,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Hilary Evanz | 5,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| JOSHUA WANDA | 950,000 | 1 | 1 | 1 | 0 | 14 Aug |
| JOSHUA WANDA | 1,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| JOSHUA WANDA | 1,200,000 | 1 | 1 | 1 | 0 | 14 Aug |
| NABBALE CLAIRE | 2,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| NABBALE CLAIRE | 3,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Nankambo Sharimah | 3,000,000 | 1 | 1 | 1 | 0 | 14 Aug |
| Tugabirwe Apophia | 5,000,000 | 1 | 1 | 1 | 0 | 14 Aug |

Exactly the predicted shape: one credit, two debits, **no third corrective leg since**. Net wrong
debit **UGX 32,810,000** across 9 desks; total debited UGX 65,620,000 against UGX 32,810,000 of
credit.

**The money was real.** All 15 deposits carry a provider TID (`mtn` / `airtel`) that matches a row in
`gmail_transactions` **exactly by `transaction_id`** — 15/15. The first migration also NULLed
`gmail_transactions.linked_deposit_request_id` for each, so the provider evidence is now orphaned
from its deposit while the deposit itself reads `rejected` with the reason "not an approved credit".
That statement is factually wrong for all 15 rows.

Remediation shape when authorised: one compensating **credit** per source_id for the second debit
only (UGX 32,810,000 total), individually keyed, plus re-link of the `gmail_transactions` rows and
correction of the misleading rejection reason. Note the trap in
`mem://constraints/user-facing-ledger-filter`: an `admin_correction` credit is filtered out of
`v_user_wallet_strict`, so a naive `admin_correction` compensating credit will post but will not move
the displayed float. It must be `production` with an explicit evidence reference.

---

## Item 2 — Bayo Mercy duplicate opening balance: ALREADY CORRECTED. Do not apply the draft.

The draft migration `20260817130000_fix_balance_baseline_bayo_mercy_landlord_payout_matching.sql`
**does not exist in the repo** (never tracked, and not present on disk now).

Live pre-check against her `agent_id` `cfa56623…`:

- `merchant_ledger_float()` = **UGX 500,000** — not the 49,780,000 the draft expects, and not 13,000.
- Her whole `36,780,000` history is two legs and only two:
  - 17 Aug 08:49 `agent_float_deposit` / `cash_in` / `production` — "Merchant desk opening balance recognised"
  - 17 Aug 11:00 `system_balance_correction` / `cash_out` / `admin_correction` — **"Reversal of duplicate merchant desk opening-balance recognition"**
- Legs sourced from `merchant_float_reconciliations` for her: 17 Aug 08:49 (36,780,000 credit),
  17 Aug 10:32 (9,402,000 write-down, "float set to 13000"), 18 Aug 10:18 (1,000,000). There is **one**
  opening-balance credit posted, not three; the 07:29 and 07:40 passes left no ledger credit.
- The 13,000 target was reached by the 10:32 write-down. The float then moved on legitimately: a
  5,000,000 `mtn` float deposit at 16:02 on 17 Aug and subsequent settlement activity, leaving 500,000.

**Conclusion: the duplicate is gone. Applying the draft as-is would post a fresh, unbacked
UGX 36,780,000 debit against a desk that currently holds 500,000 — creating the very defect it was
written to fix.** The draft should be deleted, not applied. If a further baseline change is ever
wanted it must be recomputed against the live figure with fresh evidence.

---

## Item 3 — General-purpose correction queue

**The queue is larger than the master report states.** Scoped as merchant-desk wallet float debits
since the 1 Aug anchor with those four reference prefixes: **162 legs, UGX 639,264,680** (161 legs /
639,214,680 restricting to `is_active` desks). The report's "101 legs / UGX 374,895,199" is a subset.

| Prefix | Category | Legs | Amount |
|---|---|---|---|
| `FXW-*` | `agent_float_assignment` | 111 | 370,037,880 |
| `ECW-*` | `agent_float_assignment` | 25 | 132,989,824 |
| `FLT2WDR-*` | `agent_float_assignment` | 15 | 99,930,000 |
| `PAY-*` | `system_balance_correction` | 11 | 36,306,976 |

(Outside the anchor window the same prefixes carry a further ~UGX 460m of history on merchant desks,
back to Apr 2026 — out of scope here but it exists.)

### Authorship, roles at posting, evidence

`general_ledger` has **no operator column**, so authorship was recovered from
`audit_logs.metadata->>'reference_id'` (`finops_wallet_move`, `admin_float_to_withdrawable`, which
store `caller_roles` = the roles held **at posting time**) and from `error_correction_audit`
(`operator_roles`, `business_justification`). Every one of the 162 legs resolved to a named operator.

| Operator | Legs | Amount | Legs on a desk they themselves own | Legs with no `financial_ops`/`cfo` in roles at posting |
|---|---|---|---|---|
| Nankambo Sharimah | 147 | 554,500,089 | 91 | 118 |
| Joshua Wanda | 6 | 53,691,610 | 5 | 3 |
| Bayo Mercy | 9 | 31,072,981 | 1 | 9 |

Two structural control findings, independent of note quality:

- **Self-service on own desk: 97 legs, UGX 409,098,926** were posted by the operator against a desk
  whose `agent_id` is the operator. The largest are `FLT2WDR` 83,000,000 (Nankambo, 6 Aug,
  `[wrong_bucket] Supposed bd W…`), `ECW` 50,000,000 (Joshua Wanda, 10 Aug, "BACK TO PLATFORM"), and a
  run of `FXW` legs noted only "PARTNERSHIP" / "PARTBERSHIP" (42m, 30m, 30m, 20m, 20m, 15m, 13m, 12m,
  10m …).
- **No finance role at posting: 130 legs.** All 11 `PAY-*` legs carry **no recorded roles at all** —
  no `audit_logs` row with that `reference_id` exists, so there is no role or justification trail for
  them beyond the auto-generated ledger description. 9 of the 11 (UGX 29,306,976) also have no TID.

### Provider corroboration

TID corroboration tested as an amount match in `gmail_transactions` within −3/+1 days of the leg
(these are internal reclassifications, so most are not expected to have one): **58 of 162 legs have
no provider match** — `FXW` 26, `ECW` 19, `PAY` 9, `FLT2WDR` 4.

### Named candidates for reversal — no evidence AND no intelligible justification

Only these four meet both tests (no provider match, operator note absent or consonant-run gibberish).
**Total UGX 2,035,800. Nothing has been reversed.**

| Date | Desk | Amount | Prefix | Operator | Roles at posting | Operator note |
|---|---|---|---|---|---|---|
| 2026-08-01 | Nankambo Sharimah | 1,200,000 | `PAY` | Nankambo Sharimah | (none recorded) | `Requesred for 3vand given 2 nhggg` |
| 2026-08-11 | Nankambo Sharimah | 420,000 | `FXW` | Nankambo Sharimah | `operations, manager` | `HHDGDGVGF HHH` |
| 2026-08-12 | Bayo Mercy | 295,800 | `ECW` | Bayo Mercy | `operations, manager` | `gthngdfghjkmnhhj` |
| 2026-08-17 | Nankambo Sharimah | 120,000 | `FXW` | Nankambo Sharimah | `operations, manager` | `wantsbffggg` |

A second, larger tier is *not* proposed for reversal but should be evidenced or written off by CFO
decision: the 97 self-desk legs (UGX 409,098,926), and specifically the ten `FXW`/`FLT2WDR` legs over
UGX 10m whose entire justification is the single word "PARTNERSHIP" (or a typo of it) with no
counterparty, portfolio id or TID recorded.

---

## Item 4 — "Sweep" credits: no unevidenced credits exist; the sweep keys are Item 1

Every `general_ledger` wallet leg on a merchant desk with a `sweep`-prefixed idempotency key:

| Direction | Category | Classification | Legs | Amount | Dates |
|---|---|---|---|---|---|
| cash_out | `agent_float_deposit` | `admin_correction` | 15 | 32,810,000 | 14 Aug |
| cash_out | `system_balance_correction` | `admin_correction` | 15 | 32,810,000 | 14 Aug |

**30 legs, UGX 65,620,000 — and all 30 are debits, keyed `sweep-reversal-*` / `sweep-reversal-balance-*`.
There are zero `sweep`-keyed credits.** The "up to UGX 65,620,000 of sweep credits" in the master
report is the *reversal* population double counted, not a credit exposure.

The underlying credits the sweep created are the 15 `deposit_requests` in Item 1. Matched against
`gmail_transactions` by TID:

| Provider | Deposits | Amount | Exact TID match in `gmail_transactions` |
|---|---|---|---|
| mtn | 8 | 16,660,000 | 8 |
| airtel | 7 | 16,150,000 | 7 |
| **Total** | **15** | **32,810,000** | **15 / 15** |

**Nothing to flag.** The claim that ~UGX 22.65M was "auto-credited from internal gap arithmetic with
no independent provider match" does not hold: every one of the 15 carries a provider TID that exists
verbatim in the provider feed. The defect in this population is not a phantom credit — it is the
double debit of Item 1 against real, evidenced provider cash, compounded by the sweep having NULLed
the `linked_deposit_request_id` that proved it.

---

## Summary of what is actually owed remediation

| Item | Status | Net wrong amount | Action |
|---|---|---|---|
| 1. Double reversal 14 Aug | Confirmed, uncorrected | **UGX 32,810,000** under-credited across 9 desks | Post one compensating `production` credit per source_id; re-link provider rows; fix rejection reasons |
| 2. Bayo Mercy 36.78m | **Already reversed 17 Aug 11:00** | 0 | Delete the stale draft; applying it would create a new 36.78m error |
| 3. Correction queue | Larger than reported (162 legs / 639.3m) | 4 legs / **UGX 2,035,800** fully unjustified; 97 legs / 409.1m self-authored on own desk | CFO decision list; no reversal executed |
| 4. Sweep credits | Population misidentified; 15/15 TID-evidenced | 0 phantom credits | Nothing to flag; folds into Item 1 |

All figures reproducible with read-only SQL against `general_ledger`, `deposit_requests`,
`gmail_transactions`, `audit_logs`, `error_correction_audit`, `merchant_float_reconciliations`,
`cashout_agents`, `profiles` and `wallet_strict_for_user()`.