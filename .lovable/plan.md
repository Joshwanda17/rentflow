

## Plan: 2% Partner Commission on Proxy Agent Deposits

### What Changes

When a proxy agent successfully deposits/tops-up a partner's wallet, the agent automatically earns a **2% commission** on that amount. This commission is tagged `partner_commission` in the ledger, is an instant wallet credit (no CFO approval), and is recorded as a platform expense.

### Database Migration (single SQL migration)

**1. Add `partner_commission` to the ledger allowlists**
- Update the `validate_ledger_category()` trigger function to include `partner_commission` in the allowed categories array.
- Update the `validate_ledger_category(p_category text)` scalar function likewise.

**2. Update `get_agent_split_balances` RPC**
- Add `partner_commission` to the commission `cash_in` categories so the 2% is counted as agent commission (withdrawable money, not float).

**3. Update `agent_deposit_to_partner` RPC**
After the existing wallet transfer legs, add three new operations:

- **Commission calculation**: `v_commission := p_amount * 0.02`
- **Leg 3 — Agent commission credit** (wallet scope): `cash_in`, category `partner_commission`, credits agent wallet
- **Leg 4 — Platform expense** (platform scope): `cash_out`, category `partner_commission`, records platform expense (reduces "Money We Have", increases "Money We Owe")
- **Wallet update**: `UPDATE wallets SET balance = balance + v_commission WHERE user_id = p_agent_id`
- **Audit log**: Insert into `system_events` with event_type `partner_commission_earned` including amount, partner_id, tracking_id
- **Return value**: Add `commission_earned` field to the returned JSON

### Frontend Changes

**`ProxyPartnerDepositDialog.tsx`** — Update the success screen to show the commission earned:
- Display a new row: "Commission Earned (2%)" with the commission amount in the result summary
- Update the transfer preview to show the 2% commission the agent will earn

**`ledgerConstants.ts`** — Add `partner_commission` to the `LOCKED_CATEGORIES` array and to `AGENT_COMMISSION_CATEGORIES`.

### Financial Statement Impact
- `partner_commission` entries with `ledger_scope = 'platform'` and `direction = 'cash_out'` will flow into platform expense reporting — reducing "Money We Have" and increasing "Money We Owe"
- The wallet-scope `cash_in` leg credits the agent's commission balance (always withdrawable per existing segmentation rules)

### What This Does NOT Do
- No CFO approval — instant on successful deposit
- No new tables — uses existing `general_ledger`, `wallets`, `system_events`

