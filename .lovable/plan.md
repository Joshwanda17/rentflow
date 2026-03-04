

## Plan: Agent-Assisted Investor Onboarding — Full Feature

### Overview
Replace the existing `CreateUserInviteDialog` (when role is `supporter`) with an expanded multi-section onboarding form. Create a new `investor_portfolios` table to track individual investment portfolios. Build an investor portfolio page accessible via a shareable link. Allow multiple portfolios per investor.

### Database Changes

**Migration 1: Add columns to `supporter_invites`**
- `national_id` (TEXT, nullable, max 50)
- `country` (TEXT, nullable, max 100)
- `district_city` (TEXT, nullable, max 200)
- `next_of_kin_name` (TEXT, nullable, max 200)
- `next_of_kin_relationship` (TEXT, nullable, max 100)
- `next_of_kin_phone` (TEXT, nullable, max 20)
- `payment_method` (TEXT, nullable) — `mobile_money` or `bank`
- `mobile_network` (TEXT, nullable) — `mtn` or `airtel`
- `mobile_money_number` (TEXT, nullable, max 20)
- `bank_name` (TEXT, nullable, max 100)
- `account_name` (TEXT, nullable, max 200)
- `account_number` (TEXT, nullable, max 50)

**Migration 2: Create `investor_portfolios` table**
```text
investor_portfolios
├── id (UUID PK)
├── investor_id (UUID → profiles.id)
├── agent_id (UUID → profiles.id)
├── portfolio_code (TEXT UNIQUE) — auto-generated e.g. "WPF-XXXX"
├── investment_amount (NUMERIC NOT NULL)
├── duration_months (INT NOT NULL) — 3, 6, or 12
├── roi_percentage (NUMERIC NOT NULL) — e.g. 15
├── roi_mode (TEXT NOT NULL) — 'monthly_payout' or 'monthly_compounding'
├── payment_method (TEXT) — 'mobile_money' or 'bank'
├── mobile_network (TEXT)
├── mobile_money_number (TEXT)
├── bank_name (TEXT)
├── account_name (TEXT)
├── account_number (TEXT)
├── status (TEXT DEFAULT 'active') — active, matured, withdrawn
├── portfolio_pin (TEXT NOT NULL) — 4-digit hashed
├── activation_token (UUID UNIQUE DEFAULT gen_random_uuid())
├── created_at (TIMESTAMPTZ DEFAULT now())
├── maturity_date (DATE)
├── next_roi_date (DATE)
└── total_roi_earned (NUMERIC DEFAULT 0)
```

RLS policies:
- Agents can INSERT and SELECT their own portfolios (`agent_id = auth.uid()`)
- Investors can SELECT their own (`investor_id = auth.uid()`)
- Managers can SELECT all
- Anon can SELECT by activation_token (for shareable link)

### Frontend Changes

**1. Expand `CreateUserInviteDialog.tsx`** — When `selectedRole === 'supporter'`:

Replace the current simple form with a multi-step or scrollable sectioned form:

- **Section 1: Personal Details** — Full Name, Phone, Email (optional), National ID/Passport (optional)
- **Section 2: Address** — Country, District/City, Physical Address
- **Section 3: Next of Kin** — Name, Relationship, Phone
- **Section 4: Investment Details** — Amount (UGX), Duration (3/6/12 month dropdown), Monthly ROI %, ROI Mode (Monthly Payout / Monthly Compounding)
- **Section 5: ROI Payment Method** — Mobile Money or Bank (conditional fields)
- **Section 6: Security** — 4-digit PIN (agent enters), auto-generate option
- **Section 7: Account Setup** — Phone, Temporary Password (existing fields)

All new fields optional except investment amount and duration. Form state extended. Consistent `h-12 text-base rounded-xl` styling.

**2. Success screen update** — After submission, show:
- Portfolio ID
- Shareable link: `{origin}/investor/portfolio/{activation_token}`
- Copy, WhatsApp, SMS, Share buttons (reuse existing pattern)
- Summary of investment details

**3. Rename button** in `AgentInvestForPartnerDialog.tsx`:
- "Register New Partner" → "Register Tenant Supporter Investment"

**4. New page: `/investor/portfolio/:token`** — Public-facing portfolio view:
- Fetches portfolio by `activation_token` (anon-accessible via RLS)
- Shows: Investment Amount, Duration, ROI %, ROI Mode, Payment Account, Assigned Agent name, Next ROI Date, Total Portfolio Value
- If investor is logged in, show full transaction history
- Read-only — no editing of locked fields

**5. Update routing** in App.tsx — Add route for `/investor/portfolio/:token`

### Edge Function Changes

**Update `create-supporter-invite/index.ts`**:
- Accept new fields (national_id, country, district_city, next_of_kin_*, payment_method, bank/mobile details)
- Validate and sanitize all new inputs
- Pass through to `supporter_invites` insert

**New Edge Function: `create-investor-portfolio/index.ts`**:
- Called after successful invite creation (from frontend)
- Accepts: investor user ID (from invite), investment amount, duration, ROI %, ROI mode, payment method details, 4-digit PIN
- Creates entry in `investor_portfolios`
- Generates portfolio_code
- Records in general_ledger (category: `investor_portfolio_created`)
- Returns portfolio data with activation_token for shareable link
- Only agents can call this (role check)

### Investor Dashboard Integration

Update `InvestmentPortfolio.tsx` to fetch from `investor_portfolios` table instead of the dropped `investment_accounts`. Show:
- Total Portfolio Value (sum of all portfolios)
- Active Investments count
- ROI Earned (from `total_roi_earned`)
- Next ROI Payment date
- List of all portfolios with expand/detail view

### Ledger Integration

Each portfolio creation records:
- `investor_id`, `agent_id`, `investment_amount`, `roi_percentage`, `duration_months`, `roi_mode`, `payment_method`, `status`

All via the `investor_portfolios` table + a general_ledger entry for audit.

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/new_1.sql` | Add columns to supporter_invites |
| `supabase/migrations/new_2.sql` | Create investor_portfolios table + RLS |
| `src/components/agent/CreateUserInviteDialog.tsx` | Expand form for supporter role |
| `src/components/agent/AgentInvestForPartnerDialog.tsx` | Rename button text |
| `supabase/functions/create-supporter-invite/index.ts` | Accept new fields |
| `supabase/functions/create-investor-portfolio/index.ts` | New edge function |
| `src/pages/InvestorPortfolioPublic.tsx` | New public portfolio page |
| `src/pages/InvestmentPortfolio.tsx` | Fetch from investor_portfolios |
| `src/App.tsx` | Add route |
| `src/lib/formContracts/contracts.ts` | Add INVESTOR_PORTFOLIO_CONTRACT |

