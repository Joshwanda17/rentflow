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

---

# Addendum A — 2026-08-04 (afternoon): pool-vs-lock, partner typing, and the booking model

**Trigger:** your response to §0.2 ("instead of locking it, why not move it to the investment
pool where other portfolios reside, and tag the partner/portfolio as self-managed?"), plus the
observation that tenant plans have now started appearing on the funder dashboard.

Nothing below is implemented. This addendum supersedes §0.2 and §3 where they conflict.

---

## A1. First, the good news: supply arrived, and your read of the status is right

Re-measured just now, against the live database:

| Fact | This morning | Now |
|---|---|---|
| Unfunded `coo_approved` requests | 0 | **33 / UGX 10.2M** |
| Unfunded `agent_ops_approved` | 14 | 10 / UGX 5.31M |
| Unfunded `pending` | 130 | 121 / UGX 57.97M |
| `landlord_ops_approved` rows **as a status value** | 0 | **0 — the status does not exist in data** |

Two corrections to the morning document:

1. **The shelf is no longer empty.** The 20 plans in your screenshot are real: they are the
   `coo_approved` (and residual `agent_ops_approved`) unfunded rows that the view now admits.
   The morning claim "empty by construction" was true at that moment and is now stale.
2. **`landlord_ops_approved` is not a status — it is a timestamp.** The lifecycle column only
   ever holds `pending → agent_ops_approved → coo_approved → funded → repaying → completed`
   (plus `rejected`, `cancelled`, `deleted_by_agent`). Landlord Ops sign-off is recorded as
   `landlord_ops_reviewed_at` / `landlord_ops_reviewed_by`, exactly as Tenant Ops is recorded as
   `tenant_ops_reviewed_at`. So the recommendation in §2 must be restated as a **predicate, not
   a status filter**:

   ```
   status IN ('coo_approved')            -- lifecycle gate
   AND landlord_ops_reviewed_at IS NOT NULL  -- house + landlord + payout destination verified
   AND tenant_ops_reviewed_at   IS NOT NULL  -- tenant identity verified
   ```

   Your screenshot is showing plans that satisfy the lifecycle gate but that were **never
   checked against the two review stamps**. That is the actual defect to fix, and it is a
   one-line change to the view — not a re-architecture.

**Answer to "or we get the agent_ops verified?":** no. Agent Ops verifies that the *agent* did
their paperwork. It says nothing about whether the tenant exists, the house exists, or the
landlord payout destination is correct. Partner money is exposed to all three. Agent Ops as the
shelf boundary would mean a partner can fund a house that turns out to be occupied, with no
verified account to pay the landlord — the one failure you cannot explain to a partner
afterwards. Keep Agent Ops as a *supply* metric, never as the funding gate.

---

## A2. Your proposal, stated precisely

> New self-management partners get their capital represented as a **portfolio row in the
> existing investment pool tables**, tagged as self-managed. Existing portfolios stay untagged
> (untagged ⇒ managed). Tenant selection becomes a **booking**, not a live funding quote — so
> the rent amount moving no longer corrupts anything.

This is a better idea than the one it replaces, for a reason worth naming: it changes what the
partner is buying. Under the morning design the partner buys *this tenant's rent at this price*,
so the price is a term of the deal and must be frozen. Under your design the partner buys
**capital placement of a fixed amount they chose**, and the tenant is the *destination* of that
capital. The amount is authored by the partner, not derived from the request — so there is
nothing to drift.

That is the correct primitive. The partner types "UGX 500,000". Nobody, including an agent
editing a rent request, can change that number.

---

## A3. Does the pool model remove the need for locking?

**It removes the need to lock `rent_amount`. It does not remove the need to lock the
allocation.** The lock does not disappear; it moves, and it gets much cheaper.

| What the morning design had to freeze | Under the pool/booking model |
|---|---|
| `rent_amount` (the quote) | **Not frozen — irrelevant.** Partner authors their own amount. |
| `daily_repayment`, `duration_days`, `total_repayment` | **Not frozen.** Returns come from the portfolio's own rate/term, not the tenant's schedule. |
| Term & maturity | From the portfolio row (`duration_months`, `roi_percentage`) — already a locked contract today. |
| Principal | The partner's typed commitment. Immutable by construction. |
| **The booking itself** | **Must still be exclusive.** One tenant plan cannot be booked twice, and the CFO must not fund a booked plan with company money. |
| **Delivery of the booked capital** | Must still be tracked: booked → capital placed → delivered to landlord float → landlord paid. |

So the residual lock is: *a booked plan is off the shelf, and off the CFO queue, until it is
delivered or released.* That is the `self_funding_partner_id` stamp already recommended as
item #1 in §7 — and item #1 was always the highest-value, smallest change. Items #3 and #4 (quote
freeze, mutation lock on rent fields) can be **dropped entirely** under this model. That is a
real simplification, and it is the strongest argument for your proposal.

**Consequence you should accept explicitly:** if the partner books UGX 500,000 against a tenant
whose rent is later re-quoted to UGX 400,000, the partner's principal stays at 500,000 and the
surplus 100,000 stays as unallocated capital in their portfolio, available for the next booking.
Under the old model that scenario voided the claim. Under this model it is a routine remainder.
This is strictly better ops behaviour, and it is why the release path (§7 item #5) becomes a
"re-book" rather than a "refund".

---

## A4. Partner typing: how to classify without a backfill

You are right that no backfill is needed, and the way to guarantee that is **absence-as-default**.

Two viable shapes:

**Option 1 — a nullable column on `investor_portfolios` (recommended).**

```
management_type text NULL   -- 'self' for new self-managed portfolios; NULL = managed (legacy + default)
```

- All 1,005 existing portfolio rows keep `NULL` and are read as managed. No UPDATE, no migration
  risk, no re-derivation of anything already paying returns.
- Every read site that cares uses `management_type = 'self'` or
  `coalesce(management_type,'managed')`. Sites that don't care are untouched.
- Do **not** add a `DEFAULT 'managed'` and do **not** make it `NOT NULL` — that forces a table
  rewrite and, worse, asserts a classification for 1,005 rows that were created before the
  concept existed.
- Constrain the vocabulary (`CHECK (management_type IN ('self'))`) rather than enumerating
  managed, so the untagged state stays the single meaning of "legacy/managed".

**Option 2 — a separate `partner_self_portfolios` link table.**
Cleaner isolation, zero risk to the hottest financial table in the system, but every partner
dashboard read gains a join and every reconciliation query gains a way to be wrong. Prefer
Option 1 unless the portfolio table is under change-freeze.

**Partner-level vs portfolio-level typing.** Type the **portfolio**, not the partner. A partner
may legitimately hold one managed portfolio and one self-managed portfolio; typing the person
forces an artificial exclusivity and breaks the moment someone converts. If you want a
partner-level convenience flag, derive it (`EXISTS self portfolio`) — never store it twice.

**What the self-managed tag must change downstream (each of these is a decision, not a detail):**

| Surface | Managed (untagged) | Self-managed (`'self'`) |
|---|---|---|
| Capital allocation | Company allocates across the book | Partner books named tenant plans |
| Return rate | Existing managed rate | Same rate (per the standing decision) — but read from config, not the hardcoded `15` |
| Tenant default | Company absorbs | Company absorbs (unchanged — this is the selling point) |
| Withdrawal | Existing 90-day notice | Same notice; capped by uncommitted capital only |
| Payout cadence | Monthly | Monthly, with daily/weekly display equivalents |
| Unallocated capital | N/A | Must be visible, and must not accrue as if placed |

That last row is the one most likely to be missed. Booked-but-undelivered and
never-booked capital are different states, and only *placed* capital should accrue returns.
Paying returns on idle capital is the fastest way to turn this product into an unfunded
liability.

---

## A5. Booking, not funding: the state machine this implies

```
portfolio (self)  →  capital available
     │
     ├── partner books a plan            → booking: reserved
     │       plan leaves the shelf, plan leaves the CFO queue
     │
     ├── capital placed                  → booking: placed      (accrual starts here)
     │       credited to the agent's landlord-float bucket for that tenant
     │
     ├── agent pays landlord             → booking: delivered   (delivery confirmation, not disbursed_at)
     │
     └── ops release / plan dies         → booking: released    (capital returns to available, no refund flow)
```

Four rules that make this safe:

1. **Exclusivity.** One live booking per rent request. Enforced by a unique partial index on the
   request id where the booking is live, not by application logic.
2. **CFO queue exclusion.** A reserved plan is invisible to the CFO payout queue. This is the
   double-pay hole from §0 and it is still the single most expensive open risk.
3. **Accrual starts at `placed`, never at `reserved`.** Otherwise the partner earns on money the
   company still holds.
4. **Delivery is asserted, not inferred.** `disbursed_at` is unreliable (393 of 964). Use the
   explicit agent delivery confirmation that already exists for landlord float.

Note this preserves your destination decision from the morning review: the capital still lands
in **the relevant agent's landlord-float bucket**, earmarked to the named tenant. "Pool" here
means *the partner's capital is represented as a portfolio*, not *the money is blended into an
undifferentiated book*. Those are separable, and you want the first without the second — the
booking is what keeps the support attached to a named tenant, and it is what keeps this from
becoming a share-of-the-book product with a heavier regulatory posture.

---

## A6. Revised case scenarios (replacing S1–S3 where they differ)

**S1′ — Agent edits rent upward after booking (400k → 500k).** Partner principal unchanged at
whatever they booked. The shortfall is a company/agent funding question, not a partner question.
No void, no refund, no partner-facing event beyond an informational note.

**S2′ — Agent edits rent downward after booking (500k → 400k).** Booking delivers 400k; 100k
reverts to the partner's available capital. Accrual follows placed capital only. No void.

**S3′ — Request deleted or rejected after booking, before placement.** Booking → `released`,
capital returns to available, partner notified with the plan name and a prompt to re-book. No
ledger movement at all, because nothing was placed. This is dramatically cheaper than the
morning design's refund path.

**S4′ — Request deleted after placement.** Now there *is* money in an agent's float. Ops must
recover the earmarked float (existing float-correction rails, audited, reason-coded) and return
the capital to available. This is the only scenario in the whole feature that requires a
reversal — and it is the one the placement/delivery split exists to make rare.

**S5′ — CFO funds a reserved plan.** Prevented by rule A5.2. Unchanged in importance: still the
top-priority fix.

**S6′ — Two partners want the same plan.** Unique partial index rejects the second booking.
The UI must say "already booked by another supporter", and — because capital is now
partner-authored — should immediately offer the next comparable plan.

**S7′ — Partner books more than they hold.** Reject at booking time against *available*
(= portfolio capital − reserved − placed) capital. Your screenshot already shows the honest
version of this: UGX 32,850 available against a UGX 50,000 minimum. The card correctly refuses
to pretend.

**S8′ — Partner books nothing for weeks.** Idle capital does not accrue (A4). This needs to be
stated in partner-facing copy *before* they fund, or it becomes a support ticket.

---

## A7. Revised recommended sequence

| # | Change | Note vs the morning list |
|---|---|---|
| 1 | Stamp `self_funding_partner_id` and exclude reserved/placed plans from the CFO payout queue | Unchanged. Still first. |
| 2 | Fix the shelf predicate: require `landlord_ops_reviewed_at` **and** `tenant_ops_reviewed_at`, drop the bare `coo_reviewed_at` test, prune dead statuses | **Revised** — it is a review-stamp predicate, not a `landlord_ops_approved` status |
| 3 | ~~Frozen quote~~ | **Dropped.** Partner-authored amount makes it unnecessary |
| 4 | ~~Mutation lock on rent fields~~ | **Dropped.** A1–A6 remove the need |
| 5 | `management_type` nullable tag on portfolios (`'self'`; NULL = managed) | **New.** No backfill, no NOT NULL, no default |
| 6 | Booking table + state machine (reserved / placed / delivered / released) with a unique partial index for exclusivity | **New.** Replaces the claim-with-frozen-quote model |
| 7 | Accrual on placed capital only; unallocated capital visible and non-accruing | **New.** Highest-risk omission if skipped |
| 8 | Ops "release booking" path (re-book, not refund) + agent-eligibility gate on booking (not frozen/suspended) + delivery confirmation | Merged from old #5 and #6 |
| 9 | Move the hardcoded `15` rate into config | Unchanged |
| 10 | Surface the 121-row / UGX 57.97M `pending` backlog to Agent Ops as the supply constraint | Unchanged |

---

## A8. Honest reservations about *your* proposal

- **"Pool" is an overloaded word and it will cost you.** Represent the partner's capital as a
  portfolio; do **not** let that slide into blending the money. The moment partner capital funds
  the book generally rather than a named tenant, the product becomes a security-like interest in
  a loan book, with a materially heavier regulatory posture. The booking is the firewall. Say so
  in the internal spec, or someone will "simplify" it away.
- **Idle capital is the new failure mode.** The old design's risk was drifting quotes; this
  design's risk is partners funding and then never booking, expecting returns. Non-accruing idle
  capital is correct and unpopular. Decide the copy now, not after the first complaint.
- **Reserved-but-never-placed bookings will accumulate.** You need an expiry on `reserved` (the
  10-minute hold is right for checkout, too short for a booking). Suggest a short reservation
  window with auto-release and a partner nudge.
- **Two accrual engines is a real cost.** Managed portfolios accrue one way; self-managed accrue
  on placed capital. Keep both driven by the same daily job and the same rate config, or they
  will diverge within a quarter.
- **The shelf predicate fix is urgent and independent.** Partners are, right now, being shown 20
  plans that were not checked against the Landlord Ops and Tenant Ops review stamps. Whatever you
  decide about pooling, fix that predicate first.
- **Terminology and events, unchanged.** Rent Plan / Supporter / Returns — never Loan, Lender,
  ROI. Every booking transition emits a `system_event` and contributes to the trust score.

---

*Addendum A prepared as design review. Nothing in this document has been implemented.*
