## Goal

Support the new MTN MoMo SMS receipt where the transaction id is written as `ID: 40473329892` (bare digits) instead of the old `MP…` prefix, so pasting it into DepositFlow auto-fills the TID and passes validation.

Sample SMS we must parse:
```
You have paid WELILE TECHNOLOGIES LIMITED 090777 UGX 1,000.
Fee: UGX 0. New balance: UGX 480,692.86. ID: 40473329892.
Download MoMo App http://bit.ly/3KGlEJJ to get 500MBs.
```

## Changes

### 1. `src/utils/smsParser.ts`
Add a new MTN matcher after the existing `MP…` and `TID…` ones, before the generic Ref/Receipt fallback:

```ts
// New MTN format: "ID: 40473329892"
const mtnNew = text.match(/(?:^|[^A-Z])ID[:\s.#-]+(\d{8,18})\b/i);
```

Matching priority (unchanged for old SMS):
1. `MP…` (legacy MTN)
2. `TID…` (Airtel — leading word boundary already excludes "TID" from being eaten by the new ID rule because we match the `MP`/`TID` rules first)
3. `ID: <digits>` (new MTN) — store as the raw digit string (`"40473329892"`)
4. Generic `Ref/Receipt/Txn ID …`

Also confirm the amount rule still picks `UGX 1,000` and skips `Fee: UGX 0` and `New balance: UGX 480,692.86` — the existing `skipRe` already covers `fee` and `balance`, so no change needed.

The sample SMS has no date/time, so those fields will stay empty and the user fills them manually (existing behaviour, already toasts a warning).

### 2. `src/components/payments/DepositFlow.tsx`

Two MTN TID checks currently insist on the `MP` prefix and would reject the new digit-only id.

a. `applyPastedSms` (≈ line 383) — provider auto-detect:
```ts
if (parsed.transactionId?.startsWith('MP')) detectedProvider = 'mtn';
else if (parsed.transactionId?.startsWith('TID')) detectedProvider = 'airtel';
else if (/^\d{8,}$/.test(parsed.transactionId ?? '')) detectedProvider = 'mtn';
```

b. `validateTid` (≈ line 681) — accept either `MP…` or a pure 8–18 digit string for MTN:
```ts
if (prov === 'mtn' && !/^MP[A-Z0-9]{6,}$/.test(upper) && !/^\d{8,18}$/.test(upper)) {
  setTidError("MTN TIDs must start with 'MP' or be the numeric ID from your SMS (e.g. MP39665905645 or 40473329892)");
}
```

c. `isTidValid` (≈ line 694) — same dual rule:
```ts
if (momoProvider === 'mtn') return /^MP[A-Z0-9]{6,}$/.test(upper) || /^\d{8,18}$/.test(upper);
```

d. `computeBlockReason` (≈ line 757) — mirror the new rule and update the error string so the inline hint matches what we just allowed.

e. Update the MTN placeholder/help text in the TID input (≈ lines 738, 1535, 1569) to mention both formats: `"e.g. MP39665905645 or 40473329892"`.

No DB or edge-function changes — TIDs are already stored as free text.

## Out of scope

- Date/time auto-extraction for SMS that don't contain them (the new MTN format omits both — manual entry stays).
- Any change to the receipt-number / RCT flow.
