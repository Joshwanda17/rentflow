# Welile Platform — Exhaustive UI & Backend Workflow

**Version:** 3.2  
**Date:** 2026-03-30  
**Status:** Living Document — Complete Feature Registry

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
14. [Tenant Operations Dashboard](#14-tenant-operations-dashboard)
15. [Partner Operations Dashboard](#15-partner-operations-dashboard)
16. [Financial Operations Command Center](#16-financial-operations-command-center)
17. [Rent Request Pipeline (End-to-End)](#17-rent-request-pipeline-end-to-end)
18. [Wallet System](#18-wallet-system)
19. [Ledger & Accounting Engine](#19-ledger--accounting-engine)
20. [Property & Housing](#20-property--housing)
21. [Marketplace & E-Commerce](#21-marketplace--e-commerce)
22. [Chat & Messaging](#22-chat--messaging)
23. [AI Assistant](#23-ai-assistant)
24. [Receipts & QR Scanning](#24-receipts--qr-scanning)
25. [Loans & Credit System](#25-loans--credit-system)
26. [Referral & Gamification](#26-referral--gamification)
27. [Notifications & Realtime](#27-notifications--realtime)
28. [Settings & Profile](#28-settings--profile)
29. [Vendor Portal](#29-vendor-portal)
30. [PWA & Offline](#30-pwa--offline)
31. [Edge Functions (Backend Logic)](#31-edge-functions-backend-logic)
32. [Security & RLS](#32-security--rls)
33. [Database Schema Overview](#33-database-schema-overview)
34. [Known Issues & Technical Debt](#34-known-issues--technical-debt)
35. [Appendices](#appendices)

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
| **Apple OAuth** | Redirects to Apple → callback → session created |

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
- **Account Separation**: Accounts from different providers are distinct and not automatically merged
- **Preview Domain Handling**: `preparePreviewOAuthFlow` clears service workers/caches on preview domains

## 1.4 Password Reset

```
User requests password reset
    ↓
resetPasswordForEmail() with redirect to /update-password
    ↓
Always redirects to custom domain (welilereceipts.com) to avoid auth-bridge token invalidation
    ↓
/update-password page allows setting new password
```

## 1.5 UI Components

- `src/components/auth/` — Login forms, OTP input, Google/Apple OAuth buttons, WhatsApp login
- `src/pages/Auth.tsx` — Main auth page
- `src/pages/SelectRole.tsx` — Post-signup role selection
- `src/pages/Join.tsx` — Referral-driven signup
- `src/pages/UpdatePassword.tsx` — Password update page
- `src/pages/Landing.tsx` — Public landing page
- `src/pages/Install.tsx` — PWA install instructions

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
- Qualified investors (≥ UGX 100K deployed capital) can toggle "Open All Dashboards" in Settings
- Users can set a "Home Screen" (Default Dashboard) preference to override defaults

## 2.6 Staff Role Provisioning

- Internal staff/executive roles assigned manually by super_admin/manager/cto
- Dual-access strategy: auto-redirect to /admin/dashboard with hidden 'Staff' nav icon
- `BulkAssignRoleDialog` for batch role assignment
- `BulkRemoveRoleDialog` for batch role removal
- `InlineRoleToggle` / `QuickRoleEditor` / `MobileRoleEditor` for individual role management

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
| `/rent-money` | Rent Money services hub (deposits, transfers, withdrawals) |
| `/my-loans` | View credit/loan status |
| `/rent-discount-history` | Discount history |
| `/benefits` | Loyalty benefits |
| `/my-receipts` | Receipt history |
| `/calculator` | Rent calculator |
| `/try-calculator` | Public rent calculator |
| `/referrals` | Referral tracking |
| `/categories` | Browse categories |

## 3.2 Dashboard Components

- `TenantDashboard.tsx` — Main tenant view
- `TenantMenuDrawer.tsx` — Navigation drawer
- `RentRequestButton.tsx` — Quick rent request action
- `RentRequestForm.tsx` — Full rent request submission
- `RepaymentSection.tsx` — Current repayment status with payment history
- `RepaymentHistoryDrawer.tsx` — Past repayments
- `RepaymentScheduleView.tsx` — Future schedule
- `PaymentStreakCalendar.tsx` — Gamified payment streak
- `RentDiscountWidget.tsx` / `RentDiscountToggle.tsx` — Discount features
- `RentAccessLimitCard.tsx` — Credit limit display
- `LoanProgressWidget.tsx` — Loan progress
- `SubscriptionStatusCard.tsx` — Welile Homes subscription
- `AchievementBadges.tsx` / `ShareableAchievementCard.tsx` — Gamification
- `InviteFriendsCard.tsx` — Referral prompt
- `FindAHouseCTA.tsx` — Property discovery call-to-action
- `NearbyHousesPreview.tsx` / `SuggestedHousesCard.tsx` — Property suggestions
- `AvailableHousesSheet.tsx` — Browse available houses
- `MyLandlordsSection.tsx` — Tenant's landlord info
- `RegisterLandlordDialog.tsx` — Register own landlord
- `IncomeTypeSelector.tsx` — Income categorization
- `RentCalculator.tsx` / `WeeklyMonthlyCalculator.tsx` — Rate calculators
- `ShareHouseButton.tsx` — Share property listing
- `QuickContributeDialog.tsx` — Quick rent contribution

## 3.3 Rent Request Flow (Tenant Perspective)

```
Tenant → Submits Rent Request (amount, landlord details, property)
    ↓
Request enters 6-stage pipeline (see Section 17)
    ↓
If approved & funded:
  - Daily auto-deductions begin from tenant wallet
  - Tenant sees RentProcessTracker: Verification → Approval → Funding → Delivery → Repayment
    ↓
Daily charge via `auto-charge-wallets` Edge Function
    ↓
Repayment tracked in rent_requests.amount_repaid
```

## 3.4 Auto-Deduction Mechanism

```
auto-charge-wallets runs daily at 06:00 UTC (pg_cron)
    ↓
Hierarchical fallback:
  1. Deduct from tenant's wallet
  2. After 72-hour grace period → deduct from linked agent's wallet
  3. For non-smartphone tenants → agent charged directly
    ↓
High-frequency retry: every 3 hours for 24 hours before final debt recording
    ↓
Manual collection also available via Tenant Ops (see Section 14)
```

## 3.5 Automatic Repayment on Deposit

```
Tenant receives a wallet deposit (any channel)
    ↓
approve-wallet-operation checks for active rent request (funded/disbursed/approved)
    ↓
Auto-calculates outstanding balance
    ↓
Invokes record_rent_request_repayment RPC
    ↓
Triggers rent_repayment ledger entry to debit wallet
    ↓
Auto-deductions only on NEW deposit events (not retroactive)
```

## 3.6 Daily Rent Marketplace

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
    ↓
Interactive map with Leaflet + MarkerCluster for discovery at scale
```

## 3.7 Tenant Agreements

- `src/components/tenant/agreement/` — Digital tenant agreement flow
- Terms acceptance and signature capture

## 3.8 Backend Logic

- **`register-tenant`**: Creates tenant profile, links to agent
- **`auto-charge-wallets`**: Daily cron deducts rent installments
- **`process-credit-daily-charges`**: Credit line daily charges
- **`process-credit-draw`**: Credit drawdown processing
- **`check-repayment-status`**: Validates repayment progress
- **`rent-reminders`**: Automated SMS/push reminders
- **`payment-reminder`**: Payment due notifications
- **`retry-no-smartphone-charges`**: Retry failed charges for non-smartphone users

---

# 4. Agent Workflows

## 4.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Agent home — float, earnings, tasks, wallet button |
| `/earnings` | Earnings breakdown with filters |
| `/analytics` | Performance analytics |
| `/agent-registrations` | Tenant/property registrations |
| `/sub-agents` | Sub-agent network analytics |
| `/agent-advances` | Cash advance management |
| `/agent-advances/:id` | Advance detail |
| `/agent/cash-payouts` | Cash payout requests |
| `/referrals` | Referral stats |
| `/my-receipts` | Agent receipts |
| `/deposit-history` | Deposit history |
| `/transaction-history` | Transaction history |

## 4.2 Dashboard Components

- `AgentDashboard.tsx` — Main agent view
- Extra-large purple floating wallet button
- `FloatingActionButton.tsx` — Quick actions FAB
- `FloatingToolbar.tsx` — Contextual toolbar

## 4.3 Registration Workflow

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

## 4.4 Collection Workflow

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

## 4.5 Landlord Payout Workflow

```
Rent request reaches "funded" status (CFO approved)
    ↓
Funds appear in agent's Landlord Float wallet (bridge scope)
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
    ↓
If approved: Agent receives UGX 5,000 personal wallet bonus
```

## 4.6 Commission Payout Workflow

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

## 4.7 Proxy Investment (Invest for Partner)

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
    ↓
Notifications: 'Investment Activated' to supporter, 'Partner Investment Approved' to agent
```

## 4.8 Float Management

- `AgentFloatManager.tsx` — Float overview & operations
- Float limits with low/critical threshold percentages
- Daily transaction limits
- Float pause/resume capability
- Float rebalancing records (`agent_rebalance_records`)
- Float funding history (`agent_float_funding`)
- Cash-on-hand tracking

## 4.9 Agent Advances (Cash Advances)

```
Manager issues advance to agent
    ↓
agent_advances record: principal, daily_rate, cycle_days
    ↓
Daily deductions via process-agent-advance-deductions
    ↓
agent_advance_ledger tracks: opening_balance, interest, deductions, closing_balance
    ↓
Agent can receive topups (agent_advance_topups)
    ↓
Advance expires or is fully repaid → status changes
```

## 4.10 Sub-Agent Network

```
Agent recruits sub-agents (agent_subagents table)
    ↓
Parent agent earns:
  - UGX 500 per sub-agent signup
  - 1% commission on sub-agent collections
    ↓
Sub-agent analytics: /sub-agents page
```

## 4.11 Agent Tasks & Escalations

- `agent_tasks`: Assigned tasks (verify_tenant, visit_property, etc.)
  - Priority levels, due dates, GPS requirements
  - Completion tracking with GPS coordinates and notes
- `agent_escalations`: Agent-reported issues
  - Severity levels, resolution tracking
  - Manager assignment and resolution notes

## 4.12 Agent Goals

- Monthly targets for registrations and activations (`agent_goals`)
- Trackable via analytics page

## 4.13 Agent Earnings Model

| Action | Reward |
|--------|--------|
| Verified house listing | UGX 5,000 |
| Landlord location verification | UGX 5,000 |
| Rent funding facilitation bonus | UGX 5,000 |
| Rent repayment commission | 5% (base) × streak multiplier |
| Sub-agent signup | UGX 500 |
| Sub-agent collections | 1% commission |
| Proxy investment facilitation | 2% commission |

## 4.14 Performance Tiering

| Tier | Criteria |
|------|----------|
| **Gold** | Weighted score ≥ top tier (Earnings 30%, Collections 25%, Referrals 25%, Visits 20%) |
| **Silver** | Weighted score ≥ mid tier |
| **Bronze** | Below mid tier |

## 4.15 Agent Lifecycle Pipeline

```
New → Active → Top Earner
         ↓
    Idle (7d+) → Dormant (30d+)
```

## 4.16 Wallet Statement Filters

- **Direction Filters**: 💰 Money In / 📤 Money Out
- **Category Chips**: Filter by transaction type with counts
- **Plain English Explanations**: Human-readable description for every transaction
- **Date Grouping**: Transactions grouped by day

## 4.17 Agent Products (Marketplace)

- Agents can list products for sale via `AgentProductsSection`
- Product management with add/edit/delete

## 4.18 Backend Edge Functions

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
| `/calculator` | Investment calculator |
| `/referrals` | Referral stats |
| `/financial-statement` | Financial statements |

## 5.2 Dashboard Components

- `SupporterDashboard.tsx` — Main supporter view
- `HeroBalanceCard.tsx` — Large balance display (MTN-style, glassmorphism)
- `PortfolioSummaryCards.tsx` — Portfolio overview
- `QuickStatsRow.tsx` — Key metrics strip
- `ModernQuickActions.tsx` — Action shortcuts
- `ModernQuickLinks.tsx` — Navigation links
- `VirtualHousesFeed.tsx` / `VirtualHouseCard.tsx` / `VirtualHouseDetailsSheet.tsx` — Virtual house browsing
- `HouseOpportunities.tsx` / `RentOpportunities.tsx` — Available investments
- `TenantsNeedingRent.tsx` — Funding needs
- `FundingPoolCard.tsx` — Pool balance & health
- `FundingMilestones.tsx` — Milestone tracking
- `InvestmentCalculator.tsx` / `CalculatorShareCard.tsx` — ROI projection
- `InvestmentGoals.tsx` / `SetGoalDialog.tsx` — Goal setting
- `ROIEarningsCard.tsx` — ROI summary
- `InterestPaymentHistory.tsx` — Reward history
- `CreditRequestsFeed.tsx` — Rent credit requests
- `SupporterLeaderboard.tsx` / `SupporterROILeaderboard.tsx` — Competitive rankings
- `SupporterReferralStats.tsx` — Referral performance
- `SupporterNotificationsFeed.tsx` / `NotificationBell.tsx` / `NotificationsModal.tsx` — Notifications
- `SupporterMenuDrawer.tsx` — Navigation menu
- `FunderPortfolioCard.tsx` — Agent-facing funder summary (invested, returns, wallet, active accounts)
- `ModernInviteCard.tsx` — Invite flow
- `ShareSupporterLink.tsx` / `ShareCalculatorLink.tsx` — Sharing utilities
- `FloatingPortfolioButton.tsx` — Quick portfolio access
- `MerchantCodePills.tsx` — Deposit codes
- `SimpleAccountsList.tsx` / `SimpleInvestmentCard.tsx` — Account views
- `SimpleTenantsList.tsx` — Anonymized tenant list
- `WalletDetailsSheet.tsx` — Wallet breakdown
- `MyInvestmentRequests.tsx` — Pending requests

## 5.3 Capital Deployment Flow

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

## 5.4 Returns & Rewards

```
Monthly rewards processing (process-monthly-rewards)
    ↓
ROI calculated on deployed capital
    ↓
Rewards credited to supporter wallet
    ↓
Supporter can withdraw (4-stage approval)
```

## 5.5 Investment Accounts (Portfolios)

```
Portfolio created via:
  - Self-service (create-investor-portfolio)
  - Agent proxy (agent-invest-for-partner)
  - COO proxy (coo-invest-for-partner)
  - Manager creation (CreateInvestmentAccountDialog)
  - COO wallet-to-portfolio transfer (coo-wallet-to-portfolio)
    ↓
Portfolio lifecycle:
  - Active → Earning ROI
  - Maturity alerts at term end
  - Renewal: Manager resets cycle (3-24 months), custom ROI%, resets total_roi_earned to 0
  - Renewal count badge (×2, ×3) on card
  - Portfolio renewals tracked in portfolio_renewals table
    ↓
Custom naming: Bold nicknames above reduced-size portfolio codes (WIP... ID)
    ↓
Modification: Edit codes, emails, schedules, 'Invested On' dates
    ↓
One-tap PDF generation + WhatsApp sharing
```

## 5.6 COO Wallet-to-Portfolio Transfer (NEW v3.0)

```
COO/Manager/Super Admin selects a partner with wallet balance
    ↓
Transfers funds from partner's wallet into an active portfolio
    ↓
Optimistic locking deducts from wallet
    ↓
Records pending_portfolio_topup operation
    ↓
Attributed as 'Tenant Partnership Operations' in user communications
```

## 5.7 Funder Statement Generation

- **`send-funder-statement`**: Generates and sends portfolio statements to funders

## 5.8 Supporter Agreements

- `src/components/supporter/agreement/` — Digital agreement flow
- Legal agreement sent via `send-supporter-agreement-email`

## 5.9 Privacy Rules (STRICT)

- Supporters NEVER see: tenant names, landlord names, agent names, phone numbers, user lists, chat
- Supporters ONLY see: Virtual Houses, rent amounts, payment health, portfolio performance, funding outcomes

## 5.10 Backend Edge Functions

- **`fund-rent-pool`**: Wallet → Pool transfer
- **`fund-tenant-from-pool`**: Pool → Rent deployment
- **`create-investor-portfolio`**: New portfolio creation
- **`portfolio-topup`**: Add to existing portfolio
- **`manager-portfolio-topup`**: Manager-initiated topup
- **`coo-wallet-to-portfolio`**: COO wallet-to-portfolio direct transfer
- **`apply-pending-topups`**: Process queued portfolio topups
- **`create-supporter-invite`**: Generate invite links
- **`activate-supporter`**: Complete supporter activation
- **`register-proxy-funder`**: Register funder via proxy (agent/manager)
- **`process-supporter-roi`**: Calculate and credit ROI
- **`process-monthly-rewards`**: Monthly reward distribution
- **`process-investment-interest`**: Interest calculations
- **`send-supporter-agreement-email`**: Legal agreement
- **`send-funder-statement`**: Funder statement PDF
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

## 6.2 Dashboard Components

- `LandlordDashboard.tsx` — Main landlord view
- `LandlordMenuDrawer.tsx` — Navigation drawer
- `MyPropertiesSheet.tsx` — Property portfolio
- `MyTenantsSection.tsx` — Tenant listing
- `LandlordPaymentHistory.tsx` — Rent payment history
- `LandlordAddTenantDialog.tsx` — Add tenant to property
- `RegisterPropertyDialog.tsx` — Register new property
- `ManageTenantSubscriptionDialog.tsx` — Manage tenant subscriptions
- `EnrollTenantWelileHomesDialog.tsx` — Enroll tenant in Welile Homes
- `LandlordWelileHomesSection.tsx` — Welile Homes integration
- `WelileHomesLandlordBadge.tsx` — Participation badge
- `WelileHomesLandlordLeaderboard.tsx` — Landlord rankings
- `TenantRating.tsx` — Rate tenants
- `EncouragementMessageDialog.tsx` — Send encouragement to tenants

## 6.3 Property Registration

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

## 6.4 Rent Receipt Flow

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

## 6.5 Landlord Agreements

- `src/components/landlord/agreement/` — Digital landlord agreement flow

## 6.6 Caretaker System

```
Landlord without wallet
    ↓
Agent or third party registered as caretaker
    ↓
Caretaker earns 2% management fee
    ↓
Auto-routing: Funds go to caretaker wallet instead
```

## 6.7 Backend

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
| `/manager-login` | Manager authentication (PIN screen) |
| `/users` | User administration |
| `/platform-users` | Platform-wide user management |
| `/audit-log` | Audit trail viewer |
| `/deposits-management` | Deposit management |
| `/financial-statement` | Financial statements |
| `/roi-trends` | ROI trend analysis |

## 7.2 Manager Dashboard Components

- `ManagerDashboard.tsx` — Main manager view
- `DesktopManagerSidebar.tsx` — Desktop navigation
- `MobileManagerMenu.tsx` — Mobile navigation
- `MobileQuickActions.tsx` — Quick action buttons
- `ManagerHubCards.tsx` — Section navigation cards
- `ManagerKPIStrip.tsx` — Key metrics strip
- `ManagerKPIDetailDrawer.tsx` — Drill-down details
- `ManagerSectionHeader.tsx` — Section headers
- `ManagerTip.tsx` — Contextual tips
- `ManagerPinScreen.tsx` — PIN authentication
- `MyPerformanceCard.tsx` — Staff performance

### Agent Operations
- `AgentDetailsDialog.tsx` — Comprehensive agent profile
- `AgentCollectionsWidget.tsx` — Collection monitoring
- `AgentEarningsOverview.tsx` — Earnings tracking
- `AgentFloatManager.tsx` — Float management
- `AgentCommissionPayoutsManager.tsx` — Commission payouts
- `IssueAdvanceSheet.tsx` — Issue cash advance
- `PaidAgentsHistory.tsx` — Payment history

### User Management
- `UserProfilesTable.tsx` — User listing with search
- `UserDetailsDialog.tsx` / `user-details/` — Detailed user views
- `SimpleUserCard.tsx` — Compact user card
- `CompactUserStats.tsx` — Quick stats
- `UserCountsSummary.tsx` — Total counts
- `ActiveUsersCard.tsx` — Active user monitoring
- `QuickUserLookup.tsx` — Fast user search
- `QuickUserActions.tsx` — Inline user actions
- `FloatingUserActions.tsx` — Floating action buttons
- `InlineRoleToggle.tsx` / `QuickRoleEditor.tsx` / `MobileRoleEditor.tsx` — Role management
- `BulkAssignRoleDialog.tsx` / `BulkRemoveRoleDialog.tsx` — Batch operations
- `InactiveUsersReachOutDialog.tsx` — Re-engagement
- `DuplicatePhoneUsersSheet.tsx` — Duplicate detection
- `CreateUserInviteDialog.tsx` — User invitations
- `BulkWhatsAppDialog.tsx` — Mass WhatsApp messaging
- `UserLocationsManager.tsx` — Location tracking

### Financial Operations
- `FinancialOverview.tsx` — Financial summary
- `FinancialCharts.tsx` — Visual analytics
- `FinancialAlerts.tsx` — Risk alerts
- `FinancialStatementsPanel.tsx` — P&L, cash flow
- `GeneralLedger.tsx` — Ledger browser
- `ManagerLedgerSummary.tsx` — Ledger overview
- `ManagerBankingLedger.tsx` — Banking operations
- `DayGroupedLedger.tsx` — Date-grouped view
- `SupporterPoolBalanceCard.tsx` — Pool health (Balance, Deployed, 15% Reserve, Deployable)
- `ReserveAllocationPanel.tsx` — Reserve management
- `BufferAccountPanel.tsx` — Buffer/escrow accounts
- `BufferTrendChart.tsx` — Buffer trend analysis
- `PeriodComparison.tsx` — Period-over-period analysis
- `DepositRequestsManager.tsx` — Deposit processing
- `DepositAnalytics.tsx` — Deposit metrics
- `DepositRentAuditWidget.tsx` — Rent deposit auditing
- `FloatingDepositsWidget.tsx` — Pending deposits
- `ManagerDepositsWidget.tsx` — Deposit overview
- `AddBalanceDialog.tsx` — Manual balance adjustment
- `FundEditHistory.tsx` — Fund modification trail
- `FundFlowTracker.tsx` — Fund routing visualization
- `MonthlyRewardsTrigger.tsx` — Trigger monthly rewards
- `SupporterROITrigger.tsx` — Trigger ROI calculations

### Rent Pipeline
- `RentRequestsManager.tsx` — Multi-stage queue
- `PendingRentRequestsWidget.tsx` — Pending count
- `ApprovedRequestsFundingWidget.tsx` — Ready-to-fund queue
- `PaymentConfirmationsManager.tsx` — Delivery confirmations
- `PaymentProofsManager.tsx` — Receipt verification

### Investment Management
- `InvestmentAccountsManager.tsx` — Portfolio oversight
- `CreateInvestmentAccountDialog.tsx` — New portfolio
- `CreateSupporterDialog.tsx` / `CreateSupporterWithAccountDialog.tsx` — Supporter creation
- `EditInvestmentAccountDialog.tsx` — Edit portfolio
- `FundInvestmentAccountDialog.tsx` — Fund portfolio
- `RenewPortfolioDialog.tsx` — Portfolio renewal
- `InvestmentEditHistoryDialog.tsx` — Edit trail
- `PendingInvestmentRequestsWidget.tsx` — Pending investments
- `ManagerInvestmentRequestsSection.tsx` — All investment requests
- `SupporterInvitesList.tsx` — Pending invites
- `PendingInvitesWidget.tsx` — Invite count

### Wallet & Approvals
- `PendingWalletOperationsWidget.tsx` — Queued operations
- `WithdrawalRequestsManager.tsx` — Withdrawal queue
- `WelileHomesWithdrawalsManager.tsx` — Welile Homes withdrawals
- `WelileHomesSubscriptionsManager.tsx` — Subscription management
- `SubscriptionMonitorWidget.tsx` — Subscription health

### Operations & Analytics
- `ActivityManager.tsx` — Activity tracking
- `DailyReportMetrics.tsx` — Daily ops brief
- `ForceRefreshManager.tsx` — Cache refresh
- `ChromecastButton.tsx` — TV display mode

### Audit & Compliance
- `AuditLogViewer.tsx` — Full audit trail browser
- `RoleHistoryViewer.tsx` — Role change history
- `PasswordResetGuide.tsx` — Staff password reset guide

### AI-Powered Tools
- `AIBrainDashboard.tsx` — AI insights dashboard
- `AIRecommendationCard.tsx` — AI suggestions

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

## 7.4 Operations Departments

- **Tenant Operations**: Full lifecycle management (see Section 14)
- **Landlord Operations**: Property orchestration, vacancy tracking, listing verification, listing rejection (push back to agent), budget matching, viewing coordination with SMS alerts
- **Partner Operations**: Capital management with card-based dashboard (see Section 15)
- **Agent Operations**: Agent lifecycle, performance, float management
- Operations users assigned to departments via junction table

## 7.5 Backend Edge Functions

- **`approve-deposit`**: Process deposit approval
- **`approve-wallet-operation`**: Generic wallet op approval
- **`reject-withdrawal`**: Reject withdrawal with reason
- **`delete-user`**: User deletion (with audit)
- **`register-employee`**: Staff registration
- **`transfer-tenant`**: Transfer tenant between agents
- **`batch-process-financials`**: Bulk financial operations
- **`import-partners`**: Bulk partner import (up to 200 per batch)
- **`export-database`**: Data export
- **`user-snapshot`**: Generate user data snapshot

---

# 8. COO Dashboard Workflows

## 8.1 Route: `/coo/dashboard`

## 8.2 Tabs & Sections

| Tab | Component | Purpose |
|-----|-----------|---------|
| `overview` | Default | KPIs + Rent Queue + Metrics + Pool + Alerts |
| `rent-approvals` | `RentPipelineQueue` | Stage 4 rent approvals (landlord_ops_approved) |
| `transactions` | `FinancialTransactionsTable` | Transaction monitoring |
| `collections` | `AgentCollectionsOverview` | Agent collection tracking |
| `wallets` | `FinancialOpsCommandCenter` | Wallet operations |
| `agent-activity` | `CashoutAgentActivity` | Agent cashout monitoring |
| `analytics` | `PaymentModeAnalytics` | Payment channel analytics |
| `reports` | `FinancialReportsPanel` | Financial reporting |
| `alerts` | `FinancialAlertsPanel` | Risk & alert management |
| `withdrawals` | `COOWithdrawalApprovals` | Stage 4 withdrawal sign-off |
| `partners` | `COOPartnersPage` | Partner management with **deletion** (mandatory reason) |
| `staff-performance` | `StaffPerformancePanel` | Staff monitoring |

### Operations Overview KPIs
- Active Users, Active Partners, Active Landlords
- Earning Agents, Rent Coverage metrics
- Each KPI links to a drill-down detail page (`/coo/*`)

### Partner Management (COOPartnersPage)
- Partner-level aggregation (total invested, active portfolios, wallet balance)
- Search and filtering across partners
- Full CRUD: create, edit, fund, renew portfolios
- **Partner Deletion**: Delete with mandatory 10-char reason (permanent role removal + account freeze)
- **Suspend**: Soft-disable partner access
- **Wallet-to-Portfolio Transfer**: Move partner wallet funds into active portfolios

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

### Cash Position Reporting
- Separate KPIs for 'Platform Cash' and 'User Funds (Custody)'
- Prevents accounting inflation
- High-priority reconciliation: all user wallets vs. platform ledger net position

### Ledger Hub (Full Visibility)
- Full visibility into ALL 6 specialized ledgers:
  1. Suspense Ledger (unmatched funds)
  2. Default & Recovery Ledger
  3. Supporter Capital Ledger
  4. Commission Accrual Ledger
  5. Fee Revenue Ledger
  6. Settlement & Reconciliation Ledger
- General Ledger browser with scope filtering (Wallet/Platform/Bridge)

### Rent Request Approval (Stage 5 — Final)
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

### Receivables Tracking
- Monitors proportional revenue recognition for access and request fees
- Revenue recognized relative to tenant repayment progress

### Disbursements
- **Financial Agents**: Tagged agents for expense categories (Ops, Marketing, R&D, Salaries)
- **Payroll**: Monthly batch + individual transfers via `platform-expense-transfer`
- **Proxy Agent Assignments**: Searchable User Pickers (name/phone) for non-smartphone users

### Withdrawal Approval (Stage 3)
- Reviews `manager_approved` withdrawals
- Approve → `cfo_approved` → goes to COO

### Cashout Agent Activity
- `CashoutAgentActivity` — Monitor agent cashout patterns

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
- **Staff Performance Panel**: Audit logs, daily heatmaps, SLA compliance (idle time, response rates)
- **ROI Trends**: `/roi-trends` — Historical return analysis
- **Executive Hub**: `/executive-hub` — Cross-functional overview

---

# 11. CTO Dashboard Workflows

## 11.1 Route: `/cto/dashboard`

## 11.2 Sections

- **System Health**: Real-time DB latency monitoring (Healthy <300ms, Degraded >1000ms) every 60 seconds
- **Performance Metrics**: DB reads per session, cache hit rates, Edge Function error rates
- **User Management**: Platform user administration (with role assignment powers)
- **Infrastructure**: Service status, deployment health
- **TV Dashboard**: `/tv-dashboard` — Large-screen monitoring display (ChromecastButton integration)

---

# 12. CMO Dashboard Workflows

## 12.1 Route: `/cmo/dashboard`

- **User Acquisition**: Signup funnel, referral performance
- **Referral Leaderboard**: Top referrers with rankings
- **Campaign Tracking**: Marketing channel performance, attribution
- **Engagement Metrics**: DAU/MAU, session data

---

# 13. CRM Dashboard Workflows

## 13.1 Route: `/crm/dashboard`

- **Customer Segments**: Tenant, agent, supporter categorization
- **Support Tickets**: Issue tracking and triage
- **Retention Metrics**: Churn indicators
- **Communication Tools**: Notification management, bulk messaging

---

# 14. Tenant Operations Dashboard (NEW v3.0)

## 14.1 Route: Part of `/admin/dashboard` → Operations → Tenant Ops

## 14.2 Architecture

Card-based navigation system with separate sub-views:

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Clickable KPIs + Tenant Overview List |
| `pipeline` | `RentPipelineQueue` | Stage 1 rent approvals (tenant_ops_approved) |
| `daily` | `DailyPaymentTracker` | Daily auto-deduction tracking |
| `missed` | `MissedDaysTracker` | Tenants behind on payments |
| `behavior` | `TenantBehaviorDashboard` | Behavioral analytics |
| `history` | `ApprovalHistoryLog` | Full approval audit trail |
| `all-requests` | `ExecutiveDataTable` | All rent requests table |
| `link-agent` | `TenantAgentLinker` | Link tenants to agents |
| `collect-rent` | `TenantRentCollector` | Manual rent collection |
| `agent-tenants` | `AgentTenantSearch` | Agent-tenant relationship search |
| `tenant-detail` | `TenantDetailPanel` | Deep-dive into individual tenant |

## 14.3 Overview KPIs (Clickable)

| KPI | Metric | Click Action |
|-----|--------|--------------|
| Pending | Requests awaiting review | Filters list to pending |
| Funded | Active funded requests | Filters list to funded |
| Repaying | Tenants actively repaying | Filters list to repaying |
| Disbursed | Funds released to landlords | Filters list to disbursed |
| Rejected | Declined requests | Filters list to rejected |
| Completed | Fully repaid requests | Filters list to completed |

## 14.4 Tenant Overview List (`TenantOverviewList.tsx`)

- All tenants displayed with clickable names for deep-dive
- **Category filters**: All, Active (funded/disbursed), Pending, Rejected, Completed
- **Smartphone flag toggle**: Mark tenants as having/not having smartphones
- Syncs with KPI card clicks via `initialCategory` prop
- Deduplicates by `tenant_id` (shows latest request per tenant)

## 14.5 Manual Rent Collection (`TenantRentCollector.tsx`)

```
Tenant Ops Manager selects a tenant with active rent request
    ↓
Chooses collection source:
  - Tenant wallet
  - Agent wallet
    ↓
Enters mandatory reason (≥ 10 characters)
    ↓
manual-collect-rent Edge Function:
  1. Validates reason
  2. Deducts from selected wallet
  3. Records wallet_transaction with reason
  4. Calls record_rent_request_repayment RPC
  5. Logs to audit_logs with full metadata
```

## 14.6 Repayment Trend Chart (`RepaymentTrendChart.tsx`)

- Bar chart showing daily gross repayment breakdown
- Allows Tenant Ops to monitor collection velocity
- Date-range filtering

## 14.7 Tenant Detail Panel

- Deep-dive into individual tenant: rent requests, wallet, repayment history
- Accessible by clicking tenant name in overview list
- Shows all active/past rent requests with amounts and status

## 14.8 Rent Request Deletion

- `DeleteRentRequestDialog.tsx` — Delete tenant's rent request with mandatory reason
- `DeleteHistoryViewer.tsx` — Full snapshot + audit log of deleted requests
- Deletion button on each tenant row in Daily Payment Tracker

---

# 15. Partner Operations Dashboard (NEW v3.0)

## 15.1 Route: Part of `/admin/dashboard` → Operations → Partner Ops

## 15.2 Architecture

Mobile-first, card-based navigation matching the COO/Tenant Ops pattern:

| View | Component | Purpose |
|------|-----------|---------|
| `overview` | Default | Partner KPIs + Quick stats |
| `portfolios` | `COOPartnersPage` | Full partner management (shared with COO) |
| `escalations` | `PartnerOpsBrief` | Partner escalation queue |
| `directory` | `PartnerDirectory` | Partner contact directory |
| `capital` | `PartnerCapitalFlow` | Capital flow visualization |
| `roi` | `ROIPaymentHistory` | ROI payout history with trends |
| `churn` | `PartnerChurnAlerts` | Churn risk alerts |

## 15.3 Partner Table (COOPartnersPage Integration)

- Shares the same partner management interface as COO dashboard
- Partner-level aggregation: total invested, active portfolios, wallet balance
- Search, filtering, and all CRUD dialogs
- Suspend (soft-disable) and Delete (permanent with 10-char reason)
- Portfolio renewal with auto-renewal background task

## 15.4 KPI Cards

- Total Partners, Total Capital, Active Portfolios
- Average ROI, Near-Maturity Count
- Churn risk indicators

## 15.5 Auto-Renewal Logic

- Background task runs on dashboard load (regardless of active tab)
- Checks for matured portfolios and auto-renews based on `auto_reinvest` flag
- Runs once per session (`autoRenewedRef`)

## 15.6 Responsive Behavior

- **Mobile (< 768px)**: 2-column nav grid, back button on sub-views, stacked KPIs
- **Desktop**: 3-column nav grid, wider content, KPIs in 4-column row
- Info icons with tooltips for contextual help

---

# 16. Financial Operations Command Center

## 16.1 Route: `/admin/financial-ops`

## 16.2 Components

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
- Proactive pre-registration from mobile money statements
- Submissions restricted to 7-day window (future/older blocked)
- Transaction references forced uppercase, prefixed TID/RCT

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

# 17. Rent Request Pipeline (End-to-End)

## 17.1 The 6-Stage Pipeline

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

## 17.2 Rejection at Any Stage

```
Reviewer rejects with mandatory reason
    ↓
Status → 'rejected'
    ↓
Tenant Ops can review and potentially re-submit
```

## 17.3 Review Interface Shows

- Daily repayment amount calculation
- Assigned agent contact info
- Property GPS with Google Maps link
- LC1 chairperson details
- Approval history timeline

## 17.4 Repayment Accounting (Triple-Synchronized)

```
Repayment received (auto-deduction, debt clearance, or pre-payment)
    ↓
record_rent_request_repayment RPC:
  1. Updates rent_requests.amount_repaid
  2. Updates landlords table (receivables)
  3. Creates general_ledger entry
    ↓
Repayment hierarchy:
  1. Outstanding rent
  2. Accumulated debt
  3. Future daily installments (advances next_charge_date)
    ↓
Agent earns 5% commission (via credit_agent_rent_commission RPC)
    ↓
If RPC fails → deductions reversed
```

## 17.5 Fund Routing Fallback

```
auto_route_rent_funds logic:
    ↓
1. Landlord wallet (matched by phone) → preferred
2. Caretaker wallet (if landlord missing) → fallback
3. Agent wallet (property verifier) → final fallback for cash-out
```

## 17.6 Backend

- **`approve-rent-request`**: Multi-stage approval handler
- **`delete-rent-request`**: Cancel/delete request
- **`fund-tenant-from-pool`**: Deploy pool funds
- **`fund-tenants`**: Batch funding
- **`disburse-rent-to-landlord`**: Record disbursement

---

# 18. Wallet System

## 18.1 Wallet Architecture

```
Every user has a wallet record (wallets table)
    ↓
Balance is DERIVED from ledger (never edited directly)
    ↓
sync_wallet_from_ledger trigger updates wallet on ledger entry
  - ONLY fires when transaction_group_id IS NOT NULL
    ↓
CHECK constraint: balance >= 0
    ↓
GREATEST(balance - amount, 0) prevents underflow
    ↓
Float-related categories excluded from personal wallet sync
```

## 18.2 Wallet UI (`src/components/wallet/`)

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
- **Mobile Money**: TID mandatory, provider selection (MTN, Airtel), Merchant Codes: 090777/4380664
- **Bank Transfer**: Reference number mandatory (Equity Bank)
- **Agent Cash**: Receipt auto-prefixed with 'RCT'

### Withdrawal Constraints
- Working hours restriction
- Minimum balance requirement
- Amount slider + quick-payout chips

## 18.3 Specialized Wallets

| Wallet Type | Purpose |
|-------------|---------|
| **Personal Wallet** | User's liquid funds |
| **Landlord Float** | Agent's escrow for landlord payments (separate from personal) |
| **Rent Management Pool** | Collective supporter capital |

## 18.4 Ledger Scope Isolation

| Scope | Visibility | Purpose |
|-------|-----------|---------|
| `wallet` | Users see | Personal fund movements |
| `platform` | Staff only | Internal operations |
| `bridge` | Both | Capital inflows, disbursements |

## 18.5 Financial Safety

| Rule | Enforcement |
|------|-------------|
| Optimistic locking | Balance checked before deduction |
| 60-second cooldown | Prevents rapid-fire financial operations |
| Non-negative balances | CHECK constraint + trigger + app-level check |
| Rollback on failure | Balances restored if subsequent operations fail |
| Direct edits blocked | RLS denies client-side UPDATE on wallets |

## 18.6 Backend Edge Functions

- **`wallet-transfer`**: Peer-to-peer transfer
- **`agent-deposit`**: Agent deposit processing
- **`agent-withdrawal`**: Agent withdrawal
- **`approve-deposit`**: Deposit approval (with auto rent repayment)
- **`approve-wallet-operation`**: Generic approval (with auto rent repayment on deposit)
- **`reject-withdrawal`**: Rejection with reason
- **`cfo-direct-credit`**: CFO manual credit
- **`manual-collect-rent`**: Tenant Ops manual collection with mandatory reason
- **`seed-test-funds`**: Test environment seeding

---

# 19. Ledger & Accounting Engine

## 19.1 Core Ledger Tables

| Table | Purpose |
|-------|---------|
| `ledger_accounts` | Account definitions (USER_OWNED, OBLIGATION, SYSTEM_CONTROL, REVENUE, EXPENSE, SETTLEMENT) |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Individual debit/credit entries (append-only) |
| `transaction_approvals` | Multi-level approval records |
| `general_ledger` | Central ledger for all financial events |

## 19.2 Double-Entry Rules

- Every financial action creates matching debit AND credit entries
- Entries are APPEND-ONLY (never edited or deleted)
- Corrections via new reversing entries only
- All entries assigned `ledger_scope` via `auto_assign_ledger_scope` trigger
- Revenue recognized only when service obligation fulfilled (no upfront recognition)

## 19.3 Six Specialized Ledgers

### 1. Suspense Ledger
- Holds unmatched/unreconciled funds
- Auto-populated when deposits can't be matched
- Resolution workflow for clearing suspense items

### 2. Default & Recovery Ledger
- Tracks tenant defaults
- Records recovery actions and partial payments
- Default rate calculation

### 3. Supporter Capital Ledger
- Manages supporter fund lifecycle
- Tracks: deposits, deployments, returns, withdrawals
- Capital utilization metrics

### 4. Commission Accrual Ledger
- Agent commission lifecycle
- Stages: earned → accrued → approved → paid
- Accrual vs. cash basis tracking

### 5. Fee Revenue Ledger
- Platform income tracking
- Categories: access fees, request fees, service income
- Revenue recognition timing

### 6. Settlement & Reconciliation Ledger
- External provider matching
- Channel balance verification
- MoMo/Bank statement reconciliation

## 19.4 Financial Statements

| Statement | Route | Purpose |
|-----------|-------|---------|
| Income Statement | `/financial-statement` | Revenue vs. expenses |
| Cash Flow Statement | `/financial-statement` | Cash movement analysis |
| Balance Sheet | `/financial-statement` | Assets, obligations, equity |
| Facilitated Volume | `/financial-statement` | Rent volume metrics |

UI Components: `IncomeStatementView.tsx`, `CashFlowView.tsx`, `BalanceSheetView.tsx`, `FacilitatedVolumeView.tsx`

## 19.5 Transaction Categories

### Cash In
| Category | Description |
|----------|-------------|
| `tenant_access_fee` | One-time tenant onboarding fee |
| `tenant_request_fee` | Per-request processing fee |
| `rent_repayment` | Daily rent installment |
| `supporter_facilitation_capital` | Supporter pool contribution |
| `agent_remittance` | Agent cash remittance |
| `platform_service_income` | Miscellaneous platform revenue |
| `wallet_deposit` | Generic wallet deposit |
| `agent_commission` | Agent commission credit |
| `referral_bonus` | Referral reward |
| `pending_portfolio_topup` | Queued portfolio top-up |

### Cash Out
| Category | Description |
|----------|-------------|
| `rent_facilitation_payout` | Landlord rent disbursement |
| `supporter_platform_rewards` | Monthly supporter rewards |
| `agent_commission_payout` | Agent commission payment |
| `transaction_platform_expenses` | Processing costs |
| `operational_expenses` | General operations |
| `wallet_to_investment` | Portfolio deployment |
| `rent_float_funding` | Agent landlord float funding |
| `landlord_float_payout` | Landlord payout from float |
| `coo_proxy_investment` | COO proxy investment for partner |
| `pool_rent_deployment` | Pool deployment to tenant |
| `wallet_transfer` | Peer-to-peer transfer |

## 19.6 Key Database Triggers

| Trigger | Purpose |
|---------|---------|
| `sync_wallet_from_ledger` | Auto-sync wallet balance from ledger entries (only when `transaction_group_id` is set) |
| `auto_assign_ledger_scope` | Classify entries as wallet/platform/bridge |
| Float exclusion | Prevents float categories from inflating personal wallets |
| `trg_enforce_property_chain` | Blocks incomplete property chains |
| `trg_auto_assign_landlord_on_rent_request` | Auto-assigns landlord |

## 19.7 Key RPCs

| Function | Purpose |
|----------|---------|
| `record_rent_request_repayment()` | Atomic repayment: updates rent_requests, landlords, creates ledger entry |
| `credit_agent_rent_commission()` | Credits 5% commission: updates wallet + ledger + agent_earnings |

## 19.8 Ledger Account Hierarchy

| Group | Purpose | Allow Negative? |
|-------|---------|----------------|
| USER_OWNED | User wallets | No |
| OBLIGATION | Debts/commitments | Yes |
| SYSTEM_CONTROL | Buffer/escrow | Varies |
| REVENUE | Deferred/recognized | No |
| EXPENSE | Costs/rewards | No |
| SETTLEMENT | Banking operations | Varies |

---

# 20. Property & Housing

## 20.1 Welile Homes (Daily Rent Marketplace)

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
Landlord Ops Manager reviews:
  - Approve → listing stays active
  - Reject → status set to 'rejected' with mandatory reason (≥10 chars)
    ↓
Rejected listings pushed back to agent dashboard with red indicator
    ↓
Agent can fix issues and "Relist" (status → 'available')
    ↓
Discovery: PostGIS spatial indexing (GIST) for proximity
    ↓
Leaflet map with MarkerCluster for dense areas
```

### Property Chain (Enforced)
```
Agent → Landlord → Property → Tenant
    ↓
Missing any link → blocked by trg_enforce_property_chain
```

## 20.2 UI Pages

| Route | Purpose |
|-------|---------|
| `/find-a-house` | Map-based property discovery |
| `/house/:id` | Property detail with photos, daily rate |
| `/welile-homes` | Property management |
| `/welile-homes-dashboard` | Welile Homes analytics |
| `/share-location` | GPS sharing for verification |
| `/landlord-welile-homes` | Landlord property view |

## 20.3 UI Components

- `src/components/house/` — Property cards, detail views
- `src/components/welile-homes/` — Welile Homes specific components
- `src/components/map/` — Map integration (Leaflet)
- `src/components/viewing/ViewingCheckinCard.tsx` — GPS check-in for viewings
- `src/components/verification/VerifyLandlordButton.tsx` — Landlord verification
- `src/components/verification/VerifyTenantButton.tsx` — Tenant verification

## 20.4 Backend

- **`vacancy-alerts`**: Notify agents of vacancies
- **`verify-viewing-checkin`**: GPS check-in verification
- **`viewing-confirmation-sms`**: SMS after property viewing

---

# 21. Marketplace & E-Commerce

## 21.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/marketplace` | Product browsing |
| `/categories` | Category browsing |
| `/flash-sales` | Time-limited deals |
| `/shop-entry` | Shop entry point |
| `/wishlist` | Saved products |
| `/order-history` | Past orders |
| `/seller/:id` | Seller profile |

## 21.2 Components

- `MarketplaceSection.tsx` — Main marketplace layout
- `ProductCard.tsx` — Product display
- `ProductDetailDialog.tsx` — Full product view
- `CartDrawer.tsx` — Shopping cart
- `CategoryCarousel.tsx` / `CategoryManager.tsx` — Category browsing
- `FlashSaleCountdown.tsx` — Sale timer
- `AddProductDialog.tsx` / `EditProductDialog.tsx` — Product management
- `AgentProductsSection.tsx` — Agent's product listings

## 21.3 Backend

- **`product-purchase`**: Process marketplace purchase
- **`vendor-mark-receipt`**: Mark vendor receipt

---

# 22. Chat & Messaging

## 22.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/chat` | Chat interface |
| `/chat-invite` | Chat invitation links |

## 22.2 Components

- `ChatDrawer.tsx` — Main chat interface
- `ChatWindow.tsx` — Message thread
- `ChatList.tsx` — Conversation list
- `ChatButton.tsx` / `FloatingChatButton.tsx` — Chat access
- `NewChatSearch.tsx` — Start new conversation
- `MessageReactions.tsx` — Emoji reactions
- `TypingIndicator.tsx` — Typing status
- `ReadReceipt.tsx` — Message read status
- `BroadcastMessageDialog.tsx` — Mass messaging
- `WhatsAppRequestButton.tsx` — WhatsApp integration

---

# 23. AI Assistant

## 23.1 Components

- `WelileAIChatButton.tsx` — AI chat trigger
- `WelileAIChatDrawer.tsx` — AI chat interface
- `EarningPredictionCard.tsx` — AI earning predictions

## 23.2 Backend

- **`welile-ai-chat`**: AI-powered assistant using Lovable AI models
- Conversation history stored in `ai_chat_messages` table
- Context-aware responses based on user role and data

---

# 24. Receipts & QR Scanning

## 24.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/my-receipts` | Receipt history |

## 24.2 Components

- `QuickReceiptForm.tsx` — Quick receipt entry
- `QRScanner.tsx` — QR code scanning (html5-qrcode)
- `ReceiptStatusTimeline.tsx` — Receipt processing status
- `DashboardReceiptPrompt.tsx` — Dashboard receipt prompt

## 24.3 Backend

- **`scan-receipt`**: OCR receipt scanning via AI

---

# 25. Loans & Credit System

## 25.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/my-loans` | Loan status and management |

## 25.2 Components

- `LoanProductsSection.tsx` — Available loan products
- `LoanProductCard.tsx` — Individual loan display
- `CreditAccessCard.tsx` / `CreditAccessDrawSheet.tsx` — Credit limit display
- `CreditRequestSheet.tsx` — Credit request submission
- `LoanProgressWidget.tsx` — Progress tracking

## 25.3 Backend

- **`approve-loan-application`**: Loan approval processing
- **`process-credit-daily-charges`**: Daily credit charges
- **`process-credit-draw`**: Credit drawdown
- **`batch-recalculate-credit-limits`**: Recalculate all limits

---

# 26. Referral & Gamification

## 26.1 Components

- `ReferralLeaderboard.tsx` — Top referrers ranking
- `ReferralStatsCard.tsx` — Personal referral stats
- `RewardHistoryBadges.tsx` — Earned badges display
- `AchievementBadges.tsx` — Achievement system
- `ShareableAchievementCard.tsx` — Shareable achievements
- `PaymentStreakCalendar.tsx` — Payment streak visualization
- `Confetti.tsx` — Celebration animation

## 26.2 Gamification Features

- **Collection Streaks**: Consecutive collection days → multiplier (up to 1.20x)
- **Badges**: Performance-based badges stored in `agent_collection_streaks.badges`
- **Leaderboards**: Referral, collection, ROI rankings
- **Achievement Cards**: Shareable social cards for milestones

---

# 27. Notifications & Realtime

## 27.1 Realtime Channels (Supabase Realtime)

**Enabled for (trimmed to 3 tables for scale):**
- `messages` — Chat messages
- `wallets` — Balance updates
- `force_refresh_signals` — Cache invalidation

**Disabled for (security + performance):**
- Wallet balances (direct)
- Financial transactions
- Profiles, notifications, deposit_requests, and 14 other tables removed from publication for ~80% broadcast overhead reduction
- Critical state

## 27.2 Notification Types

- Rent payment reminders
- Approval status updates
- Commission earned alerts
- System announcements
- Investment activation notices
- Partner investment approvals
- Viewing confirmations
- Vacancy alerts

## 27.3 Communication Channels

| Channel | Edge Function |
|---------|--------------|
| SMS | `send-collection-sms`, `rent-reminders`, `payment-reminder`, `sms-otp`, `viewing-confirmation-sms` |
| Push | `send-push-notification` |
| WhatsApp | `whatsapp-login-link` |
| Email | `send-supporter-agreement-email`, `auth-email-hook` |

## 27.4 UI Components

- `NotificationBell.tsx` / `NotificationsModal.tsx` — In-app notifications
- `SupporterNotificationsFeed.tsx` — Supporter-specific feed
- `WhatsNewModal.tsx` — Feature announcements
- `ConnectionStatus.tsx` — Connection state indicator
- `OfflineBanner.tsx` — Offline warning

---

# 28. Settings & Profile

## 28.1 UI Pages

| Route | Purpose |
|-------|---------|
| `/settings` | User settings |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

## 28.2 Settings Components

- `BiometricSecuritySection.tsx` — Biometric authentication settings
- `PinSecuritySection.tsx` — PIN code management
- `DiagnosticsSection.tsx` — App diagnostics & troubleshooting
- `LegalSection.tsx` — Legal documents links
- Home Screen preference (Default Dashboard selector)
- "Open All Dashboards" toggle (for qualified investors)

## 28.3 Theme & Accessibility

- `ThemeToggle.tsx` / `AnimatedThemeToggle.tsx` — Dark/light mode
- `HighContrastToggle.tsx` — Accessibility contrast
- `LanguageSwitcher.tsx` / `LocaleSwitcher.tsx` — Language selection
- `CurrencyConverter.tsx` / `CurrencySwitcher.tsx` — Currency preferences

---

# 29. Vendor Portal

## 29.1 Route: `/vendor-portal`

- **`vendor-login`**: Vendor authentication
- **`vendor-mark-receipt`**: Mark receipt as processed
- `VendorAnalytics.tsx` — Vendor performance tracking

---

# 30. PWA & Offline

## 30.1 Progressive Web App

- Service Worker via `vite-plugin-pwa`
- Install prompts: `PWAInstallPrompt.tsx`, `AdaptiveInstallGuide.tsx`, `IOSInstallGuide.tsx`
- iOS optimizations: `IOSOptimizations.tsx`, `IOSLinkHandler.tsx`, `IOSShareReceiver.tsx`
- Pull to refresh: `PullToRefresh.tsx`
- Location permission gate: `LocationPermissionGate.tsx`

## 30.2 Offline Strategy

| Data Type | Strategy | Cached Locally? |
|-----------|----------|----------------|
| Financial data | Network-first | ❌ Never |
| Profile/UI data | Offline-first | ✅ IndexedDB + localStorage |
| Notifications | Realtime | ✅ Temporary |

**Offline Queue**: Non-financial actions stored locally → background sync → server validation → UI update

## 30.3 Error Handling

- `ChunkErrorBoundary.tsx` — Lazy-load error recovery
- `ConnectionStatus.tsx` — Network state monitoring
- `OfflineBanner.tsx` — Offline notification

---

# 31. Edge Functions (Backend Logic)

## 31.1 Complete Function Registry

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
| `register-proxy-funder` | Register funder via proxy agent/manager |
| `delete-user` | User deletion with audit |
| `transfer-tenant` | Agent-to-agent tenant transfer |
| `user-snapshot` | Generate user data snapshot |

### Financial - Deposits & Withdrawals
| Function | Purpose |
|----------|---------|
| `agent-deposit` | Process agent deposit |
| `agent-withdrawal` | Process agent withdrawal |
| `approve-deposit` | Approve pending deposit (with auto rent repayment) |
| `approve-wallet-operation` | Generic wallet operation approval (with auto rent repayment) |
| `reject-withdrawal` | Reject withdrawal with reason |
| `wallet-transfer` | Peer-to-peer transfer |
| `cfo-direct-credit` | CFO manual credit |
| `manual-collect-rent` | Tenant Ops manual collection (mandatory reason) |

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
| `auto-charge-wallets` | Daily rent auto-deductions (06:00 UTC cron) |
| `check-repayment-status` | Repayment validation |
| `retry-no-smartphone-charges` | Retry failed charges for non-smartphone users |

### Financial - Investments
| Function | Purpose |
|----------|---------|
| `create-investor-portfolio` | New portfolio |
| `portfolio-topup` | Add to portfolio |
| `manager-portfolio-topup` | Manager-initiated topup |
| `coo-wallet-to-portfolio` | COO wallet-to-portfolio direct transfer |
| `apply-pending-topups` | Process queued portfolio topups |
| `agent-invest-for-partner` | Agent proxy investment |
| `coo-invest-for-partner` | COO proxy investment |
| `activate-supporter` | Supporter activation |
| `create-supporter-invite` | Generate invite |
| `register-proxy-funder` | Register funder via proxy |
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
| `send-funder-statement` | Funder portfolio statement |
| `rent-reminders` | Rent due reminders |
| `payment-reminder` | Payment reminders |
| `notify-watchers` | Watchlist notifications |
| `viewing-confirmation-sms` | Property viewing SMS |
| `vacancy-alerts` | Vacancy notifications |

### Utilities & Integrations
| Function | Purpose |
|----------|---------|
| `scan-receipt` | OCR receipt scanning |
| `export-database` | Data export |
| `import-partners` | Bulk partner import (up to 200/batch) |
| `validate-payload` | Input validation |
| `welile-ai-chat` | AI assistant |
| `ussd-callback` | USSD integration |
| `partner-ops-automation` | Partner automation (maturity alerts, renewals) |
| `product-purchase` | Marketplace purchase |
| `vendor-mark-receipt` | Vendor receipt marking |
| `approve-loan-application` | Loan approval |
| `verify-viewing-checkin` | GPS check-in |

---

# 32. Security & RLS

## 32.1 Row-Level Security

- **All tables** have RLS enabled
- Users can only read/write their own data
- `has_role()` SECURITY DEFINER function for role checks (avoids RLS recursion)
- Service-role access for Edge Functions on critical operations
- `search_path = public` on critical functions to prevent hijacking

## 32.2 Financial Security

| Rule | Enforcement |
|------|-------------|
| No direct wallet edits | RLS denies client-side UPDATE on wallets |
| No direct ledger writes | Only service-role Edge Functions can write |
| Optimistic locking | Balance checked before deduction |
| 60-second cooldown | Prevents rapid-fire financial operations |
| Non-negative balances | CHECK constraint + trigger + app-level check |
| Rollback on failure | Balances restored if subsequent operations fail |

## 32.3 Access Isolation

| Role | Can See | Cannot See |
|------|---------|------------|
| Tenant | Own rent status, payment schedule | Other users, platform internals |
| Agent | Own registrations, earnings, zone | Other agents' data, financial ledgers |
| Supporter | Virtual houses, portfolio, payment health | Tenant/landlord/agent identities |
| Manager | Flows, queues, risk, solvency | Editable balances |
| Executive | Role-specific dashboards | Cross-role data (enforced by RoleGuard) |

## 32.4 Administrative Permissions

| Action | Allowed Roles |
|--------|---------------|
| Role assignment | super_admin, manager, cto |
| Ops department mapping | super_admin, manager, cto |
| Account freezing/deletion | super_admin, manager, cto, coo |
| Deposit approval/rejection | manager, coo, cfo, super_admin, operations |
| Portfolio admin actions | coo, manager |
| Manual rent collection | operations (tenant_ops) |
| Wallet-to-portfolio transfer | coo, manager, super_admin |

## 32.5 Audit Trail

- All admin actions logged to `audit_logs`
- Mandatory 10-character audit reason
- Immutable append-only log
- Viewable via Audit Log Viewer (`/audit-log`)
- Role change history via `RoleHistoryViewer`

---

# 33. Database Schema Overview

## 33.1 Core Tables

### User & Identity
| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (name, phone, email, avatar, territory, is_frozen, has_smartphone) |
| `user_roles` | Role assignments (separate from profiles) |
| `wallets` | User wallet balances (derived from ledger) |
| `role_access_requests` | Pending role upgrade requests |

### Financial Core
| Table | Purpose |
|-------|---------|
| `general_ledger` | Central financial event log (with ledger_scope) |
| `ledger_accounts` | Account definitions |
| `ledger_transactions` | Transaction headers |
| `ledger_entries` | Double-entry debit/credit records |
| `transaction_approvals` | Multi-level approvals |
| `pending_wallet_operations` | Queued operations awaiting approval |
| `pre_registered_tids` | Pre-registered transaction IDs for auto-matching |
| `deposit_requests` | Deposit request processing |
| `wallet_transactions` | Peer-to-peer transfer records |

### Investment
| Table | Purpose |
|-------|---------|
| `investor_portfolios` | Investment portfolio records |
| `portfolio_renewals` | Portfolio renewal history |
| `supporter_roi_payments` | ROI distribution history |
| `supporter_invites` | Invitation lifecycle & activation tokens |
| `investment_withdrawal_requests` | Capital exit with 90-day cooldown |
| `partner_escalations` | System-generated partner alerts |

### Rent System
| Table | Purpose |
|-------|---------|
| `rent_requests` | Rent facilitation requests (6-stage pipeline) |
| `repayments` | Individual repayment records |
| `landlords` | Landlord records with receivables |
| `disbursement_records` | Disbursement tracking |
| `subscription_charges` | Auto-charge subscription records |

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

### Platform Operations
| Table | Purpose |
|-------|---------|
| `audit_logs` | Immutable audit trail |
| `daily_platform_stats` | Cached daily snapshots (roles breakdown, transaction volume) |
| `notifications` | User notifications |
| `ai_chat_messages` | AI assistant history |
| `referrals` | Referral tracking |
| `referral_rewards` | Referral reward records |
| `cashout_agents` | Tagged agents for payout routing |
| `cfo_threshold_alerts` | CFO risk alerts |
| `commission_accrual_ledger` | Commission lifecycle tracking |

## 33.2 Key Views

| View | Purpose |
|------|---------|
| `manager_profiles` | Manager-relevant profile data |
| `referral_leaderboard` | Referral rankings |
| `user_financial_summaries` | Financial overview per user |

## 33.3 Key RPCs (Database Functions)

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Role check (SECURITY DEFINER) |
| `get_financial_ops_pulse()` | Financial ops metrics |
| `get_paginated_transactions()` | Paginated transaction search |
| `get_reconciliation_summary()` | Daily reconciliation |
| `get_chain_health_summary()` | Property chain health |
| `record_rent_request_repayment()` | Atomic repayment recording (updates rent_requests + landlords + ledger) |
| `credit_agent_rent_commission()` | 5% agent commission (wallet + ledger + earnings) |
| `auto_route_rent_funds()` | Fund routing fallback |
| `detect_velocity_abuse(window_min, threshold)` | Server-side velocity abuse detection (replaces client-side grouping) |

---

# 34. Known Issues & Technical Debt (v3.0 → v3.2)

## 34.1 Double-Credit Bug (CRITICAL — Identified 2026-03-26, **RESOLVED v3.2**)

**Three overlapping wallet update paths caused duplicate credits. Fixed via Single-Writer Principle.**

### Root Cause
No single source of truth for wallet mutation — some paths used trigger-based sync, others used direct wallet updates, and some did both.

### Resolution: Single-Writer Principle (v3.2)

**Rule**: Each wallet mutation type gets exactly ONE owner. Callers must not duplicate what the callee already does.

#### Fix 1: `wallet-transfer` Edge Function → Ledger-Only
- **Before**: Manual `.update()` on both wallets + ledger inserts WITHOUT `transaction_group_id`
- **After**: Two `general_ledger` entries with shared `transaction_group_id` → `sync_wallet_from_ledger` trigger handles both wallet balance changes atomically
- Removed `wallet_transactions` insert (redundant with ledger)
- Pre-check balance before insert; post-check for safety

#### Fix 2: `credit_agent_rent_commission` RPC → Sole Commission Writer
- **Before**: RPC did direct `INSERT INTO wallets ON CONFLICT UPDATE` + ledger (no txn_group_id). Callers (`approve-deposit`) also independently credited wallet and inserted ledger entries → 2-4× overpayment
- **After**:
  - Removed direct wallet writes from RPC; uses `transaction_group_id` on ledger insert so trigger handles wallet credit
  - Added **idempotency guard**: `NOT EXISTS` check on `general_ledger` where `category = 'agent_commission' AND source_id AND user_id` prevents duplicate credits
  - `approve-deposit` stripped of all inline commission logic (earnings insert, wallet update, ledger insert, notification); now delegates entirely to `credit_agent_rent_commission` RPC

#### Fix 3: `record_rent_request_repayment` RPC → Optional `transaction_group_id`
- **Before**: RPC inserted `cash_in` ledger without `transaction_group_id`. Callers also inserted their own `cash_out` ledger with `transaction_group_id` → duplicate ledger records
- **After**: RPC accepts optional `p_transaction_group_id` parameter. If provided, the trigger handles wallet deduction atomically. Backward-compatible (defaults to NULL).

### Enforced Rules (Post-Fix)
1. Wallet balance changes happen **only** via `sync_wallet_from_ledger` trigger (using `transaction_group_id`) OR via a single manual `.update()` — **never both**
2. RPCs own their domain: `credit_agent_rent_commission` is the **sole** commission writer; `record_rent_request_repayment` is the **sole** repayment writer
3. Edge functions must **not** duplicate what an RPC they call already does
4. `auto-charge-wallets` uses manual `.update()` without `transaction_group_id` (single-writer for tenant deductions) — confirmed no duplicate ledger entries

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
| Dashboard snapshot cache | 10 minutes |

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
- ❌ Storing roles on profiles table
- ❌ Client-side admin checks (localStorage)
- ❌ Anonymous sign-ups
- ❌ Multiple wallet update paths for same operation

---

# Appendix D: UI Component Registry

### Layout & Navigation
- `ExecutiveDashboardLayout` — Unified sidebar for executive dashboards
- `MobileBottomNav` — Bottom navigation bar
- `CollapsibleQuickNav` / `QuickNavGrid` — Quick navigation
- `AppBreadcrumb` — Breadcrumb navigation
- `PageTransition` — Route transitions (framer-motion)
- `NavLink` — Active-aware navigation links

### Shared Components
- `MetricCard` — Standardized metric display
- `AnimatedCard` / `AnimatedList` — Motion-enhanced components
- `StatusIndicator` — Status dots/badges
- `SwipeableRow` — Swipeable list items
- `ParticleBackground` — Decorative background
- `WelileLogo` — Brand logo
- `WhatsAppPhoneLink` — WhatsApp deep links
- `SignupPauseBanner` — Signup pause notification
- `DeferredExtras` — Lazy-loaded non-critical components
- `DashboardGuide` — Contextual dashboard help

### Skeleton Loading
- `src/components/skeletons/` — Loading state placeholders

---

# Appendix E: Governing Principles

1. **Dignity before growth** — User trust is paramount
2. **Systems over heroics** — Reliable architecture over manual fixes
3. **Calm over urgency** — Stability over speed
4. **Trust over shortcuts** — No bypassing audit trails
5. **Outcomes over optics** — Real metrics only
6. **Auditability over convenience** — Every action traceable
7. **Correctness over speed** — Financial accuracy first
8. **Solvency over growth** — Never compromise liquidity

---

# Appendix F: Changelog (v2.0 → v3.0 → v3.1 → v3.2)

| Feature | Change |
|---------|--------|
| Tenant Ops Dashboard | NEW (v3.0) — Full Section 14 with card-based navigation, clickable KPIs, smartphone flagging, manual rent collection with mandatory reason, repayment trend charts, tenant detail deep-dive, rent request deletion |
| Partner Ops Dashboard | NEW (v3.0) — Full Section 15 with card-based navigation, COOPartnersPage integration, auto-renewal, churn alerts |
| Manual Rent Collection | Added mandatory reason (≥10 chars) for wallet debits by Tenant Ops |
| COO Wallet-to-Portfolio | NEW (v3.0) — Direct transfer from partner wallet to active portfolio |
| Funder Statement | NEW (v3.0) — `send-funder-statement` edge function for portfolio statements |
| Proxy Funder Registration | NEW (v3.0) — `register-proxy-funder` edge function |
| Pending Topups | NEW (v3.0) — `apply-pending-topups` for queued portfolio top-ups |
| `coo-wallet-to-portfolio` | NEW (v3.0) — Edge function for COO wallet-to-portfolio transfers |
| Double-Credit Bug | DOCUMENTED (v3.0) → **RESOLVED (v3.2)** — Single-Writer Principle enforced across all wallet mutation paths |
| Transaction Categories | EXPANDED (v3.0) — Added wallet_deposit, agent_commission, referral_bonus, pending_portfolio_topup, coo_proxy_investment, pool_rent_deployment, wallet_transfer |
| Auto-Repayment on Deposit | DOCUMENTED (v3.0) — Automatic rent repayment triggered on any wallet deposit |
| Database Schema | EXPANDED (v3.0) — Added wallet_transactions, subscription_charges, repayments, role_access_requests, cashout_agents, cfo_threshold_alerts, commission_accrual_ledger |
| RPCs | EXPANDED (v3.0) — Added credit_agent_rent_commission documentation |
| Administrative Permissions | EXPANDED (v3.0) — Added manual rent collection and wallet-to-portfolio transfer permissions |
| **Listing Rejection Flow** | NEW (v3.1) — Landlord Ops can reject house listings with mandatory reason; rejected listings appear on agent dashboard with red indicator and "Relist" button |
| **Velocity Abuse Detection** | NEW (v3.1) — `detect_velocity_abuse` RPC replaces client-side deposit grouping in `batch-process-financials` (~95% network reduction) |
| **Realtime Publication Trim** | OPTIMIZED (v3.1) — Reduced from 20 tables to 3 (messages, wallets, force_refresh_signals) for ~80% broadcast overhead reduction |
| **Predictive Prefetch Removed** | REMOVED (v3.1) — Deleted `predictivePrefetch.ts` (duplicated `user-snapshot` logic, caused ~50% redundant edge function calls on login) |
| **Batch Processing** | OPTIMIZED (v3.1) — `batch-process-financials` uses `Promise.allSettled` for parallel anomaly flagging |
| **Double-Credit Fix** | RESOLVED (v3.2) — `wallet-transfer` → ledger-only writes with `transaction_group_id`; `credit_agent_rent_commission` → sole commission writer with idempotency guard; `record_rent_request_repayment` → accepts optional `transaction_group_id`; `approve-deposit` → stripped of all inline commission logic, delegates to RPCs |

---

*End of Document — Version 3.2*
