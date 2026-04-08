

# Fix: Zero Out Proxy Partner Balances for LUKODDA JOSEPH — Clean Slate

## Problem

The Proxy Partners tab shows massively inflated balances (e.g., NFITUMUKIZA BOSCO at 50.7M instead of 1.7M) because the code query on line 91 of `ProxyPartnerFunds.tsx` filters `.eq('direction', 'cash_in')` — ignoring all `cash_out` correction entries.

But even after fixing the query, the net balances still include legacy "corrected" credits from the old backfill (e.g., BOSCO would show 1,701,017 instead of only the 750K that was actually approved through the proper pipeline).

**Your request**: Remove all proxy partner records so we start fresh — only real approved payouts going forward.

## Approach: Two-Part Fix

### Part 1: Fix the Code (ProxyPartnerFunds.tsx)

**Line 91**: Remove `.eq('direction', 'cash_in')` so both `cash_in` and `cash_out` entries are fetched.

**Balance calculation** (around lines 150-160): Change from summing all entries to calculating net:
- `cash_in` amounts → add
- `cash_out` amounts → subtract
- `available = net - withdrawals`

This is the code fix that was previously declined — but it's a prerequisite. Without it, any correction entries we insert will also be ignored.

### Part 2: Insert Balance Correction Entries (Data Cleanup)

Using the append-only ledger policy, insert `balance_correction` entries (direction: `cash_out`) to zero out the remaining net balance for each partner. This uses the `balance_correction` category per the financial integrity governance rules.

**Correction entries to insert** (one per partner with a non-zero net):

| Partner | Current Net | Correction Amount (cash_out) |
|---------|-------------|------------------------------|
| NFITUMUKIZA BOSCO | 1,701,017 | 1,701,017 |
| NATUKUNDA JOSHUA | 3,995,103 | 3,995,103 |
| KABAHETERE SANDRA | 1,221,985 | 1,221,985 |
| NANDUGA DEBORAH | 1,019,165 | 1,019,165 |
| HILLARY TUMUSIIME | 1,108,528 | 1,108,528 |
| ADONG FLAVIA | 535,921 | 535,921 |
| KYOBE JEREMIAH | 672,551 | 672,551 |
| ATIM PAMELA | 32,796 | 32,796 |
| ATUKUNDA CLAIRE | 18,929 | 18,929 |
| MUSISI JEROM | 36,187 | 36,187 |
| JENNIFER MIREMBE | 132,402 | 132,402 |
| NASSAMULA JOYCE | 65,635 | 65,635 |
| AMON OYIRWOTH | 24,067 | 24,067 |
| SSENFUMA FRANCIS | 110,536 | 110,536 |

Each correction entry:
- `user_id`: LUKODDA JOSEPH's ID
- `category`: `balance_correction`
- `direction`: `cash_out`
- `linked_party`: partner's ID
- `description`: "Clean slate correction: zero out legacy proxy ROI credits for [PARTNER NAME]"

Additionally, two partners have entries but NO active proxy assignment (rejected):
- WINNIE & RICHARD: 1,064,000 net
- MUSEMA KIZITO: 1,200,000 net

These also get zeroed out.

### Part 3: Audit Log

Insert one audit log entry recording the bulk correction action with the total amount zeroed and the reason.

## Result After Fix

- All proxy partners for LUKODDA JOSEPH show **USh 0** available
- Only future COO→CFO approved payouts will appear as withdrawable
- The ledger maintains full history (append-only integrity preserved)
- No data deleted — corrections are traceable

## Files Changed

| File | Change |
|------|--------|
| `src/components/agent/ProxyPartnerFunds.tsx` | Remove `direction` filter; calculate net balance (cash_in − cash_out) |
| Data operation (insert tool) | Insert 16 `balance_correction` ledger entries + 1 audit log |

