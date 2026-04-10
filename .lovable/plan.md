

# Fix: Channel Balance Tracker — Include `mobile_money_provider` in Withdrawal Matching

## Problem
244 withdrawals (~16.4M UGX) show as "Unassigned" because `payout_method = 'mobile_money'` doesn't match any channel. The actual provider lives in `mobile_money_provider`.

## Fix — Single File Edit

**File**: `src/components/cfo/ChannelBalanceTracker.tsx`

### Change 1: Add `mobile_money_provider` to the withdrawal query SELECT
```ts
.select('amount, payout_method, mobile_money_provider, status, created_at')
```

### Change 2: Update withdrawal channel-matching logic
For withdrawals, check both `payout_method` AND `mobile_money_provider`:
```ts
const m = (w.payout_method || '').toLowerCase();
const p = (w.mobile_money_provider || '').toLowerCase();
if (ch.key === 'mtn') return m.includes('mtn') || p.includes('mtn');
if (ch.key === 'airtel') return m.includes('airtel') || p.includes('airtel');
// bank, cash, unassigned — same logic but also check p
```

## Impact
- No database changes
- No migrations
- Single file, two small edits
- Unassigned drops to ~0, MTN/Airtel reflect real outflows

