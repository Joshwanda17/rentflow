# Merchant Agent Float Deficit Gate — Analysis (no code changed)

_Analysis only. Date: 2026-08-14. Nothing in the codebase or database was modified._

---

## 1. What is being asked

Replace today's "shared payout pool, unlimited fronting" merchant model with a
**float-first, deficit-gated** model:

1. A merchant agent requests float (requisition) and Finance funds it.
2. Payouts consume the merchant's **own float bucket first**.
3. When their float hits 0, show: *"Operational float is finished, you can continue processing pay-outs"* — they keep paying, but each payout beyond 0 becomes a **receivable against the company** (the merchant is now demanding money).
4. **24-hour window:** once the day rolls over, a merchant carrying a deficit (float ≤ 0 / negative) is **blocked from processing any payout** until Financial Ops settles that deficit (or gives them any positive float again).
5. Case: Pius funded UGX 20,000,000 → spends it all → float 0 → keeps paying out and accrues a demand → at the next 24h boundary, if unsettled, he cannot claim/settle new payouts.

---

## 2. How it works today (baseline)

### 2.1 Money mechanics per settled payout (`approve-withdrawal`)
For payout amount **A** with telecom charge **T** (tiers 100/500/1,000/1,500/2,000 UGX from `src/lib/cashoutCharges.ts`):

| Leg | Scope | Direction | Bucket | Category |
|---|---|---|---|---|
| Customer balance discharged | wallet | cash_out | withdrawable | `wallet_withdrawal` |
| Company float consumed (principal) | wallet | cash_out | **float** | `agent_float_settlement` |
| Float settled to platform | platform | cash_in | — | `agent_float_settlement` |
| Telecom charge | wallet | cash_out | **float** | `agent_float_settlement` (ref `<id>-merchant-telecom-charge`) |
| Commission expense | platform | cash_out | — | `agent_commission_earned` |
| Commission to merchant (0.5% × A) | wallet | cash_in | withdrawable | `agent_commission_earned` |

Invariant already in force: **Float allocated = customer payouts + telecom charges + remaining float.**

### 2.2 Float reservation and the shortfall path
- `reserve_merchant_float` locks the claimable slice: `reserved = min(float_balance − open reservations, A + T)`.
- If float covers less than `A + T`, the engine **does not block**. It debits float for what exists and files the remainder into `merchant_out_of_pocket_advances` with status **`needs_review`**. It only becomes money owed after `review_merchant_out_of_pocket` (merchant/FinOps confirmation) — the evidence gate.
- `INSUFFICIENT_MERCHANT_FLOAT` as a hard stop is effectively bypassed by the shared-pool model; the pool figure (`get_merchant_payout_float().available_float`) is a **network** number (all withdrawable + landlord float − claimed-unsettled), not the merchant's spendable money.

### 2.3 Requisition side
- There is **no merchant-side request button**. `float_requests` rows are raised for them by FinOps (`MerchantFloatRequisitionPanel`), reported in the CFO `MerchantFloatRequisitionReportPanel`.
- The per-agent "fair-share forecast" was deliberately deleted (see `mem://features/agent/merchant-float-demand-forecast`) — the CFO is the gatekeeper, and self-service allocation was explicitly rejected.

### 2.4 The Finance truth board
`get_merchant_float_positions()` computes, per desk, since the anchor date:
- `paid_out_total` (completed payouts attributed to the desk)
- `float_credits_recorded` (real `agent_float_deposit` cash-in float legs) — the authoritative reimbursement figure
- `email_matched_total` — **evidence only**, never summed into reimbursement (adding it once produced a false "we owe agents UGX 384m")
- `adjustments_total` from `merchant_float_reconciliations`
- `owed_to_agent` / `company_cash_with_agent` = the two non-negative sides of `paid_out_total − reimbursed_total`.

---

## 3. What the new model changes

| Dimension | Today | Proposed |
|---|---|---|
| Float source order | reservation-based, shortfall silently fronted | explicit **float-first**, then declared deficit mode |
| Zero float | keeps paying indefinitely, unbounded fronting | keeps paying **within the current 24h window only** |
| Day boundary | no meaning | **hard gate**: deficit unsettled → no new claims |
| Unblock | none needed | FinOps settlement (real float credit) or reconciliation adjustment |
| Merchant requisition | FinOps-only | merchant-initiated request (optional per the brief) |
| Receivable creation | `needs_review`, confirmation required | still evidence-gated, but now it also **drives eligibility** |

The important conceptual shift: the out-of-pocket receivable stops being a
passive accounting artefact and becomes an **operational control variable**.

---

## 4. Financial-flow impact

### 4.1 Ledger
No new ledger categories or legs are required. Float debits, telecom debits and
commission credits stay identical. `apply_wallet_movement` remains the sole
wallet writer; nothing here justifies a new mutation path. The gate is a
**pre-condition check**, not a money movement.

### 4.2 Balance-sheet effect of deficit mode
Every payout made at float ≤ 0 creates a liability *Due to merchant agents*
(credit) against *Cash disbursed on behalf of customers* (debit). Because the
customer's wallet is discharged at the same moment, the company's payable simply
moves from **customer withdrawable** to **merchant receivable**. Net obligation
is unchanged; only the counterparty changes. This is why the deficit must be
visible and time-boxed — an invisible, unbounded version of it silently converts
customer float into agent-held debt with no cash movement to prove it.

### 4.3 Numbers that must drive the gate
Recommended eligibility formula, evaluated at claim time:

```
spendable_float = min(wallets.float_balance,             -- cache
                      ledger_float_held)                  -- proven legs
                 - open_reservations
deficit         = max(0, confirmed_out_of_pocket_owed - float_credits_since)
window_open     = (deficit = 0)
                  OR (last_deficit_started_at >= start_of_current_window)
can_claim       = spendable_float > 0 OR window_open
```

Notes that matter for correctness:
- **Use the strict/min rule.** `ledger_float_held` must cap the cached
  `float_balance`, exactly as the Money-With-Agents card already does. Otherwise
  cache drift lets a merchant "prove" float they never received and the gate
  never fires.
- **Off-ledger adjustments are not spendable float.** `merchant_float_reconciliations`
  can settle a deficit for reporting purposes but must not be mistaken for cash
  the payout engine can consume.
- **Email-matched MoMo credits stay evidence-only.** Using them to clear a
  deficit re-introduces the double-count that produced the phantom UGX 384m.
- **Telecom charge belongs in the requirement**, not just the principal: the
  float requirement per payout is `A + T`, so a merchant can be pushed into
  deficit purely by charges.

### 4.4 Definition of the "24 hours"
Three candidate definitions, materially different in behaviour:

1. **Calendar day (EAT)** — deficit incurred today blocks from 00:00 tomorrow. Simple, predictable, matches the daily merchant cash-out report and daily commission cron. **Recommended.**
2. **Rolling 24h from first deficit payout** — fairer to a merchant who goes into deficit at 23:50, but hard to explain and needs per-desk timers.
3. **Rolling 24h from last deficit payout** — worst option: a merchant paying continuously never trips the gate.

Whatever is chosen, it must be a single server-side definition used by the claim
gate, the merchant UI countdown and the FinOps board — three drifting
definitions is the classic failure mode here.

### 4.5 Commission and incentives
Commission (0.5%) lands in withdrawable and is unaffected. But note the
incentive: in deficit mode the merchant still earns commission while lending the
company money. If the gate is enforced strictly, that is acceptable; if the gate
is soft, it rewards indefinite fronting. Optionally commission on deficit-mode
payouts could be held until settlement — a policy decision, not a technical one.

---

## 5. Risks and edge cases

| Risk | Why it bites | Mitigation |
|---|---|---|
| Gate blocks a merchant mid-queue | Claimed-but-unsettled payouts would be stranded | Gate at **claim**, never at settle; already-claimed work must always be completable |
| Customer stranded with no eligible merchant | If many desks are blocked at once, cash-outs stall network-wide | Blocked desks must be excluded from dispatch/routing so requests re-dispatch instead of failing |
| Cache drift unblocks wrongly | Inflated `float_balance` reads as spendable | strict `min(cache, ledger)` rule |
| Deficit created by telecom charges only | Merchant feels punished for fees | Reserve `A + T`; surface charges separately in the merchant statement |
| Duplicate/again-claim races | Two claims against the same last shilling of float | Existing reservation lock plus a single atomic eligibility check inside the claim path |
| Reconciliation used as a shortcut | Deficits cleared on paper without cash | Require ≥10-char reason (already enforced) and keep adjustments out of spendable float |
| Legacy desks with pre-anchor deficits | Old balances would instantly block everyone | Evaluate the gate only from an explicit anchor/effective date |

---

## 6. Surfaces that would need to agree

- **Merchant claim path** (`approve-withdrawal` claim stage) — the only place the gate can be enforced safely.
- **Dispatch/routing** (`notify-merchants-new-withdrawal`, `redispatch-withdrawals`, payout routing helper) — must skip blocked desks.
- **Merchant dashboard** (`AgentCashPayoutsTab`, `MerchantFloatAvailableCard`, `MerchantDashboardHome`) — float-first messaging, deficit banner, countdown to the window close, and (if adopted) the request-float button.
- **Merchant payout queue helper** (`src/lib/merchantPayoutQueue.ts`) — the fence that decides what is claimable.
- **FinOps** — `MoneyWithAgentsCard` + `MerchantFloatRequisitionPanel`: show who is blocked and settle them; settlement must be a real float credit, not a UI flag.
- **CFO** — float requisition and merchant float statement reports gain a "blocked desks / deficit outstanding" line.
- **Daily merchant cash-out report** — should include deficit opened, deficit settled, desks blocked.

---

## 7. Answering the open question in the brief

> "a merchant Agent will have a button to request float, but I think this is not
> needed since he can still operate despite having no float."

With the 24h gate in place the button **becomes necessary**, because float is
now the only thing that reopens the window. Without a merchant-initiated
requisition, every unblock depends on reaching FinOps by phone. The safe shape is
the one already proven by `MerchantFloatRequestCard`: free-text amount + reason,
one open request at a time (`hasPending` disables both the button and the
mutation), landing in the existing FinOps/CFO queue. No self-allocation, no
fair-share forecast — that model was explicitly rejected and must not return.

> "we can make it that once it expires he must be having at least any amount of
> float to proceed even if they are in debit"

That is exactly the `spendable_float > 0 OR window_open` rule above: any genuine,
ledger-proven float credit reopens the desk even while a receivable remains
outstanding. It is the least disruptive form of the gate and the one I would
recommend, because it lets Finance unblock with a small top-up instead of having
to fully settle a large deficit.

---

## 8. Verdict

The proposal is sound and mostly a **control layer on top of existing money
mechanics** — no new ledger paths, no new wallet writer, no change to commission
or telecom accounting. The risk is concentrated in three places: the definition
of the 24-hour window, the strictness of the float figure the gate reads, and
what happens to the customer queue when desks go dark. Get those three right and
the change converts today's invisible, unbounded agent fronting into a bounded,
settled, auditable receivable.
