# Welile Platform — Exhaustive UI & Backend Workflow

**Version:** 1.0  
**Date:** 2026-03-24  
**Status:** Living Document

---

# Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Role System & Navigation](#2-role-system--navigation)
3. [Tenant Workflows](#3-tenant-workflows)
4. [Agent Workflows](#4-agent-workflows)
5. [Supporter (Funder) Workflows](#5-supporter-funder-workflows)
6. [Landlord Workflows](#6-landlord-workflows)
7. [Manager / Staff Workflows](#7-manager--staff-workflows)
8. [COO Dashboard Workflows](#8-coo-dashboard-workflows)
9. [CFO Dashboard Workflows](#9-cfo-dashboard-workflows)
10. [CEO Dashboard Workflows](#10-ceo-dashboard-workflows)
11. [CTO Dashboard Workflows](#11-cto-dashboard-workflows)
12. [CMO Dashboard Workflows](#12-cmo-dashboard-workflows)
13. [CRM Dashboard Workflows](#13-crm-dashboard-workflows)
14. [Financial Operations Command Center](#14-financial-operations-command-center)
15. [Rent Request Pipeline (End-to-End)](#15-rent-request-pipeline-end-to-end)
16. [Wallet System](#16-wallet-system)
17. [Ledger & Accounting Engine](#17-ledger--accounting-engine)
18. [Property & Housing](#18-property--housing)
19. [Notifications & Realtime](#19-notifications--realtime)
20. [Edge Functions (Backend Logic)](#20-edge-functions-backend-logic)
21. [Security & RLS](#21-security--rls)
22. [Database Schema Overview](#22-database-schema-overview)

---

# 1. Authentication & Onboarding

## 1.1 Supported Auth Channels

| Channel | Flow |
|---------|------|
| **Phone + Password** | User enters phone → resolved to email → signs in with password |
| **Email + Password** | Standard email/password sign-in |
| **SMS OTP** | Phone → Edge Function `sms-otp` sends code → verify → session |
| **WhatsApp Deeplink** | Edge Function `whatsapp-login-link` generates magic link → user clicks → auto-login |
| **Google OAuth** | Redirects to Google → callback → session created |

## 1.2 Onboarding Flow

```
Landing Page (/welcome)
    ↓
Auth Page (/auth) — Sign Up or Sign In
    ↓ (first time)
Select Role (/select-role)
    ↓
Role assigned → Dashboard (/dashboard)
```

## 1.3 Backend Logic

- **`auth-email-hook`**: Custom email templates for verification
- **`otp-login`**: Validates OTP codes
- **`whatsapp-login-link`**: Generates authenticated WhatsApp deep links
- **`admin-reset-password`**: Staff-initiated password resets
- **`password-reset-sms`**: SMS-based password recovery
- **Identity Resolution**: Phone numbers are normalized (+256 prefix handling), matched against profiles table
- **Session Persistence**: "Remember Me" stores session; adaptive "Welcome Back" banner shows last login method
- **Referral Tracking**: `?ref=` and `?role=` URL params passed through auth flow to track acquisition

## 1.4 UI Components

- `src/components/auth/` — Login forms, OTP input, Google OAuth button, WhatsApp login
- `src/pages/Auth.tsx` — Main auth page
- `src/pages/SelectRole.tsx` — Post-signup role selection
- `src/pages/Join.tsx` — Referral-driven signup

---

# 2. Role System & Navigation

## 2.1 Supported Roles (14 total)

| Group | Roles |
|-------|-------|
| **Consumer** | `tenant`, `landlord` |
| **Financial** | `supporter` |
| **Field** | `agent` |
| **Staff** | `manager`, `employee`, `operations` |
| **Executive** | `ceo`, `coo`, `cfo`, `cto`, `cmo`, `crm` |
| **God Mode** | `super_admin` |

## 2.2 Role Storage

- Stored in `user_roles` table (separate from profiles, prevents privilege escalation)
- Role checks use `has_role()` SECURITY DEFINER function (bypasses RLS recursion)
- Internal/executive roles require authorization codes

## 2.3 Navigation Logic

```
User logs in
    ↓
useAuth() → fetches roles from user_roles
    ↓
Dashboard auto-routing:
  - Supporter with ≥ UGX 100K deployed → /dashboard (supporter view)
  - Agent → /dashboard (agent view)
  - Tenant → /dashboard (tenant view)
  - Staff/Executive → /admin/dashboard (with hidden Staff nav icon)
  - User can set "Home Screen" preference to override
```

## 2.4 Role Switching

- `BottomRoleSwitcher` / `RoleSwitcher` components
- Users can switch between assigned roles without re-auth
- `RoleGuard` component protects executive routes

## 2.5 Role Access Requests

- Standard users get: supporter, agent, tenant, landlord by default
- Additional roles require manager-approved "Role Access Request" (`ApplyForRoleDialog`)
- Qualified investors can toggle "Open All Dashboards" in Settings

---

# 3. Tenant Workflows

## 3.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Tenant home — balance, rent status, daily charges |
| `/find-a-house` | Browse daily-rent listings with map |
| `/house/:id` | Property detail page |
| `/payment-schedule` | View rent payment calendar |
| `/pay-landlord` | Direct landlord payment flow |
| `/rent-money` | Rent Money services hub |
| `/my-loans` | View credit/loan status |
| `/rent-discount-history` | Discount history |
| `/benefits` | Loyalty benefits |

## 3.2 Rent Request Flow (Tenant Perspective)

```
Tenant → Submits Rent Request (amount, landlord details, property)
    ↓
Request enters 6-stage pipeline (see Section 15)
    ↓
If approved & funded:
  - Daily auto-deductions begin from tenant wallet
  - Tenant sees RentProcessTracker: Verification → Approval → Funding → Delivery → Repayment
    ↓
Daily charge via `auto-charge-wallets` Edge Function
    ↓
Repayment tracked in rent_requests.amount_repaid
```

## 3.3 Daily Rent Marketplace

```
Agent posts listing → Appears on /find-a-house immediately
    ↓
Listing shows "Pending Verification" or "Verified" badge
    ↓
Daily rate = (monthly_rent + 33% access_fee + platform_fee) / 30, rounded up
    ↓
Tenant can express interest → Agent contacted
    ↓
PostGIS spatial indexing for proximity-based discovery
```

## 3.4 Backend Logic

- **`register-tenant`**: Creates tenant profile, links to agent
- **`auto-charge-wallets`**: Daily cron deducts rent installments
- **`process-credit-daily-charges`**: Credit line daily charges
- **`process-credit-draw`**: Credit drawdown processing
- **`check-repayment-status`**: Validates repayment progress
- **`rent-reminders`**: Automated SMS/push reminders
- **`payment-reminder`**: Payment due notifications

---

# 4. Agent Workflows

## 4.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Agent home — float, earnings, tasks |
| `/earnings` | Earnings breakdown with filters |
| `/analytics` | Performance analytics |
| `/agent-registrations` | Tenant/property registrations |
| `/sub-agents` | Sub-agent network analytics |
| `/agent-advances` | Cash advance management |
| `/agent-advances/:id` | Advance detail |
| `/agent/cash-payouts` | Cash payout requests |

## 4.2 Registration Workflow

```
Agent registers on platform
    ↓
Agent receives float allocation (agent_float_limits)
    ↓
Agent goes to field:
  1. Register tenants (collect details, property info)
  2. Register landlords (phone, location, LC1 details)
  3. Post property listings (GPS, photos, rent amount)
    ↓
Auto-verification trigger: First posted rent request → agent verified
```

## 4.3 Collection Workflow

```
Agent visits tenant
    ↓
Check-in with GPS (agent_visits table)
    ↓
Collect rent payment:
  - Cash: Record amount, issue receipt
  - Mobile Money: Record TID, provider, payer details
    ↓
agent_collections record created
    ↓
Float updated (float_before → float_after)
    ↓
5% commission earned (agent_earnings)
    ↓
Streak tracking (agent_collection_streaks)
  - Consecutive days → streak multiplier (up to 1.20x)
```

## 4.4 Landlord Payout Workflow

```
Rent request reaches "funded" status (CFO approved)
    ↓
Funds appear in agent's Landlord Float wallet
    ↓
Agent pays landlord externally (MoMo, cash, bank)
    ↓
Agent submits proof:
  - Transaction ID
  - Receipt photos
  - Mandatory GPS (within 500m of property)
    ↓
agent_float_withdrawals record created
    ↓
Manager reviews → Approve or Reject
    ↓
If rejected: Amount restored to agent float via reversal entry
```

## 4.5 Commission Payout Workflow

```
Agent accumulates earnings
    ↓
Agent requests commission payout (agent_commission_payouts)
    ↓
Specifies: amount, MoMo number, provider
    ↓
Financial Ops reviews → Approve/Reject
    ↓
If approved: Funds disbursed
```

## 4.6 Proxy Investment (Invest for Partner)

```
Agent initiates "Invest for Partner" on behalf of supporter
    ↓
Agent's wallet debited immediately
    ↓
Portfolio created with status = 'pending_approval'
    ↓
Partner credit + Agent 2% commission queued in pending_wallet_operations
    ↓
Manager/Executive approves:
  - cash_in credits partner wallet
  - cash_out (wallet_to_investment) moves to portfolio
  - Net-zero: Partner wallet stays at 0, money in portfolio
    ↓
If rejected: Portfolio cancelled, agent refunded
```

## 4.7 Agent Earnings Model

| Action | Reward |
|--------|--------|
| Verified house listing | UGX 5,000 |
| Landlord location verification | UGX 5,000 |
| Rent funding facilitation bonus | UGX 5,000 |
| Rent repayment commission | 5% (base) × streak multiplier |
| Sub-agent signup | UGX 500 |
| Sub-agent collections | 1% commission |

## 4.8 Backend Edge Functions

- **`agent-deposit`**: Process agent deposits
- **`agent-withdrawal`**: Process agent withdrawals
- **`agent-invest-for-partner`**: Proxy investment flow
- **`credit-listing-bonus`**: Award listing bonus
- **`credit-landlord-registration-bonus`**: Landlord reg bonus
- **`credit-landlord-verification-bonus`**: Verification bonus
- **`approve-listing-bonus`**: Manager approves listing bonus
- **`send-collection-sms`**: SMS confirmation after collection
- **`process-agent-advance-deductions`**: Daily advance repayments
- **`manual-collect-rent`**: Manual rent collection recording

---

# 5. Supporter (Funder) Workflows

## 5.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Supporter home — portfolio, returns |
| `/investment-portfolio` | Detailed portfolio view |
| `/supporter-earnings` | Earnings/rewards history |
| `/become-supporter` | Onboarding flow |
| `/activate-supporter` | Activation process |
| `/opportunities` | Investment opportunities |
| `/my-watchlist` | Watched opportunities |
| `/investor/portfolio/:token` | Public portfolio share link |

## 5.2 Capital Deployment Flow

```
Supporter deposits funds to wallet
    ↓
Transfers wallet → Rent Management Pool (instant, no approval)
    ↓
Pool balance visible to managers
    ↓
Manager deploys to approved rent request:
  - Atomic transaction via fund-tenant-from-pool
  - Ledger: pool_rent_deployment
  - Creates tenant obligations + auto-charge
  - Pays agent UGX 5,000 bonus
    ↓
15% Reserve locked for monthly rewards
    ↓
Pre-payout Liquidity Gate: blocks if balance < 15% of active capital
```

## 5.3 Returns & Rewards

```
Monthly rewards processing (process-monthly-rewards)
    ↓
ROI calculated on deployed capital
    ↓
Rewards credited to supporter wallet
    ↓
Supporter can withdraw (4-stage approval)
```

## 5.4 Privacy Rules (STRICT)

- Supporters NEVER see: tenant names, landlord names, agent names, phone numbers, user lists, chat
- Supporters ONLY see: Virtual Houses, rent amounts, payment health, portfolio performance, funding outcomes

## 5.5 Backend Edge Functions

- **`fund-rent-pool`**: Wallet → Pool transfer
- **`fund-tenant-from-pool`**: Pool → Rent deployment
- **`create-investor-portfolio`**: New portfolio creation
- **`portfolio-topup`**: Add to existing portfolio
- **`manager-portfolio-topup`**: Manager-initiated topup
- **`create-supporter-invite`**: Generate invite links
- **`activate-supporter`**: Complete supporter activation
- **`process-supporter-roi`**: Calculate and credit ROI
- **`process-monthly-rewards`**: Monthly reward distribution
- **`process-investment-interest`**: Interest calculations
- **`send-supporter-agreement-email`**: Legal agreement
- **`supporter-account-action`**: Account management actions

---

# 6. Landlord Workflows

## 6.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Landlord home — properties, rent status |
| `/welile-homes` | Property listings management |
| `/welile-homes-dashboard` | Landlord dashboard for Welile Homes |
| `/landlord-welile-homes` | Dedicated landlord property view |
| `/landlord-agreement` | Digital landlord agreement |

## 6.2 Property Registration

```
Agent registers property in field
    ↓
Property linked to landlord via phone
    ↓
Landlord details: Name, phone, MoMo provider
    ↓
LC1 Chairperson details (must match property village)
    ↓
GPS coordinates recorded
    ↓
Property chain enforced: Agent → Landlord → Property → Tenant
```

## 6.3 Rent Receipt Flow

```
Rent request approved & funded
    ↓
Agent pays landlord (external)
    ↓
Agent submits proof (GPS + receipt)
    ↓
Landlord receives rent confirmation
    ↓
landlords table updated: amount_received, last_payment
```

## 6.4 Backend

- **`disburse-rent-to-landlord`**: Record landlord disbursement
- **`fund-agent-landlord-float`**: CFO funds agent float for landlord payment
- Auto-routing fallback: Landlord wallet → Caretaker wallet → Agent wallet (for cash-out)

---

# 7. Manager / Staff Workflows

## 7.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/admin/dashboard` | Staff operations hub |
| `/admin/users` | User management |
| `/admin/financial-ops` | Financial Operations Command Center |
| `/staff` | Staff portal |
| `/manager-access` | Manager access request |
| `/manager-login` | Manager authentication |
| `/users` | User administration |
| `/platform-users` | Platform-wide user management |
| `/audit-log` | Audit trail viewer |

## 7.2 Manager Dashboard Sections

- **Agent Operations**: Agent directory, performance tiers, lifecycle pipeline
- **Rent Pipeline**: Multi-stage approval queue
- **Tenant Operations**: Tenant management, transfers
- **Financial Oversight**: Wallet operations, pending approvals
- **User Management**: Role assignments, profile editing
- **Audit Logs**: Full action history

## 7.3 Approval Workflows

### Withdrawal Approval (4-Stage)
```
User requests withdrawal
    ↓ status: 'requested'
Manager reviews → Approve
    ↓ status: 'manager_approved'
CFO reviews → Approve
    ↓ status: 'cfo_approved'
COO reviews → Final Approve
    ↓ status: 'approved' → Funds released
```

### Deposit Approval
```
User submits deposit (TID required)
    ↓
TID Verification (Financial Ops):
  - Match against pending deposits → auto-approve
  - No match → pre-register TID as 'waiting'
    ↓
When depositor submits matching TID → instant auto-approve
    ↓
Audit log records all auto-approvals
```

### Commission Approval
```
Agent earns commission
    ↓
Queued in pending_wallet_operations (status: 'pending')
    ↓
Manager/Executive approves
    ↓
Funds credited to agent wallet
```

## 7.4 Backend Edge Functions

- **`approve-deposit`**: Process deposit approval
- **`approve-wallet-operation`**: Generic wallet op approval
- **`reject-withdrawal`**: Reject withdrawal with reason
- **`delete-user`**: User deletion (with audit)
- **`register-employee`**: Staff registration
- **`transfer-tenant`**: Transfer tenant between agents
- **`batch-process-financials`**: Bulk financial operations
- **`import-partners`**: Bulk partner import
- **`export-database`**: Data export

---

# 8. COO Dashboard Workflows

## 8.1 Route: `/coo/dashboard`

## 8.2 Sections

### Operations Overview KPIs
- Active Users, Active Partners, Active Landlords
- Earning Agents, Rent Coverage metrics
- Each KPI links to a drill-down detail page (`/coo/*`)

### Rent Request Pipeline
- Visual pipeline showing requests at each stage
- Quick approve/reject buttons at COO level (Stage 5)
- GPS proximity verification display

### Partner Management
- Active partners list with portfolio summaries
- **Partner Deletion**: Delete with mandatory reason (not just suspend)
- New partner request queue

### Tenant Operations
- Tenant balances overview
- Tenant transfer management
- Balance health distribution

### Detail Pages
| Route | Purpose |
|-------|---------|
| `/coo/active-users` | Drill into active user metrics |
| `/coo/earning-agents` | Top-earning agents |
| `/coo/tenants-balances` | Tenant balance overview |
| `/coo/rent-requests` | New rent requests |
| `/coo/active-partners` | Active supporter details |
| `/coo/partner-requests` | Pending partner applications |
| `/coo/active-landlords` | Active landlord details |
| `/coo/pipeline-landlords` | Landlords in verification pipeline |
| `/coo/rent-coverage` | Rent coverage analysis |

---

# 9. CFO Dashboard Workflows

## 9.1 Route: `/cfo/dashboard`

## 9.2 Sections

### Channel Balance Tracker
- MTN, Airtel, Bank, Agent Cash channels
- Week-over-week trend indicators
- Daily inflow metrics

### Ledger Hub
- Full visibility into ALL 6 specialized ledgers:
  1. Suspense Ledger (unmatched funds)
  2. Default & Recovery Ledger
  3. Supporter Capital Ledger
  4. Commission Accrual Ledger
  5. Fee Revenue Ledger
  6. Settlement & Reconciliation Ledger
- General Ledger browser with scope filtering (Wallet/Platform/Bridge)

### Rent Request Approval (Stage 6 — Final)
- CFO sees requests at `coo_approved` status
- Approve → Atomic operation:
  - Credits agent landlord float
  - Records bridge-scope ledger entry
  - Issues agent UGX 5,000 bonus
  - Status → `funded`
- Reject → Status → `rejected` with reason

### Wallet Adjustment Tool
- Manual Credit: Platform → User Wallet
- Manual Debit: User Wallet → Platform
- 10-character mandatory audit reason
- Double-entry ledger tracking

### Platform vs. Wallets Reconciliation
- Compares sum of all user wallets vs platform ledger net position
- Auto-flags any variance for audit

### Disbursements
- **Financial Agents**: Tagged agents for expense categories (Ops, Marketing, R&D, Salaries)
- **Payroll**: Monthly batch + individual transfers via `platform-expense-transfer`
- **Proxy Agent Assignments**: For non-smartphone users

### Withdrawal Approval (Stage 3)
- Reviews `manager_approved` withdrawals
- Approve → `cfo_approved` → goes to COO

## 9.3 Backend Edge Functions

- **`cfo-direct-credit`**: Direct wallet credit
- **`platform-expense-transfer`**: Expense disbursement
- **`fund-agent-landlord-float`**: Fund agent float for landlord payouts
- **`approve-rent-request`**: CFO-level rent approval (atomic)

---

# 10. CEO Dashboard Workflows

## 10.1 Route: `/ceo/dashboard`

## 10.2 Sections

- **North Star Metric**: Rent Secured (UGX/month)
- **Executive KPIs**: Active virtual houses, rent success rate, capital utilization
- **Platform Health**: Coverage ratios, liquidity buffer, default rate
- **Growth Trends**: User acquisition, revenue trajectory
- **ROI Trends**: `/roi-trends` — Historical return analysis
- **Executive Hub**: `/executive-hub` — Cross-functional overview

---

# 11. CTO Dashboard Workflows

## 11.1 Route: `/cto/dashboard`

## 11.2 Sections

- **System Health**: Edge function latency, error rates
- **Performance Metrics**: DB reads per session, cache hit rates
- **User Management**: Platform user administration
- **Infrastructure**: Service status, deployment health
- **TV Dashboard**: `/tv-dashboard` — Large-screen monitoring display

---

# 12. CMO Dashboard Workflows

## 12.1 Route: `/cmo/dashboard`

- **User Acquisition**: Signup funnel, referral performance
- **Referral Leaderboard**: Top referrers
- **Campaign Tracking**: Marketing channel performance
- **Engagement Metrics**: DAU/MAU, session data

---

# 13. CRM Dashboard Workflows

## 13.1 Route: `/crm/dashboard`

- **Customer Segments**: Tenant, agent, supporter categorization
- **Support Tickets**: Issue tracking
- **Retention Metrics**: Churn indicators
- **Communication Tools**: Notification management

---

# 14. Financial Operations Command Center

## 14.1 Route: `/admin/financial-ops`

## 14.2 Components

### Live Pulse Strip
- Real-time metrics via RPC `get_financial_ops_pulse`
- Includes: pending, requested, manager_approved, cfo_approved counts
- Total volume, approval rates

### TID Verification Tab (High Priority)
- Primary-colored styling to emphasize mandatory workflow
- **Verify & Match Flow**:
  ```
  Operator enters TID
      ↓
  System searches pending deposits
      ↓
  Match found → Auto-approve via Edge Function
      ↓
  No match → Pre-register in pre_registered_tids (status: 'waiting')
      ↓
  Future deposit with this TID → Instant auto-approval
  ```

### Priority Approval Queue
- Toggle: Newest ↔ Oldest sort
- Filters: status, channel, amount range
- Server-side pagination via RPC `get_paginated_transactions`
- 400ms search debouncing

### Deposit Automation (High-Scale)
- Batch auto-approve TID-matched deposits
- 5% flagged for manual spot-audit
- Duplicate detection

### Payout Automation
- Auto-dispatch withdrawals by channel (MTN, Airtel, Bank, Cash)
- Agent capacity-based assignment
- VIP/500K+ UGX priority lane

### Daily Reconciliation
- `get_reconciliation_summary` RPC
- Ledger totals vs. channel balances
- Anomaly alerts: velocity abuse, balance mismatches

---

# 15. Rent Request Pipeline (End-to-End)

## 15.1 The 6-Stage Pipeline

```
Stage 1: TENANT OPS REVIEW
  ↓ Tenant submits request
  ↓ Tenant Ops validates: tenant details, property chain, landlord info
  ↓ Quick Approve → status: 'tenant_ops_approved'
  ↓ Reject → status: 'rejected' (with reason)

Stage 2: AGENT OPS REVIEW
  ↓ Agent Ops validates: agent assignment, GPS, field verification
  ↓ Quick Approve → status: 'agent_ops_approved'

Stage 3: MANAGER REVIEW
  ↓ Manager validates: financial viability, risk assessment
  ↓ Quick Approve → status: 'manager_approved'

Stage 4: COO REVIEW
  ↓ COO validates: operational capacity, strategic fit
  ↓ Quick Approve → status: 'coo_approved'

Stage 5: CFO APPROVAL (ATOMIC)
  ↓ CFO executes final approval:
    - Credits agent landlord float (bridge scope)
    - Records ledger entry
    - Issues agent UGX 5,000 bonus
    - Status → 'funded'
  ↓ This is an ATOMIC backend operation

Stage 6: AGENT DELIVERY
  ↓ Agent sees funded request in Landlord Float wallet
  ↓ Agent pays landlord externally
  ↓ Agent submits proof (GPS + receipt + TID)
  ↓ Financial Ops verifies
  ↓ Status → 'delivered'
```

## 15.2 Rejection at Any Stage

```
Reviewer rejects with mandatory reason
    ↓
Status → 'rejected'
    ↓
Tenant Ops can review and potentially re-submit
```

## 15.3 Review Interface Shows

- Daily repayment amount calculation
- Assigned agent contact info
- Property GPS with Google Maps link
- LC1 chairperson details
- Approval history timeline

## 15.4 Backend

- **`approve-rent-request`**: Multi-stage approval handler
- **`delete-rent-request`**: Cancel/delete request
- **`fund-tenant-from-pool`**: Deploy pool funds
- **`fund-tenants`**: Batch funding
- **`disburse-rent-to-landlord`**: Record disbursement

---

# 16. Wallet System

## 16.1 Wallet Architecture

```
Every user has a wallet record (wallets table)
    ↓
Balance is DERIVED from ledger (never edited directly)
    ↓
sync_wallet_from_ledger trigger updates wallet on ledger entry
    ↓
CHECK constraint: balance >= 0
    ↓
GREATEST(balance - amount, 0) prevents underflow
```

## 16.2 Wallet UI (`src/components/wallet/`)

### Wallet Statement (WalletStatement.tsx)
- **Direction Filters**: 💰 Money In / 📤 Money Out
- **Category Chips**: Filter by transaction type with counts
- **Plain English Explanations**: Every transaction has a human-readable description
  - e.g., "Your daily rent installment was automatically deducted from your wallet"
- **Date Grouping**: Transactions grouped by day
- **Clear Filter**: Reset all filters

### Wallet Breakdown (WalletBreakdown.tsx)
- Commission breakdown with contextual notes
- "Agent X made a rent repayment. You earned 5% = Y because you registered this tenant"
- Category totals and percentages

### Financial Services

| Service | Flow |
|---------|------|
| **Deposit** | Choose channel (MoMo/Bank/Agent Cash) → Enter amount → Submit TID → Pending approval |
| **Transfer** | Search recipient → Enter amount → Optimistic lock check → Atomic debit/credit |
| **Withdrawal** | Select payout method → Enter amount → 4-stage approval queue |

### Deposit Channels
- **Mobile Money**: TID mandatory, provider selection (MTN, Airtel)
- **Bank Transfer**: Reference number mandatory
- **Agent Cash**: Receipt auto-prefixed with 'RCT'

### Withdrawal Constraints
- Working hours restriction
- Minimum balance requirement
- Amount slider + quick-payout chips

## 16.3 Specialized Wallets

| Wallet Type | Purpose |
|-------------|---------|
| **Personal Wallet** | User's liquid funds |
| **Landlord Float** | Agent's escrow for landlord payments (separate from personal) |
| **Rent Management Pool** | Collective supporter capital |

## 16.4 Ledger Scope Isolation

| Scope | Visibility | Purpose |
|-------|-----------|---------|
| `wallet` | Users see | Personal fund movements |
| `platform` | Staff only | Internal operations |
| `bridge` | Both | Capital inflows, disbursements |

## 16.5 Backend Edge Functions

- **`wallet-transfer`**: Peer-to-peer transfer
- **`agent-deposit`**: Agent deposit processing
- **`agent-withdrawal`**: Agent withdrawal
- **`approve-deposit`**: Deposit approval
- **`approve-wallet-operation`**: Generic approval
- **`reject-withdrawal`**: Rejection with reason
- **`cfo-direct-credit`**: CFO manual credit
- **`seed-test-funds`**: Test environment seeding

---

# 17. Ledger & Accounting Engine

## 17.1 Core Ledger Tables

| Table | Purpose |
|-------|---------|
| `ledger_accounts` | Account definitions (USER_OWNED, OBLIGATION, SYSTEM_CONTROL, REVENUE, EXPENSE, SETTLEMENT) |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Individual debit/credit entries (append-only) |
| `transaction_approvals` | Multi-level approval records |
| `general_ledger` | Central ledger for all financial events |

## 17.2 Double-Entry Rules

- Every financial action creates matching debit AND credit entries
- Entries are APPEND-ONLY (never edited or deleted)
- Corrections via new reversing entries only
- All entries assigned `ledger_scope` via `auto_assign_ledger_scope` trigger

## 17.3 Six Specialized Ledgers

### 1. Suspense Ledger
- Holds unmatched/unreconciled funds
- Auto-populated when deposits can't be matched

### 2. Default & Recovery Ledger
- Tracks tenant defaults
- Records recovery actions and partial payments

### 3. Supporter Capital Ledger
- Manages supporter fund lifecycle
- Tracks: deposits, deployments, returns, withdrawals

### 4. Commission Accrual Ledger
- Agent commission lifecycle
- Stages: earned → accrued → approved → paid

### 5. Fee Revenue Ledger
- Platform income tracking
- Categories: access fees, request fees, service income

### 6. Settlement & Reconciliation Ledger
- External provider matching
- Channel balance verification

## 17.4 Financial Statements

| Statement | Route | Purpose |
|-----------|-------|---------|
| Income Statement | `/financial-statement` | Revenue vs. expenses |
| Cash Flow Statement | `/financial-statement` | Cash movement analysis |
| Balance Sheet | `/financial-statement` | Assets, obligations, equity |
| Facilitated Volume | `/financial-statement` | Rent volume metrics |

## 17.5 Transaction Categories

### Cash In
| Category | Description |
|----------|-------------|
| `tenant_access_fee` | One-time tenant onboarding fee |
| `tenant_request_fee` | Per-request processing fee |
| `rent_repayment` | Daily rent installment |
| `supporter_facilitation_capital` | Supporter pool contribution |
| `agent_remittance` | Agent cash remittance |
| `platform_service_income` | Miscellaneous platform revenue |

### Cash Out
| Category | Description |
|----------|-------------|
| `rent_facilitation_payout` | Landlord rent disbursement |
| `supporter_platform_rewards` | Monthly supporter rewards |
| `agent_commission_payout` | Agent commission payment |
| `transaction_platform_expenses` | Processing costs |
| `operational_expenses` | General operations |

## 17.6 Key Database Triggers

| Trigger | Purpose |
|---------|---------|
| `sync_wallet_from_ledger` | Auto-sync wallet balance from ledger entries |
| `auto_assign_ledger_scope` | Classify entries as wallet/platform/bridge |
| Float exclusion | Prevents float categories from inflating personal wallets |

---

# 18. Property & Housing

## 18.1 Welile Homes (Daily Rent Marketplace)

### Listing Flow
```
Agent in field
    ↓
Registers property:
  - GPS coordinates (mandatory)
  - Photos
  - Monthly rent amount
  - Landlord details
  - LC1 Chairperson details (must match village)
    ↓
Listing appears on /find-a-house immediately
    ↓
Badge: "Pending Verification" or "Verified"
    ↓
Discovery: PostGIS spatial indexing (GIST) for proximity
```

### Property Chain (Enforced)
```
Agent → Landlord → Property → Tenant
    ↓
trg_enforce_property_chain: Blocks tenant assignment if GPS, landlord, or agent missing
    ↓
trg_auto_assign_landlord_on_rent_request: Auto-assigns landlord to posting agent
```

### Chain Health Dashboard
- Monitors data completeness
- `get_chain_health_summary` RPC
- Inline badges: ✅ GPS ✅ Landlord or ❌ Missing

## 18.2 UI Pages

| Route | Purpose |
|-------|---------|
| `/find-a-house` | Map-based property discovery |
| `/house/:id` | Property detail with photos, daily rate |
| `/welile-homes` | Property management |
| `/welile-homes-dashboard` | Welile Homes analytics |
| `/share-location` | GPS sharing for verification |

## 18.3 Backend

- **`vacancy-alerts`**: Notify agents of vacancies
- **`verify-viewing-checkin`**: GPS check-in verification
- **`viewing-confirmation-sms`**: SMS after property viewing

---

# 19. Notifications & Realtime

## 19.1 Realtime Channels (Supabase Realtime)

**Enabled for:**
- Notifications
- Chat messages
- System signals

**Disabled for (security):**
- Wallet balances
- Financial transactions
- Critical state

## 19.2 Notification Types

- Rent payment reminders
- Approval status updates
- Commission earned alerts
- System announcements
- Investment activation notices

## 19.3 Communication Channels

| Channel | Edge Function |
|---------|--------------|
| SMS | `send-collection-sms`, `rent-reminders`, `payment-reminder`, `sms-otp` |
| Push | `send-push-notification` |
| WhatsApp | `whatsapp-login-link` |
| Email | `send-supporter-agreement-email`, `auth-email-hook` |

---

# 20. Edge Functions (Backend Logic)

## 20.1 Complete Function Registry

### Authentication & Identity
| Function | Purpose |
|----------|---------|
| `auth-email-hook` | Custom auth email templates |
| `otp-login` | OTP verification |
| `sms-otp` | Send SMS OTP |
| `whatsapp-login-link` | WhatsApp magic link |
| `admin-reset-password` | Staff password reset |
| `password-reset-sms` | SMS password recovery |
| `vendor-login` | Vendor portal authentication |

### User Management
| Function | Purpose |
|----------|---------|
| `register-tenant` | Tenant registration |
| `register-employee` | Staff registration |
| `delete-user` | User deletion with audit |
| `transfer-tenant` | Agent-to-agent tenant transfer |
| `user-snapshot` | Generate user data snapshot |

### Financial - Deposits & Withdrawals
| Function | Purpose |
|----------|---------|
| `agent-deposit` | Process agent deposit |
| `agent-withdrawal` | Process agent withdrawal |
| `approve-deposit` | Approve pending deposit |
| `approve-wallet-operation` | Generic wallet operation approval |
| `reject-withdrawal` | Reject withdrawal with reason |
| `wallet-transfer` | Peer-to-peer transfer |
| `cfo-direct-credit` | CFO manual credit |

### Financial - Rent Operations
| Function | Purpose |
|----------|---------|
| `approve-rent-request` | Multi-stage rent approval |
| `delete-rent-request` | Cancel rent request |
| `fund-rent-pool` | Wallet → Pool |
| `fund-tenant-from-pool` | Pool → Approved request |
| `fund-tenants` | Batch tenant funding |
| `disburse-rent-to-landlord` | Record landlord payment |
| `fund-agent-landlord-float` | CFO funds agent float |
| `auto-charge-wallets` | Daily rent auto-deductions |
| `manual-collect-rent` | Manual collection recording |
| `check-repayment-status` | Repayment validation |

### Financial - Investments
| Function | Purpose |
|----------|---------|
| `create-investor-portfolio` | New portfolio |
| `portfolio-topup` | Add to portfolio |
| `manager-portfolio-topup` | Manager-initiated topup |
| `agent-invest-for-partner` | Proxy investment |
| `coo-invest-for-partner` | COO proxy investment |
| `activate-supporter` | Supporter activation |
| `create-supporter-invite` | Generate invite |
| `supporter-account-action` | Account management |

### Financial - Rewards & Processing
| Function | Purpose |
|----------|---------|
| `process-monthly-rewards` | Monthly supporter rewards |
| `process-supporter-roi` | ROI calculation |
| `process-investment-interest` | Interest processing |
| `approve-listing-bonus` | Listing bonus approval |
| `credit-listing-bonus` | Award listing bonus |
| `credit-landlord-registration-bonus` | Landlord reg bonus |
| `credit-landlord-verification-bonus` | Verification bonus |

### Financial - Platform Operations
| Function | Purpose |
|----------|---------|
| `platform-expense-transfer` | Expense disbursement |
| `batch-process-financials` | Bulk operations |
| `process-agent-advance-deductions` | Advance repayments |
| `process-credit-daily-charges` | Credit line charges |
| `process-credit-draw` | Credit drawdown |
| `batch-recalculate-credit-limits` | Recalculate limits |
| `refresh-daily-stats` | Snapshot refresh |
| `seed-test-funds` | Test data |

### Communications
| Function | Purpose |
|----------|---------|
| `send-collection-sms` | Collection confirmation SMS |
| `send-push-notification` | Push notifications |
| `send-supporter-agreement-email` | Legal agreement email |
| `rent-reminders` | Rent due reminders |
| `payment-reminder` | Payment reminders |
| `notify-watchers` | Watchlist notifications |
| `viewing-confirmation-sms` | Property viewing SMS |
| `vacancy-alerts` | Vacancy notifications |

### Utilities
| Function | Purpose |
|----------|---------|
| `scan-receipt` | OCR receipt scanning |
| `export-database` | Data export |
| `import-partners` | Bulk partner import |
| `validate-payload` | Input validation |
| `welile-ai-chat` | AI assistant |
| `ussd-callback` | USSD integration |
| `partner-ops-automation` | Partner automation |
| `retry-no-smartphone-charges` | Retry failed charges |
| `product-purchase` | Marketplace purchase |
| `vendor-mark-receipt` | Vendor receipt marking |
| `approve-loan-application` | Loan approval |
| `verify-viewing-checkin` | GPS check-in |

---

# 21. Security & RLS

## 21.1 Row-Level Security

- **All tables** have RLS enabled
- Users can only read/write their own data
- `has_role()` SECURITY DEFINER function for role checks (avoids RLS recursion)
- Service-role access for Edge Functions on critical operations

## 21.2 Financial Security

| Rule | Enforcement |
|------|-------------|
| No direct wallet edits | RLS denies client-side UPDATE on wallets |
| No direct ledger writes | Only service-role Edge Functions can write |
| Optimistic locking | Balance checked before deduction |
| 60-second cooldown | Prevents rapid-fire financial operations |
| Non-negative balances | CHECK constraint + trigger + app-level check |

## 21.3 Access Isolation

| Role | Can See | Cannot See |
|------|---------|------------|
| Tenant | Own rent status, payment schedule | Other users, platform internals |
| Agent | Own registrations, earnings, zone | Other agents' data, financial ledgers |
| Supporter | Virtual houses, portfolio, payment health | Tenant/landlord/agent identities |
| Manager | Flows, queues, risk, solvency | Editable balances |
| Executive | Role-specific dashboards | Cross-role data (enforced by RoleGuard) |

## 21.4 Audit Trail

- All admin actions logged to `audit_logs`
- Mandatory 10-character audit reason
- Immutable append-only log
- Viewable via Audit Log Viewer (`/audit-log`)

---

# 22. Database Schema Overview

## 22.1 Core Tables

### User & Identity
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (name, phone, email, avatar, territory) |
| `user_roles` | Role assignments (separate from profiles) |
| `wallets` | User wallet balances (derived from ledger) |

### Financial Core
| Table | Purpose |
|-------|---------|
| `general_ledger` | Central financial event log |
| `ledger_accounts` | Account definitions |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Double-entry debit/credit records |
| `transaction_approvals` | Multi-level approvals |
| `pending_wallet_operations` | Queued operations awaiting approval |
| `pre_registered_tids` | Pre-registered transaction IDs |

### Rent System
| Table | Purpose |
|-------|---------|
| `rent_requests` | Rent facilitation requests |
| `landlords` | Landlord records with receivables |
| `disbursement_records` | Disbursement tracking |

### Agent Operations
| Table | Purpose |
|-------|---------|
| `agent_collections` | Rent collection records |
| `agent_visits` | GPS check-in records |
| `agent_earnings` | Earnings log |
| `agent_commission_payouts` | Commission payout requests |
| `agent_float_limits` | Float allocation & usage |
| `agent_landlord_float` | Landlord float balances |
| `agent_float_withdrawals` | Float withdrawal records |
| `agent_float_funding` | Float funding history |
| `agent_landlord_payouts` | Landlord payout records |
| `agent_landlord_assignments` | Agent-landlord links |
| `agent_delivery_confirmations` | Delivery proof |
| `agent_tasks` | Assigned tasks |
| `agent_escalations` | Escalation tickets |
| `agent_goals` | Monthly targets |
| `agent_receipts` | Payment receipts |
| `agent_rebalance_records` | Float rebalancing |
| `agent_collection_streaks` | Gamification streaks |
| `agent_incentive_bonuses` | Bonus records |
| `agent_advances` | Cash advances |
| `agent_advance_ledger` | Advance repayment tracking |
| `agent_advance_topups` | Advance topups |
| `agent_subagents` | Sub-agent relationships |

### Property & Housing
| Table | Purpose |
|-------|---------|
| Properties (within rent system) | Listings, GPS, verification status |
| `payment_tokens` | Payment token records |

### Platform Operations
| Table | Purpose |
|-------|---------|
| `audit_logs` | Immutable audit trail |
| `daily_platform_stats` | Cached daily snapshots |
| `notifications` | User notifications |
| `ai_chat_messages` | AI assistant history |

## 22.2 Key Views

| View | Purpose |
|------|---------|
| `manager_profiles` | Manager-relevant profile data |
| `referral_leaderboard` | Referral rankings |
| `user_financial_summaries` | Financial overview per user |

## 22.3 Key RPCs (Database Functions)

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Role check (SECURITY DEFINER) |
| `get_financial_ops_pulse()` | Financial ops metrics |
| `get_paginated_transactions()` | Paginated transaction search |
| `get_reconciliation_summary()` | Daily reconciliation |
| `get_chain_health_summary()` | Property chain health |
| `record_rent_request_repayment()` | Atomic repayment recording |

---

# Appendix A: Offline-First Strategy

| Data Type | Strategy | Cached Locally? |
|-----------|----------|----------------|
| Financial data | Network-first | ❌ Never |
| Profile/UI data | Offline-first | ✅ IndexedDB + localStorage |
| Notifications | Realtime | ✅ Temporary |

**Offline Queue**: Non-financial actions stored locally → background sync → server validation → UI update

---

# Appendix B: Performance Targets

| Metric | Target |
|--------|--------|
| DB reads per session | ≤ 3 |
| Cache hit rate | ≥ 90% |
| Edge function p95 latency | < 300ms |
| Scale target | 40M+ users |

---

# Appendix C: Forbidden Anti-Patterns

- ❌ Direct wallet balance edits
- ❌ Business logic in UI components
- ❌ Offline financial updates
- ❌ Duplicate logic across Edge Functions
- ❌ Revenue recognition without fulfillment
- ❌ Silent financial corrections
- ❌ Supporter seeing tenant/agent identities
- ❌ Unversioned APIs
- ❌ "Fix balance" buttons
- ❌ User lists in supporter UI

---

*End of Document*
