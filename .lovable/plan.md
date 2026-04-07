

## Update WELILE_WORKFLOW.md to v5.0

The document is currently at v4.0 (dated 2026-04-03). Since then, significant features and architectural changes have been implemented. This plan covers updating the entire document with all latest additions.

### What Has Changed Since v4.0

**New Systems & Modules:**
1. **HR Dashboard** — Full HR module at `/hr/dashboard` with 6 sub-views (Overview, Employee Directory, Leave Management, Payroll, Disciplinary, Audit, Departments), employee profiles at `/hr/profiles/:userId`, and 3 new edge functions (`hr-approve-leave`, `hr-issue-disciplinary`, `hr-submit-payroll`)
2. **Agent-Facilitated Angel Pool Investment** — `agent-angel-pool-invest` edge function + `AgentAngelPoolInvestDialog` component with inline investor registration, 1% commission, branding purple (#7718D1)
3. **Proxy Partner Payout Management** — `ProxyPartnerFunds` component in wallet, ROI-only delivery for proxy agents, withdrawal flow with `proxy_partner_withdrawal` category
4. **Financial Agent Requisition Flow** — `AgentRequisitionForm` + `FinancialAgentSection` bottom-sheet on agent dashboard, `CFOAgentRequisitions` approval queue on CFO dashboard

**CFO Dashboard Expansion (now 20+ tabs):**
- `roi-requests` — CFOROIRequests (partner ROI payout authorization)
- `rent-collections` — RentCollectionsFeed (real-time collection tracking)
- `agent-rankings` — AgentPerformanceRankings (weighted KPI rankings)
- `retractions` — WalletRetractionsFeed
- `advances` — CFOAdvancesManager (compounding interest advances)
- `approval-audit` — ManagerApprovalAudit
- `agent-requisitions` — CFOAgentRequisitions
- `float-management` — AgentFloatManagement (3-tab: Transfers, Balances, Reconciliation)
- `listing-bonus` — ListingBonusApprovalQueue

**Architecture Changes:**
- **Trigger-Only Wallet Policy** — `sync_wallet_from_ledger` is the SOLE writer for wallet balances; all edge functions forbidden from manual wallet updates
- **Double-Deduction Bug Fix** — `agent-deposit` patched to remove manual wallet subtraction (same class as approve-deposit fix)
- **Proportional Revenue Recognition** — `sync_collection_to_ledger` trigger splits daily collections into `rent_principal_collected`, `access_fee_collected`, `registration_fee_collected`
- **Deterministic Idempotency** — `credit_proxy_approval` RPC with MD5-based UUID for proxy partner approvals
- **Financial Separation of Powers** — CFO (inbound credits) vs Financial Ops (outbound debits) strict separation

**New Database Tables:**
- `leave_requests` — HR leave management
- `disciplinary_records` — HR disciplinary tracking
- `payroll_batches` — HR payroll processing
- `financial_agents` — Tagged agents for expense categories
- `proxy_agent_assignments` — Proxy agent management

**New Edge Functions (not in v4.0):**
- `agent-angel-pool-invest`
- `hr-approve-leave`
- `hr-issue-disciplinary`
- `hr-submit-payroll`

**Updated Roles:** HR role added (15 total roles now)

### Plan

The update will touch the following sections of the 3,236-line document:

1. **Header** — Bump version to 5.0, update date to 2026-04-07
2. **Table of Contents** — Add Section 38: HR Dashboard Workflows
3. **Section 2 (Roles)** — Add `hr` role to the table (15 total)
4. **Section 4 (Agent Workflows)** — Add subsections for Agent-Facilitated Angel Pool Investment and Proxy Partner Payout delivery
5. **Section 9 (CFO Dashboard)** — Expand tabs table to include all 20+ tabs with new components (ROI Requests, Advances, Float Management, Agent Requisitions, Rent Collections, Agent Rankings, Wallet Retractions, Approval Audit)
6. **Section 20 (Wallet System)** — Document Trigger-Only policy, add `proxy_partner_withdrawal` category, document ProxyPartnerFunds tab in wallet
7. **Section 21 (Ledger)** — Add proportional revenue recognition via `sync_collection_to_ledger`, add `credit_proxy_approval` RPC, document `balance_correction` category
8. **NEW Section 38: HR Dashboard Workflows** — Full documentation of HR module (route, components, leave/payroll/disciplinary flows, edge functions)
9. **Section 34 (Edge Functions)** — Add 4 new edge functions to registry (total: 85+)
10. **Section 36 (Database Schema)** — Add new tables (leave_requests, disciplinary_records, payroll_batches, financial_agents)
11. **Section 37 (Known Issues)** — Add Double-Deduction Bug documentation (agent-deposit), document Trigger-Only resolution
12. **Appendix C (Forbidden Anti-Patterns)** — Add "Manual wallet balance updates in edge functions"
13. **Appendix G (Changelog)** — Add v5.0 entries for all new features

This is a large file update (~200+ lines of new content plus edits to existing sections). The document will remain the comprehensive, exhaustive reference it is — not a summary.

