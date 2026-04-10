

# Trace Real vs Test Money — Ledger Classification Report

## Findings

Your ledger has **11,355 total entries** across two distinct populations:

### Production (Locked Categories) — 7,616 entries
Categories in the approved allowlist. These are **real money**: `wallet_deposit`, `wallet_withdrawal`, `referral_bonus`, `system_balance_correction`, `rent_disbursement`, etc.
- Total In: UGX 137.9M | Total Out: UGX 191.4M

### Legacy / Test — 3,739 entries
Categories that predate the locked category system. These break into 3 sub-groups:

**1. Clearly Test/Development (safe to flag)**
| Category | In | Out | Entries |
|---|---|---|---|
| `test_funds_cleanup` | 5.6M | 87.7M | 6 |
| `opening_balance` | 46.2M | 92.5M | 498 |
| `🔧 Manual Adjustment` | 40K | — | 1 |
| `correction_reversal` | 50K | — | 1 |
| `balance_correction` | 560K | 12.9M | 18 |

**2. Legacy Real Operations (pre-lockdown categories)**
| Category | Entries | Notes |
|---|---|---|
| `deposit` (91) | 209.2M in | Old version of `wallet_deposit` |
| `roi_payout` (103) | 186.2M in, 121.4M out | Old version of `roi_wallet_credit` |
| `supporter_facilitation_capital` (47) | 61.9M in | Old version of `partner_funding` |
| `agent_proxy_investment` (45) | 58.9M out | Legacy agent ops |
| `supporter_rent_fund` (60) | Real capital deployment |
| `rent_repayment` (149) | Real collections |
| `agent_commission` (2,363) | Old version of `agent_commission_earned` |

**3. Admin/Operational (manual corrections)**
| Category | Notes |
|---|---|
| `wallet_deduction_general_adjustment` (17) | 56.6M out — manual deductions |
| `wallet_deduction_cash_payout_retraction` (5) | 66.6M out — payout reversals |
| `manager_debit` / `manager_credit` | Staff ops |
| `reconciliation` (1) | 23.1M — one-time fix |

## Plan — Generate Classification Report

### Step 1: Generate a CSV artifact
Run a script that queries the ledger and classifies every entry as:
- **`production`** — locked category
- **`legacy_real`** — pre-lockdown but represents real money movement
- **`test_dev`** — test funds, opening balances, manual adjustments
- **`admin_correction`** — balance corrections, reconciliation entries

Output: `/mnt/documents/ledger_classification_2026-04-10.csv` with columns: `id, user, category, direction, amount, classification, created_at`

### Step 2: Generate summary report
A second CSV with per-category totals and classification, so you can see at a glance what's real vs test.

### No ledger changes
Zero writes. Read-only analysis only. The CSV becomes your reference for future cleanup decisions.

