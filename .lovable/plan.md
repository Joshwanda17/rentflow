

## Managed Accounts & Smart Payout Routing

### What This Solves
Partners who can't manage their own accounts get funds routed to their assigned agent's wallet instead of their own, preventing double-credit and unauthorized withdrawals.

### Database Changes

**1. Add `is_managed_account` to `proxy_agent_assignments`**
```sql
ALTER TABLE proxy_agent_assignments
  ADD COLUMN is_managed_account boolean NOT NULL DEFAULT false;
```

**2. Add `target_wallet_user_id` to `pending_wallet_operations`**
```sql
ALTER TABLE pending_wallet_operations
  ADD COLUMN target_wallet_user_id uuid REFERENCES profiles(id);
```
When set, the `approve-wallet-operation` edge function credits this user's wallet instead of the original `user_id`.

### Frontend Changes

**1. `src/components/cfo/ProxyAgentManager.tsx`**
- Add a "Managed Account" toggle (Switch component) in the Link Agent dialog
- Pass `is_managed_account` in the insert mutation
- Show a 🔒 badge on managed accounts in the assignment list

**2. `src/components/coo/COOPartnersPage.tsx` — NearingPayoutsDialog**

Current flow: User enters reason → clicks "Pay" → toggles wallet/already_paid → Confirm.

New flow after clicking "Pay":
- Query `proxy_agent_assignments` for the partner (`beneficiary_id = investorId, is_active = true, is_managed_account = true`)
- **If managed**: Show info banner `ℹ️ Managed account by {AgentName}` + single "Send to Agent Wallet" button. Creates `pending_wallet_operation` with `target_wallet_user_id = agent_id`
- **If not managed**: Show current two options (💰 Cash / 📱 To Wallet) unchanged

The check is done inline when "Pay" is clicked — a quick async lookup before showing the payment mode selector. State: `managedInfo[portfolioId]` storing `{ isManaged, agentName, agentId }`.

**3. `handlePay` update in NearingPayoutsDialog**
- Accept new mode `'agent_wallet'` alongside existing `'wallet' | 'already_paid'`
- When mode is `'agent_wallet'`, set `target_wallet_user_id` in the `pending_wallet_operations` insert
- Add `is_managed_payout: true`, `target_agent_id`, `payment_method` to audit metadata

### Edge Function Change

**4. `supabase/functions/approve-wallet-operation/index.ts`**
- In the approval block (line ~129), check if `op.target_wallet_user_id` is set
- If set: insert ledger entry with `user_id: op.target_wallet_user_id` (agent gets the funds)
- Keep `linked_party` as the original partner ID for audit traceability
- Add metadata to notification: "Managed payout on behalf of {partner}"

### Audit & Visibility
- Every payout logs `is_managed_payout`, `target_agent_id`, `payment_method` in `audit_logs.metadata`
- `pending_wallet_operations.status` (pending/approved/rejected) already exists — COO and Partner Ops can track progress via existing Approval Queue
- System event logged via `log_system_event`

### What Already Exists (No Changes Needed)
- `proxy_agent_assignments` table and CRUD — already implemented
- `pending_wallet_operations.status` tracking (pending/approved/rejected) — already there
- Audit logging with 10-char reason — already enforced
- CFO notification on payout requests — already implemented
- Compound flow — unchanged
- `approve-wallet-operation` approval/rejection pipeline — only extended, not rewritten

### Files Changed
| File | Change |
|------|--------|
| Migration (new) | Add `is_managed_account` + `target_wallet_user_id` columns |
| `src/components/cfo/ProxyAgentManager.tsx` | Add managed account toggle + badge |
| `src/components/coo/COOPartnersPage.tsx` | Add managed check on Pay click, new `agent_wallet` mode |
| `supabase/functions/approve-wallet-operation/index.ts` | Route credit to `target_wallet_user_id` when set |

