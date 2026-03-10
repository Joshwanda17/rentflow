

## Plan: Remove COO Identity from Partner-Facing Notifications

### Problem
When the COO invests on behalf of a partner, the notification and ledger descriptions expose the COO's name (e.g., "COO SSENKAALI PIUS invested..."). This is unnecessary and potentially confusing for supporters.

### Changes

**File: `supabase/functions/coo-invest-for-partner/index.ts`**

1. **Notification message (line 176)**: Replace "by our operations team" wording — it's already neutral. The `metadata` field still contains `initiated_by: caller.id` which is fine for internal tracking but not shown to user.

2. **Ledger DEBIT description (line 142)**: Change from `COO ${cooName} invested UGX...` to a neutral description like `Welile Operations invested UGX ${amount.toLocaleString()} from ${partnerName}'s wallet into Rent Management Pool...` — removes the COO name.

3. **Ledger CREDIT description (line 165)**: Change from `...COO proxy investment by ${cooName}` to `...facilitated by Welile Operations`.

4. **Remove COO profile fetch** (line 129): The `cooProfileRes` and `cooName` variable are no longer needed for user-facing text. Keep `caller.id` in metadata for audit trail only.

### Summary of Text Changes

| Location | Before | After |
|---|---|---|
| Ledger debit | `COO ${cooName} invested UGX...` | `Welile Operations invested UGX...` |
| Ledger credit | `(COO proxy investment by ${cooName})` | `(facilitated by Welile Operations)` |
| Notification | Already neutral | No change needed |

The COO's identity remains in `metadata.initiated_by` and server logs for audit purposes, but is hidden from supporter-facing notifications and descriptions.

