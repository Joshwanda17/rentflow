# Self Portfolio Management — Eligibility Status, Principal Locking & Money Destination

**Date:** 2026-08-04
**Status:** Design review. No code or database objects changed by this document.
**Scope:** Which rent requests partners may see and claim, what happens when the request is
deleted or its amount is edited, whether the partner's principal moves when the rent price
moves, and where partner money should physically land.

---

## 0. Executive summary

Your two instincts are both correct, and one of them is more correct than you realise.

1. **"Wait until Tenant Ops approves"** — right in spirit, but the sharper line is
   `landlord_ops_approved`. Tenant Ops validates the *tenant*; Landlord Ops validates the
   *house, the landlord and the payout destination*. Partner money is exposed to all three.
   Showing a plan after Tenant Ops but before Landlord Ops means a partner can fund a
   tenancy whose landlord is not yet verified — the exact failure mode that causes an
   unrecoverable disbursement.
2. **"We can lock it"** — this is the load-bearing decision of the whole feature. The amount a
   partner sees must stop being a live read of `rent_requests.rent_amount` and become a
   **frozen quote** captured at claim time. Without that freeze, every downstream number
   (principal, returns, term, payout schedule) silently mutates whenever an agent edits the
   request. Locking is not an optimisation; it is the correctness requirement.
3. **Landlord float on the relevant agent's wallet is the right destination.** It is the same
   rail the company already uses for its own rent funding (317 of the routed funded requests
   are `wallet`), it keeps the agent accountable for delivery to the landlord, and it keeps the
   partner's support visibly attached to a named tenant instead of being blended into a pool.
   An investment-pool destination would quietly convert "support this tenant" into "buy a
   share of our book", which is a different product and a heavier regulatory posture.

The one risk you did not raise, and the one most likely to cost real money: **nothing today
stops the CFO funding a request while a partner holds a claim on it.** Same rent, paid twice.

---

## 1. What the system looks like right now

| Fact | Value |
|---|---|
| `v_partner_self_fundable_plans` rows today | **0** |
| `partner_self_plan_claims` rows ever | **0** |
| `partner_self_commitments` rows ever | **0** |
| Live unfunded pipeline | 153 requests / UGX 64.9M |
| Requests past Landlord Ops, unfunded | 7 / UGX 1.75M |
| Requests with `supporter_id` set (of 964 funded) | 1 |
| Requests with `self_funding_partner_id` set | 0 |
| Claim hold window | 10 minutes (`partner_self_claim_plans`) |
| Assumed return rate in `partner_self_confirm_commitment` | 15 (hardcoded) |

The marketplace is starved because the view requires `coo_reviewed_at IS NOT NULL`, while the
COO stamp and the CFO cheque land a median 3.15 minutes apart. The queue is empty by
construction, not by lack of demand.

---

## 2. The eligibility question: what status should partners see?

### 2.1 Options on the table

| Boundary | Plans today | UGX today | Verification complete? | Verdict |
|---|---|---|---|---|
| `pending` | 130 | 55.5M | Nothing verified | **No.** Raw agent submissions, oldest 42 days. Includes junk and duplicates. |
| `agent_ops_approved` | 14 | ~7.0M | Agent only | **No.** Tenant identity unverified. |
| `tenant_ops_approved` | 2 | 0.6M | Agent + tenant | Defensible but house/landlord unverified. Your first instinct. |
| **`landlord_ops_approved` (+ `coo_approved`)** | **7** | **1.75M** | Agent + tenant + landlord + house + payout destination | **Recommended.** |
| `coo_approved` only | 0 | 0 | Everything | Empty by construction — the current bug. |

### 2.2 Why `landlord_ops_approved` and not `tenant_ops_approved`

A partner funding decision is irreversible in practice: once money reaches a landlord, recovery
depends on the agent and the tenant's goodwill. The three things that can destroy the
principal are (a) the tenant does not exist / cannot pay, (b) the house does not exist or is
already occupied, (c) the landlord payout destination is wrong. Tenant Ops closes (a) only.
Landlord Ops closes (b) and (c). Funding between the two gates buys ~3 extra plans today at
the price of exposing partners to the two failure modes that are hardest to explain to them
afterwards.

**Recommendation:** show `landlord_ops_approved` and `coo_approved`, ordered oldest-first, with
the `coo_reviewed_at` predicate removed and replaced by the true "still needs capital" test:

```sql
funded_at IS NULL
AND supporter_id IS NULL
AND self_funding_partner_id IS NULL
AND tenancy_status = 'active'
AND status IN ('landlord_ops_approved','coo_approved')
AND rent_amount >= 50000
```

Also prune the three dead status labels (`approved`, `agent_verified`, and the redundant
pre-Landlord-Ops entries) — no live row uses them and they create the illusion of coverage.

### 2.3 The volume problem, stated honestly

7 plans is a thin marketplace. But the fix for thinness is **ops throughput, not a looser
predicate**. There are 130 `pending` requests averaging 5.5 days of wait, oldest 42 days. If
Agent Ops clears that backlog, supply at the `landlord_ops_approved` boundary becomes tens of
plans per day, because the three mid-pipeline stages each clear in under 3 hours on average.
Loosening the boundary to fill the shelf is borrowing safety from partners to cover an
internal SLA failure. Do not do it. Surface the backlog to Agent Ops instead.

---

## 3. Deletion and amount edits — the real threat model

Today the partner-facing amount is a **live read**. `v_partner_self_fundable_plans.funding_amount`
derives from `rent_requests.rent_amount`, and the UI (`SelfPortfolioFundingCard`) sums
`plan.funding_amount` at render time. Meanwhile the request remains fully mutable: agents can
edit the amount (including after Landlord Ops, when a landlord-float rejection forces a
re-quote), and can move it to `deleted_by_agent` — 79 requests already sit in that status, and
1 in `cancelled`.

### 3.1 Four windows, four different exposures

```text
 W1  browse         W2  claim held        W3  committed, not disbursed   W4  disbursed
 ───────────────▶   ──10 min──▶           ─────────────────────────▶     ─────────────▶
 mutation = fine    mutation = must void  mutation = must be blocked     mutation = irrelevant
                    or re-quote           or re-priced with consent      (money is gone)
```

- **W1 browse.** Edits and deletions are harmless. The list is a snapshot; refresh corrects it.
- **W2 claim held (10 min).** An edit here means the partner is looking at a stale price. Today
  they would commit at the *new* amount without being told. Must become: claim stores the
  quoted amount; if `rent_amount` changes, the claim is voided with a clear
  "the rent for this tenant changed from X to Y — review and re-claim" message.
- **W3 committed but not yet disbursed.** This is the dangerous window and the one your
  landlord-float-rejection scenario lands in. The partner has a signed commitment and a
  principal figure. An agent edit here must **not** silently repoint the commitment.
- **W4 disbursed.** The rent is paid at the committed amount. Later rent changes are a *new*
  tenancy fact, not a retroactive change to this principal.

### 3.2 The lock, concretely

Three layers, in order of importance:

1. **Quote freeze at claim.** `partner_self_plan_claims` already carries an `amount` column.
   Treat it as the authoritative quote, and have `partner_self_confirm_commitment` validate
   that the request's current `rent_amount` still equals the claimed `amount`. If it does not,
   fail the commit with a re-quote error rather than committing the new number.
2. **Mutation lock while claimed or committed.** A `BEFORE UPDATE` guard on `rent_requests`
   that rejects changes to `rent_amount`, `daily_repayment`, `tenancy_status` and status
   regressions while an active claim or an undisbursed commitment exists. The agent gets a
   human message: "This tenant is currently being funded by a partner. Release the funding
   hold before editing." A parallel guard blocks `deleted_by_agent` / `cancelled` transitions
   in the same state.
3. **CFO race guard.** The CFO payout step must respect the claim hold. Without this, the
   company and the partner can both pay the same rent — and because `funded_at` is the reliable
   money signal while `disbursed_at` is only populated on 393 of 964 rows, the duplicate would
   not be obvious from the timestamps alone.

### 3.3 What should *not* be locked

Do not freeze the whole request. Photos, notes, landlord contact corrections, LC1 details and
ops annotations must stay editable — locking them would stall ops work for 10 minutes at a
time and ops will start cancelling claims to get their job done. Lock **money fields and
lifecycle status only**.

---

## 4. Does a rent price change move the partner's principal?

**It must not.** The principal is the amount the partner actually parted with, at the moment
they parted with it. Once frozen it is an accounting fact, not a derived value.

| Event | Effect on committed principal | Correct handling |
|---|---|---|
| Rent edited **before** claim | None | New quote appears in the list |
| Rent edited **during** the 10-min hold | None | Void the claim, show old → new, require re-claim |
| Rent edited **after** commitment, **before** disbursement | None | Blocked by the mutation lock. If the change is genuinely required (landlord float rejected the amount), ops must **release** the commitment: refund the partner's hold in full, then re-list the request at the new amount. The partner may re-claim, or not. |
| Rent edited **after** disbursement | None | Principal is closed. Any shortfall is a new funding need; any excess is a tenant credit. Never retro-adjust. |
| Rent **reduced** below UGX 50,000 | None | Request drops out of the marketplace for future claims only |
| Request deleted / cancelled after commitment | None | Full principal refund to the partner's withdrawable balance, commitment marked `voided`, partner notified |

The distinction that matters: **quotes float, principals do not.** Every number a partner is
shown before commitment is a quote and may change with notice. Every number after commitment
is a principal and changes only through an explicit, logged, refund-and-reissue cycle.

A secondary consequence worth flagging: because the return rate is currently hardcoded to 15
inside `partner_self_confirm_commitment`, the returns figure is already independent of the rent
amount. Good — that means freezing the principal is sufficient; the returns schedule does not
need a separate lock. But the rate should move into a config row before launch, so a rate
change does not require a function deploy and cannot accidentally reprice historic commitments.

---

## 5. Where should the money land?

### 5.1 The three candidates

**A. Landlord float on the relevant agent's wallet — recommended.**
The partner's money credits the agent's `float_balance`, earmarked to that tenant's rent, and
the agent pays the landlord exactly as they do for company-funded rent. This reuses the rail
that already carries the overwhelming majority of funded requests, so no new disbursement
mechanics, no new reconciliation surface, and no new failure mode. Crucially it preserves the
product promise: the partner supported *this tenant*, and there is a named agent answerable
for delivery. It also keeps float money in the float bucket — never withdrawable — which is
exactly what the three-bucket wallet model requires for company-directed funds.

*Cost:* the agent becomes a custodial hop. If the agent is frozen, suspended, or absconds
between credit and landlord payment, the partner's money sits in limbo. Mitigations: block
claims on requests whose agent is frozen or suspended; set a delivery SLA (e.g. 24h) with
escalation to Landlord Ops; require the existing delivery-confirmation write so the partner can
see "paid to landlord" rather than merely "funded".

**B. Direct to the landlord.**
Cleanest on paper, worst in practice. Many landlords have no verified payout destination, the
company loses the agent's collection relationship, and delivery failures become the company's
direct liability with no field agent to chase. Also strips the agent of the commission that
motivates collection.

**C. Into the investment pool.**
Operationally easiest and the worst fit for the stated aim. It converts a specific, visible act
of support into an undifferentiated claim on the company's book. Partners lose the tenant-level
connection that is the entire reason this feature exists, and the product drifts toward a
collective investment scheme — a materially heavier compliance posture than tenant-specific
support. Your instinct here is right and I would not soften it.

### 5.2 Recommendation

Route to **landlord float on the relevant agent's wallet**, with:
- claim eligibility gated on the agent being active and unfrozen;
- the credit landing in `float_balance` (never withdrawable), stamped with the tenant and the
  partner commitment;
- a delivery confirmation the partner can see;
- `self_funding_partner_id` stamped on the request at commitment, so the CFO queue visibly
  excludes it and the double-pay race closes by data rather than by convention.

---

## 6. Case scenarios

**S1 — Happy path.** Landlord Ops approves a UGX 250,000 request. It appears in the
marketplace. Partner claims (10-min hold, quote frozen at 250,000), confirms. Principal
250,000 debited from withdrawable, credited to the agent's landlord float earmarked to the
tenant. Agent pays the landlord, confirms delivery. Request goes `funded` → `repaying`.
Partner sees monthly returns at the configured rate. CFO never sees the request.

**S2 — Agent edits the amount during the hold.** Partner is holding at 250,000; agent changes
it to 300,000. Claim is voided on confirm attempt. Partner sees "Rent for this tenant changed
from UGX 250,000 to UGX 300,000 — review and claim again." No principal moved. This is the
scenario your landlord-float-rejection concern produces most often, and it resolves cleanly.

**S3 — Landlord float rejected *after* commitment.** Agent needs the amount changed but the
mutation lock blocks it. Ops releases the commitment: 250,000 refunded in full to the partner's
withdrawable balance, commitment marked `voided` with a reason, partner notified. Request is
re-listed at 300,000. The partner may re-claim. **The principal never silently became 300,000.**

**S4 — Request deleted after commitment.** Same as S3: full refund, void, notify. The agent
cannot reach `deleted_by_agent` while a commitment is live without going through ops release —
which is the point, given 79 requests already sit in that status.

**S5 — CFO funds a claimed request (the current live bug).** Today: company pays and partner
pays; UGX 250,000 leaks. With `self_funding_partner_id` stamped and the CFO queue excluding
claimed/committed rows, the CFO simply never sees it.

**S6 — Two partners race for one plan.** First claim wins via the existing claim insert; the
second gets a "claimed by another partner" response. Already handled by
`partner_self_claim_plans`; needs a clear UI message, not new logic.

**S7 — Hold expires mid-checkout.** Partner takes 12 minutes. Claim auto-expires (the RPC
self-heals stale holds on next call). Commit fails with an expiry message; the plan returns to
the shelf. Consider a visible countdown in the card.

**S8 — Tenant defaults.** Per the existing self-managed model, the company absorbs tenant
default on self-managed funding. The partner's principal is protected; recovery runs through
the normal default-recovery ledger. Worth restating in the partner-facing terms, because it is
the single biggest reason a partner will choose self-managed over the managed pool.

**S9 — Agent frozen between credit and landlord payment.** Partner money is stranded in a
frozen agent's float. Prevention: block claims where the agent is frozen. Cure: Landlord Ops
reassigns the tenant and the earmarked float to a new agent, with an audited float transfer.

**S10 — Rent reduced below the 50,000 floor after commitment.** Principal unchanged. The
request simply stops being claimable for future partners.

---

## 7. Recommended sequence

| # | Change | Why it is in this position |
|---|---|---|
| 1 | Stamp `self_funding_partner_id` at commitment and exclude claimed/committed rows from the CFO payout queue | Closes an active double-pay hole. Highest value, smallest change. |
| 2 | Re-cut `v_partner_self_fundable_plans` to `landlord_ops_approved` + `coo_approved`, drop the `coo_reviewed_at` predicate, prune dead statuses | Turns 0 plans into 7 and makes the feature exist |
| 3 | Treat the claim `amount` as a frozen quote; make `partner_self_confirm_commitment` reject amount drift | Makes the principal an accounting fact |
| 4 | Mutation lock on `rent_amount` / `daily_repayment` / lifecycle status while claimed or undisbursed | Stops S3/S4 from corrupting live commitments |
| 5 | Ops "release commitment" path with full refund + audit + partner notification | The escape valve that makes the lock tolerable |
| 6 | Agent-eligibility gate on claims (not frozen, not suspended) + delivery confirmation visible to the partner | Prevents S9 and makes the support visible |
| 7 | Move the hardcoded rate (15) into config | Prevents accidental repricing and a deploy-per-rate-change |
| 8 | Surface the 130-row / 42-day `pending` backlog to Agent Ops as the supply constraint it is | Fixes thin supply the honest way |

---

## 8. Honest reservations

- **Supply is the binding constraint, not the view.** Even perfectly re-cut, this marketplace
  offers 7 plans today. If Agent Ops does not clear the backlog, partners will open an empty
  shelf and stop coming back. Ship items 1–5, then measure supply before promoting the feature.
- **The agent custody hop is a real, accepted risk.** Landlord float is the right destination,
  but it means partner money passes through an individual's float bucket. That is only
  acceptable with the agent-eligibility gate, the delivery SLA and visible confirmation. Do not
  ship the routing without them.
- **`disbursed_at` is not trustworthy** (393 of 964). Any partner-facing "paid to landlord"
  indicator should be driven by an explicit delivery confirmation, not by that column.
- **Locking will generate ops friction**, and ops will look for a way around it. Ship the
  release path (#5) in the same change as the lock (#4), or the lock will be worked around
  within a week.
- **Terminology.** Partner-facing copy must say Rent Plan, Supporter and Returns — never Loan,
  Lender or ROI — and every state change here needs its `system_events` emission and trust-score
  contribution, same as any other user-facing action.

---

*Prepared as a design review. Nothing in this document has been implemented.*