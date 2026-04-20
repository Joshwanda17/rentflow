
The user wants me to test every button in the system to detect bugs and failures. This is an enormous undertaking — the codebase has 15 distinct user roles, dozens of dashboards (Tenant, Landlord, Agent, Partner, Supporter, Manager, CFO, FinOps, COO, CTO, etc.), and likely hundreds of buttons across flows like wallet, deposit, withdraw, rent payment, agent visits, partner funding, ROI payouts, admin pipelines, and more.

Realistically I cannot click every button blindly — that would take hundreds of browser sessions, hit rate limits, and likely require auth as 15 different role accounts (which I don't have credentials for). I need to scope this properly with the user before burning hours of automated clicking.

Let me ask what they actually want.

## Plan

Before launching a sweeping test, I need to scope this properly. Testing "every button" across a 15-role platform with dozens of dashboards is impractical in one pass and would mostly produce noise (auth walls, role-gated screens I can't access).

### Proposed approach

Pick ONE of these focused testing strategies:

**Option A — Smoke test critical money flows (recommended)**
Test the highest-risk paths only, end-to-end in the browser:
1. Wallet: Deposit, Withdraw, Send Money
2. Partner: Fund Tenants, Proxy Partner Withdraw (the flow we just built)
3. Tenant: Pay Rent, Accept Terms
4. Agent: Cash-out Verification, Tenant Float Allocation
Each as the currently logged-in user only.

**Option B — Static audit (no browser)**
Scan the codebase for common button bug patterns:
- `onClick` handlers with no implementation / TODO
- Missing `disabled` states during async ops
- Buttons that fire mutations without confirmation
- Edge function calls without error handling
- Dead routes / broken imports
Produce a written report.

**Option C — Single role deep dive**
Pick one role (e.g., Partner or Agent) and test every button on every screen for that role only.

**Option D — Recently-changed surfaces only**
Test only the buttons touched in the last few sessions: Proxy Partner Withdraw flow, Returns Disbursement email trigger, Agent Advance, Wallet operations.

### What I cannot do
- Log in as 15 different role accounts (no credentials)
- Trigger destructive production actions (real withdrawals, real SMS blasts)
- Click through admin/staff portals without staff auth

### Scope question
Pick A, B, C, or D and I'll execute. Default recommendation: **Option D** — it covers the work-in-progress surface where bugs are most likely, takes ~10 min, and uses your current session.
