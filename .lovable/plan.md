
## Plan — Make sure float allocation never touches commission (Lolem's case)

### What I found

**The RPC is already correct.** `agent_allocate_tenant_payment` (latest version) does:
- Computes `float = wallet_total − commission_balance`
- Validates float ≥ amount, errors out if not
- Posts ONE `cash_out` leg tagged `agent_float_used_for_rent`
- Never touches commission categories

For Lolem's latest UGX 900 allocation (Apr 17, 08:22), the ledger shows exactly one `agent_float_used_for_rent` cash_out — commission untouched. Current split: `float=8,600 / commission=5,500`.

**The real culprits:**

1. **Legacy double-leg bug.** Older allocations (Apr 10–13) wrote TWO wallet-scope `agent_float_used_for_rent` legs (one `cash_out` + one `cash_in` to the same agent wallet). These cancel each other, so float never actually decreased back then — meaning Lolem's float looks higher than what was really spent, and to the user it *feels* like commission must have been paying.
2. **No "force float-only" guard in the RPC.** If commission ever exceeds total wallet (corrupted data), the math `float = total − commission` could underflow to 0 and the function would refuse, but the dialog would say "insufficient float" without explaining commission is sitting unused.
3. **Display ambiguity.** `AgentFloatBalanceCard` shows `Withdrawable: commission · Company Float: float`. After a float allocation, only the Float number changes — but if the user just glances at the wallet `balance` number (4000 for Joshua = 2000+2000), it looks like "the wallet went down" without making clear *which* compartment.

### What I'll change

**A. Lock the deduction source explicitly (defense in depth).**
Update `agent_allocate_tenant_payment` to add a hard assertion right before posting the ledger entry:
- Re-read `commission_balance` immediately before insert
- After computing `float = total − commission`, assert `float >= p_amount`
- Add a comment + descriptive error: `"Float allocation blocked — would require commission funds. Commission is non-spendable for tenant payments."`

**B. Audit & fix Lolem's historical double-leg entries.**
- Identify any `agent_float_used_for_rent` rows where the same `transaction_group_id` (or same timestamp + amount + agent) has both `cash_in` AND `cash_out` in `ledger_scope='wallet'` — those self-canceling pairs are the bug.
- For each pair, delete the spurious `cash_in` wallet leg (it should have been `ledger_scope='platform'`). This will correctly retro-deduct the float.
- Run the audit query first as a dry-run report so the user can review before the fix is applied.

**C. UI clarity in `AgentTenantCollectDialog` & `AgentFloatBalanceCard`.**
- In the success view, add a line: "Commission untouched: {commission_balance}" so the agent sees the commission compartment was preserved.
- In `AgentFloatBalanceCard`, add a small lock icon next to "Withdrawable" with tooltip "Commission cannot be used for tenant payments — float only."

### Files to change
- `supabase/migrations/<new>.sql` — harden `agent_allocate_tenant_payment` RPC + audit/repair Lolem's self-canceling float entries
- `src/components/agent/AgentTenantCollectDialog.tsx` — show "commission untouched" line in success view
- `src/components/agent/AgentFloatBalanceCard.tsx` — lock icon + tooltip on Withdrawable

### Out of scope (mentioned earlier, deferred)
- Crediting 10% commission on float allocation (you also selected this — I'll include it as part of step A so each allocation now also posts an `agent_commission_earned` leg of `round(amount * 0.10)`).
- Fixing the legacy `AgentLandlordPayoutFlow` (selected) — I'll point its source from the deprecated `agent_landlord_float` table to the same float compartment via the same RPC pattern.

### One quick confirm
Before I delete the spurious self-canceling wallet legs from Lolem's history (step B), do you want:
1. **Dry-run report only** — I show the affected rows, you eyeball them, then I apply.
2. **Auto-apply** — fix immediately and report what was cleaned.

Reply "1" or "2", or "go" for auto-apply.
