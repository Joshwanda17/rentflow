Outstanding Balance Tenant Registration

What Changes

Add a third option to the existing AgentRentRequestDialog income-type selection step: "Outstanding Balance". When selected, the form collects only the outstanding amount owed, sets all fees to zero, and creates a rent request tagged as registration_type = 'outstanding_balance'.

Database Migration

Add two columns to rent_requests:

ALTER TABLE [public.rent](http://public.rent)_requests

  ADD COLUMN registration_type TEXT NOT NULL DEFAULT 'normal',

  ADD COLUMN initial_outstanding_balance NUMERIC DEFAULT 0;

No new tables needed. The existing rent_requests table already has access_fee, request_fee, total_repayment, daily_repayment — all will be set to zero-fee values for outstanding balance registrations.

UI Changes (AgentRentRequestDialog.tsx)

Step 1 — Income Type Selection

Add a third card below the existing two options:

Icon: AlertTriangle (amber themed)

Title: "Outstanding Balance"

Subtitle: "Register tenant with existing arrears — no fees applied"

When selected, sets incomeType = 'outstanding' and proceeds to the details step.

Step 2 — Details Form (when outstanding mode)

Outstanding Balance (UGX) — required numeric input (minimum UGX 2,000)

Warning banner: amber background — "This tenant is being registered with an outstanding balance. No access or platform fees will be applied."

All standard fields remain (tenant name/phone, landlord, LC1, house category, GPS, photos)

Fee summary section shows: Rent = outstanding amount, Access Fee = 0, Platform Fee = 0, Total Repayment = outstanding amount

Duration auto-set to 30 days (configurable by agent)

Step 3 — Confirmation

Submit button text changes to: "Register Tenant (No Fees)"

Fee breakdown clearly shows zero fees with a "No Fees" badge

Fee Calculation Logic

When incomeType === 'outstanding':

{

  rentAmount: outstandingBalance,

  durationDays: 30,

  accessFee: 0,

  requestFee: 0,

  totalRepayment: outstandingBalance,

  dailyRepayment: Math.ceil(outstandingBalance / 30),

}

Submission Logic

On submit, the existing insert to rent_requests gains two extra fields:

registration_type: 'outstanding_balance',

initial_outstanding_balance: outstandingBalance,

With access_fee: 0 and request_fee: 0 already set by the fee calculation.

Files

Action

File

Migrate

rent_requests — add registration_type, initial_outstanding_balance

Modify

src/components/agent/AgentRentRequestDialog.tsx — add outstanding balance option, form fields, and zero-fee logic

What This Does NOT Change

No changes to the register-tenant edge function (it only handles user creation)

No changes to repayment/collection logic — repayments reduce amount_repaid against total_repayment as normal

No commission changes needed — commission is calculated on repayment events, not registration

Reporting/analytics updates deferred to a follow-up task