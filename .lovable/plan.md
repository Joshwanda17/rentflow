

## Proxy-Agent Deposits Are Being Stolen by the "Operational Float Sweep"

### What we found (proof from the live ledger)

LUKODDA JOSEPH (`b4d7c324…`) is a **proxy agent** — he holds a wallet whose purpose is to fund partner portfolios on behalf of partners like MONICA KASIRYE and MOSES CHEROP. Today he deposited **UGX 1,000,000** (`RCT1264`). The ledger shows what happened next, in the same second:

```text
06:43:16.450  cash_in   wallet_deposit         1,000,000   RCT1264   "Wallet deposit via agent_cash"
06:43:16.615  cash_out  agent_float_deposit    1,000,000   RCT1264   "Sweep to operational float (agent_cash)"
```

His deposit was credited to his wallet ledger, then **immediately swept right back out** into his `agent_landlord_float` (the CFO landlord-payout escrow). Net effect on his wallet ledger from that 1M: **zero**. That is exactly why `coo-create-portfolio` says *"Available: 392,000, Required: 1,000,000"* even though `wallets.balance` reads 1,392,000 (the wallet column was never debited by the sweep — separate, older drift bug, not this fix).

### Why the sweep fired

In `supabase/functions/approve-deposit/index.ts` (lines 178–229) every deposit by **any user with the `agent` role** is auto-swept to landlord-float when the deposit purpose is empty or `"other"`:

```ts
const isAgent = !!agentRoleRow;                       // ← LUKODDA has agent role
const explicitFloat   = purpose === 'operational_float';
const ambiguousPurpose = !purpose || purpose === 'other';
const shouldSweep = isAgent && (explicitFloat || ambiguousPurpose);   // ← TRUE for him
```

A **proxy agent** is structurally different from a tenant-collection agent:
- Tenant-collection agents collect rent cash → deposit to wallet → sweep to landlord-float → Pay Rent. *Sweep is correct.*
- **Proxy agents** receive funder money → deposit to wallet → use wallet to fund partner portfolios via `coo-create-portfolio` (which reads the **wallet** ledger scope). *Sweep is wrong — it drains the very pot the portfolio flow needs.*

The current code can't tell them apart, so every proxy-agent deposit gets silently rerouted away from portfolio funding.

### The Fix — exempt proxy agents from the sweep

We detect "is this person a proxy agent for at least one partner?" by checking `proxy_agent_assignments` for an active, approved row where they are the `agent_id`. If yes, **skip the sweep entirely** — let the deposit stay in their wallet ledger so `coo-create-portfolio` can actually spend it.

**One file, one block changed:** `supabase/functions/approve-deposit/index.ts`

```ts
// NEW — detect proxy-agent role (funds partner portfolios, NOT landlord payouts)
const { data: proxyRow } = await supabaseAdmin
  .from('proxy_agent_assignments')
  .select('id')
  .eq('agent_id', depositRequest.user_id)
  .eq('is_active', true)
  .eq('approval_status', 'approved')
  .limit(1)
  .maybeSingle();
const isProxyAgent = !!proxyRow;

// Sweep ONLY when:
//  (a) explicitly tagged operational_float, OR
//  (b) ambiguous purpose AND the agent is NOT a proxy agent
const shouldSweep = isAgent
  && !isProxyAgent                                // ← key new guard
  && (explicitFloat || ambiguousPurpose);
```

We also add a log line `"[approve-deposit] Skipping float sweep — user is a proxy agent; deposit stays in wallet for partner portfolio funding"` so future audits can see the decision.

### Edge case: a user who is BOTH a tenant-collection agent and a proxy agent

We default to **proxy-agent semantics** (don't sweep) because:
1. The failure mode of *not* sweeping is benign — they can still hit Pay Rent for tenants; that flow already debits `wallets.float_balance` separately.
2. The failure mode of sweeping (current behaviour) **breaks portfolio creation** with an opaque "insufficient funds" message after the user already deposited correctly — much worse UX.

If a power user explicitly wants the deposit to fund landlord-float, they can still pick `deposit_purpose = 'operational_float'` in the deposit dialog — that explicit flag continues to sweep regardless.

### Out of scope for this fix (separate issues already noted)

- **`wallets.balance` drift** (UI shows 1,392,000 vs ledger 392,000): the sweep debits the ledger but not the `wallets` row. After this fix, new proxy-agent deposits won't suffer this anymore. The 1M historical drift on LUKODDA needs a one-off Financial Ops reconciliation entry — separate ticket.
- **Existing swept funds in `agent_landlord_float`**: not retroactively reversed by this change. If LUKODDA needs that 1M back in his portfolio-funding wallet, Financial Ops can reverse the `agent_float_deposit` pair manually.

### Acceptance

1. LUKODDA (proxy agent) deposits UGX 500,000 via agent_cash with no explicit purpose → ledger shows **only** the `wallet_deposit` cash_in pair; **no** `agent_float_deposit` sweep entries.
2. `coo-create-portfolio` for any of his partners now sees the full deposited amount as available and succeeds without the 500/blank-screen error.
3. A pure tenant-collection agent (no `proxy_agent_assignments` row) deposits UGX 100,000 with ambiguous purpose → still auto-swept to landlord-float as today (existing behaviour preserved).
4. Any user (including proxy agents) who explicitly picks `deposit_purpose = 'operational_float'` → still swept, regardless of role.

### Files touched

- `supabase/functions/approve-deposit/index.ts` — add proxy-agent detection + new guard in the sweep condition (~12 lines added, 1 line modified).

No DB migration. No schema change. No client change. No other edge function touched.

