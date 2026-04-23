

# One-Off CFO Phantom Wallet Report (PDF)

## What you'll get

A single PDF saved to `/mnt/documents/welile-phantom-wallets-cfo-report-<date>.pdf` listing every wallet whose balance is not backed by ledger entries, ready to print or email.

## Report contents

**Cover header**
- Title: "Phantom Wallet Reconciliation Report — CFO"
- Generated timestamp, "CONFIDENTIAL", platform = Welile
- Reconciliation rule used (one line):
  `phantom = wallet.balance − SUM(general_ledger WHERE account='wallet:<uid>' AND ledger_scope='wallet' AND classification IN ('production','admin_correction'))`

**Executive summary block**
- Total wallets scanned, phantom wallet count, total phantom UGX
- Breakdown by inferred category (agent_commission_earned, agent_float_deposit, roi_wallet_credit, wallet_deposit, system_balance_correction)
- Top 5 holders by phantom amount

**Main table** (one row per wallet, sorted by phantom amount desc)

| # | Name | Phone | Role(s) | Wallet Balance | Withdrawable | Float | Advance | Ledger Derived | Phantom Gap | Inferred Category | Suggested Action |

**Suggested-action rules**
- Phantom > 1,000,000 UGX & withdrawable > 0 → **"FREEZE withdrawals + back-fill ledger"**
- Phantom > 0 & only float bucket → **"Back-fill as `agent_float_deposit`"**
- Phantom > 0 & supporter role → **"Back-fill as `roi_wallet_credit`"**
- Phantom > 0 & tenant/landlord → **"Back-fill as `wallet_deposit`"**
- No profile attached → **"Investigate orphan wallet — confirm user identity or write down"**
- Withdrawable > balance → **"Bucket integrity error — recompute buckets"**

**Footer**
- Page numbers, "Welile Phantom Reconciliation — CONFIDENTIAL"

## How it will be built

- **Data source**: live SQL via `supabase--read_query` joining `wallets`, `general_ledger`, `profiles`, `user_roles`.
- **PDF generator**: Python `reportlab` script written to `/tmp/`, run via `code--exec`. Landscape A4 to fit the wide table.
- **QA pass**: convert each page to JPEG with `pdftoppm` and inspect for clipping, overlap, missing rows, and column alignment before delivering. Iterate until clean.
- **Output**: `<lov-artifact>` tag pointing at the final PDF in `/mnt/documents/`.

## What this does NOT do

- No database writes. No ledger entries. No wallet changes.
- Does not deliver the back-fill migration that was previously discussed — this is a standalone report only.
- Does not email or share — just produces the file for you to download.

## Files touched

- New: `/tmp/build_phantom_report.py` (transient)
- New: `/mnt/documents/welile-phantom-wallets-cfo-report-<date>.pdf` (deliverable)
- No project source files modified.

