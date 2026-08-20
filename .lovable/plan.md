# Step 24 — Merchant desk settlement report (read-only)

One Financial Ops screen that answers, per merchant agent, for a chosen date window: what we sent them, what they paid out, what came out of their own pocket, what we already paid back, and what we still owe. Every figure is read from the general ledger for that window. Nothing is written.

## The screen

New Financial Ops tool: **Merchant desk settlement report**, reached from the Financial Ops command centre alongside the existing merchant tools.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Merchant desk settlement report            [ 1 Aug 2026 → 20 Aug 2026  ▾ ]  │
│ Window shown on every figure below. This report only reads the books.        │
│ Presets: Today · Last 7 days · This month · Last month · Custom             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Float sent      Payouts settled   Own money used   Reimbursed   We owe now  │
│ UGX 12,400,000  UGX 11,905,000    UGX 640,000      UGX 210,000  UGX 430,000 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Agent            Float sent  Payouts  Own money  Reimbursed  We owe    ▸    │
│ ▸ Aidah N.       3,100,000  3,240,000  140,000        0      140,000  ▸    │
│ ▾ Catherine M.   2,000,000  2,480,000  480,000  210,000      270,000  ▾    │
│    ── payouts behind this row ────────────────────────────────────────────  │
│    12 Aug 14:02  WD-8f2a1c  UGX 180,000  float 0 · own 180,000  MTN 774…   │
│    14 Aug 09:41  WD-1b77e0  UGX 300,000  float 0 · own 300,000  Airtel 70… │
│    est. telecom charges (not claimable) UGX 4,200 — shown, never in "we owe"│
└──────────────────────────────────────────────────────────────────────────────┘
```

Behaviour:
- The date window sits in the header and stays visible while scrolling; it is repeated in the row detail header so an expanded row is never read out of context.
- Sort by "We owe now" descending by default; agents with all-zero activity in the window are hidden behind a "show quiet desks" toggle.
- Row expands in place to list the individual payouts, each with date, withdrawal reference, amount, float-vs-own split and the destination number/provider.
- CSV and landscape PDF export carry the same window in their header, matching the existing merchant statement exports.
- Empty and loading states, and a plain "no ledger activity in this window" line per desk.

## Where each figure comes from

All amounts come from `general_ledger` filtered by `transaction_date` inside the window, `ledger_scope = 'wallet'`, production classification, excluding `admin_correction` / `system_balance_correction`:

- **Float we sent the desk** — float-bucket `cash_in` credits (`agent_float_deposit`, `agent_float_funding`, `agent_float_assignment`, `agent_float_topup`).
- **Payouts they settled** — float-bucket `cash_out` settlement legs (`agent_float_settlement`) plus completed merchant withdrawals in the window.
- **Own money used** — only the part evidenced by the desk running into deficit inside the window: the confirmed-and-evidenced `merchant_out_of_pocket_advances` rows (status `pending_reimbursement`), cross-checked against the running float position so a desk that never went negative reports zero. Estimated telecom rows without a matched charge reference are listed separately and never counted (Step 22 rule).
- **Already reimbursed** — reimbursement legs credited back to the desk in the window plus `reimbursed` out-of-pocket rows dated in the window.
- **Balance we owe now** — own money used minus already reimbursed, floored at zero.

## Technical notes

- New read-only SQL function `get_merchant_desk_settlement_report(p_from, p_to)` returning one row per merchant agent with the five totals plus a `payouts` JSON array (date, reference, amount, float used, own money, provider/number, out-of-pocket status). It is `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, and gated to financial-ops/CFO/manager roles; it performs no writes.
- Ledger reads use a single windowed CTE per desk so the whole report is one round trip; indexed on `transaction_date`.
- New hook `useMerchantDeskSettlementReport(from, to)` in `src/hooks/useMerchantFloat.ts`, and component `src/components/financial-ops/MerchantDeskSettlementReport.tsx` registered as a lazy tool in `FinancialOpsCommandCenter.tsx`.
- Amounts formatted with `formatUGX`; colours from existing semantic tokens; table uses existing shadcn table/collapsible primitives.
- No migrations touch balances, wallets, or advance statuses.
