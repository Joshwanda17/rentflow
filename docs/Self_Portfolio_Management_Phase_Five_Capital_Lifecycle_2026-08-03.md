# Self Portfolio Management — Phase Five
## What happens to the capital after it is deployed
**Date:** 2026-08-03
**Status:** Design clarification. No build implied by this document.
**Builds on:** Phase Two (§5A, §6), Phase Three (§2, §3, §5.4, §7), Phase Four (§1, §5.4)

---

## 0. The one question this document answers

> *"When a tenant's cycle ends, where does my money go — and why is that not fraud?"*

Answer in one line:

> **The principal never returns to the spendable wallet mid-term. It stays inside the partner's
> commitment, is re-deployed to the next approved plan in the funding queue, and only becomes
> withdrawable when the commitment term itself ends.**

Nothing is hidden, nothing is moved outside the partner's name, and every movement is visible to
the partner on the same screen where they committed. That is why it is recycling, not fraud.

---

## 1. The two clocks — the source of most confusion

| Clock | Starts | Ends | Governs |
|---|---|---|---|
| **Commitment term** | The day the partner commits | Term end date (e.g. 12 months later) | When principal may leave and become withdrawable |
| **Plan cycle** | The day the landlord float is disbursed (Phase Three §5.4) | That plan's end date (e.g. 30 days) | Which tenant the money is working on right now |

A commitment term contains **many** plan cycles. A plan cycle ending is a routine event inside the
term — it is not the term ending, so it does not release principal.

```text
|<--------------------- commitment term (12 months) --------------------->|
| plan 1 | plan 2 | plan 3 | idle | plan 4 | ...            | plan n |    |
                                                                     ^
                                                        term end: principal freed
```

---

## 2. The five states capital can be in

Every shilling a partner has committed is in exactly one state at any moment. This is the vocabulary
the UI must use, unchanged, everywhere.

| State | Meaning | Earning? | Withdrawable? |
|---|---|---|---|
| **Committed — awaiting deployment** | Committed, not yet matched to an approved plan | No (see §4 idle allowance) | No |
| **Deployed — at work** | Funding a live plan; landlord already paid | Yes | No |
| **Returning** | Plan complete, awaiting match to the next plan | Per §4 | No |
| **Released** | Term ended, principal moved back to spendable | No | Yes |
| **Impaired (company-carried)** | Tenant defaulted; company absorbs, partner untouched | Yes, in full | No (until term end, then released in full) |

The only transition that puts money back in the spendable wallet is **→ Released**, and it only
fires at term end or on an approved early-exit (§6).

---

## 3. The moment a plan completes — step by step

1. **Plan reaches its end date** (or the tenant finishes early — Phase Three §2, row 4).
2. **The month already running is paid in full.** No proration, no clawback, regardless of how the
   tenant behaved.
3. **The completed funding line is closed** and stamped with its dates, principal, and total returns
   paid. It stays permanently in the partner's history — a closed line is never deleted.
4. **Principal moves to `Returning`**, still inside the commitment, still in the partner's name.
5. **First refusal**: if *that* tenant has posted a new plan, the partner gets 24 hours to take it
   (Phase Two §6).
6. **Automatic redeployment** (the default): the principal is matched to the **front of the approved
   funding queue** — whoever is next, not necessarily the same tenant (Phase Three §3).
7. **A new funding line opens**, badged *Self-managed*, showing the new tenant, amount, dates and the
   fact that it was funded by recycled capital from the closed line. The partner is notified.
8. **Both clocks behave as designed**: the new plan cycle starts when that landlord is paid; the
   commitment term keeps running from its original start date and is **not extended**.

If the partner is on **manual** selection and does nothing, the principal sits in `Returning` and the
capped paid-idle allowance applies (§4).

---

## 4. Idle capital between plans

Recycling is rarely instant — there can be a gap between one plan closing and the next being matched.

- The gap is **paid**, at the partner's agreed rate, up to the **cap set in Phase Two §5A**.
- Beyond the cap, idle days are **unpaid**, and the partner is told plainly, in advance, on the
  portfolio screen and by notification.
- The reason for the cap is honesty about where the money comes from: idle capital earns the company
  nothing, so an uncapped idle payment is the company paying returns out of nowhere.
- Idle days **never** shorten or extend the commitment term.

---

## 5. Why this is not fraud — the five guarantees

Each of these is a build commitment, not a description of intent:

1. **The money never leaves the partner's name.** Recycled principal stays booked as the partner's
   committed capital. It is never re-tagged to a company operating account.
2. **Every movement is ledger-posted and person-bound.** A closed line and its successor line are
   both visible, dated and reconcilable by the partner and by finance.
3. **The partner is notified on every redeployment**, with the new tenant, amount and dates.
4. **Returns are unaffected by recycling.** The rate is on committed principal, so a recycled
   shilling earns exactly what it earned before — recycling moves principal, it does not compound
   (Phase Four §5.4).
5. **The partner can stop the behaviour.** Switching to manual selection, or declining to re-deploy,
   is always available. Automatic is a default, never a lock.

The fraud concern arises only if principal were to appear in the spendable wallet mid-term and be
withdrawn while still shown as at work — i.e. the same shilling counted twice. Keeping principal out
of the spendable bucket until `Released` is precisely what prevents that.

---

## 6. Term end — the exit

At the commitment term end date the partner chooses, and is prompted 30 days in advance:

| Choice | What happens |
|---|---|
| **Withdraw** | Recycling stops. As each live plan completes, its principal moves to `Released` and lands in the spendable wallet as person-bound money, withdrawable under normal limits. |
| **Renew** | A fresh term starts; principal continues recycling with no interruption and no return to the wallet. |
| **Partial** | Part released, part renewed. The released part follows the Withdraw path, the rest continues. |

Two hard rules:

- **Principal is released only as live plans complete.** A partner cannot pull principal out of the
  middle of a live plan — the landlord has already been paid.
- **No new deployment is started after a Withdraw election**, so the wind-down is bounded by the
  longest live plan, and the partner is shown that exact date.

Early exit before term end follows the existing **90-day notice** rule already governing partner
withdrawals; returns stop accruing for the noticed amount over that period.

---

## 7. What the partner must see on screen

A partner should never have to ask where their money is. The portfolio view shows:

- The five state totals from §2, as a single stacked figure that sums exactly to the commitment.
- The commitment term start and end date, and days remaining.
- Every funding line — open and closed — with tenant, principal, dates, returns paid, and whether it
  was newly funded or recycled.
- The next return date and amount, badged *Self-managed*.
- Idle days used against the Phase Two §5A cap, when any exist.

---

## 8. Deliberately still out of scope

- The line-by-line monthly and annual partner statement.
- Finance-side reporting views for committed, idle, at-risk and impaired capital.
- Recovery mechanics after a default beyond "the company carries it".
- Whether managed partners may move capital into self-managed at term end.
