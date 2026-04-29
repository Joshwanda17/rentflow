## Problem

The NFC card was written with a **truncated payload** (only 4 fields):
```json
{ "version": 1, "issuer": "Welile", "card_id": "6804fb0d…", "hmac_signature": "6bc9…" }
```

But the verifier (`supabase/functions/verify-nfc-card/index.ts`) requires 7 fields — it needs `user_id`, `pinless_limit`, and `issued_at` to recompute the HMAC. So even if the phone reads the card, verification fails. The reason it appears to "keep scanning" is the NDEF reader fires `onreading`, JSON.parse succeeds with the partial object, the call to `verify-nfc-card` returns `{error: "Card payload incomplete"}` (400) — but on some Android devices the reader event also silently fails when the record `recordType` is `"unknown"` (raw bytes) instead of `"text"`/`"mime"`, so it never even calls `processCard`.

Both issues need fixing.

## Fix Plan

### 1. Make the NFC card payload self-sufficient (server-side hydration)

Update `supabase/functions/verify-nfc-card/index.ts` so it accepts the **compact card form** (just `card_id` + `hmac_signature` + `version` + `issuer`) and hydrates the missing fields from the `nfc_cards` table before recomputing the HMAC. This matches what the printable JSON/PDF actually contains and what users will write to physical cards.

- If `user_id` / `pinless_limit` / `issued_at` are missing on the incoming `card`, look up `nfc_cards` by `card_id`, pull `user_id`, `pinless_limit`, `issued_at`, then recompute `expectedSig = HMAC(card_id|user_id|pinless_limit|issued_at)` and compare with `hmac_signature`.
- Keep the existing full-payload path as a fallback (backward compat).
- Tighten the "Card payload incomplete" error so only truly invalid payloads (no `card_id` or no `hmac_signature`) get rejected.

### 2. Make the client-side NDEF reader more tolerant

In `src/components/wallet/RequestMoneyDialog.tsx` `startNfcTap()`:
- Iterate **all** records (not break on first), and accept `recordType === 'text'`, `'mime'`, **and** `'unknown'` (decode raw bytes as UTF-8 then try JSON.parse).
- Also try to JSON.parse the URL record body as a fallback.
- Add a 30s waiting timeout that flips to `failed` with a clear "No card detected" message instead of spinning forever.
- Log the read attempt + the parsed payload to console (debug aid for the user's current card).

### 3. New transaction-result popup component

Create `src/components/wallet/NfcTransactionResultDialog.tsx` — a small, polished dialog with three variants:

- **Success** — green check ring, "Payment Successful", amount in big UGX, recipient name (returned from edge function), reference id, "Done" button.
- **Insufficient Balance** — amber/red wallet icon, "Insufficient Balance on Card", shows requested amount and (when the edge function returns it) the cardholder's available balance, "Try Smaller Amount" + "Close" buttons.
- **Failed** — destructive icon, friendly mapped messages for: `Card signature invalid`, `Card is blocked or revoked`, `Card not registered`, `Cannot charge your own card`, `Incorrect PIN`, `NFC not supported`, generic fallback. "Try Again" + "Close".

Mount this dialog from `RequestMoneyDialog` and trigger it in place of the current inline `success`/`failed` blocks for a clearer UX (the inline states stay as quick visual feedback inside the tap card, but the popup is the authoritative confirmation).

### 4. Edge function returns balance context on insufficient funds

In `verify-nfc-card`, after the cardholder is identified, call `get_user_available_balance(p_user_id := card.user_id)`. If `amount > availableBalance`, respond with HTTP 402 and:
```json
{ "error": "INSUFFICIENT_BALANCE", "available": <number>, "requested": <number> }
```
Then the popup can show "Card has UGX X available; you tried to charge UGX Y."

(Note: the actual debit still happens later when the cardholder approves the `money_requests` row — but a pre-flight balance check at tap time is the correct UX so the merchant doesn't think the tap "worked" and then have it silently fail.)

### 5. Memory update

Add a short memory note `mem://features/wallet/nfc-card-payment` describing:
- Compact card payload format (4 fields) is canonical; verifier hydrates from `nfc_cards`.
- Tap creates a `money_requests` row for the cardholder to approve (no auto-debit).
- Pre-flight balance check uses `get_user_available_balance`.

## Files to change

- `supabase/functions/verify-nfc-card/index.ts` — hydrate missing fields, pre-flight balance check, structured `INSUFFICIENT_BALANCE` response.
- `src/components/wallet/RequestMoneyDialog.tsx` — tolerant NDEF reader, 30s timeout, wire popup.
- `src/components/wallet/NfcTransactionResultDialog.tsx` — **new** popup with 3 states.
- `mem://features/wallet/nfc-card-payment` — **new** memory + index.md update.

## Out of scope

- Re-issuing the user's card (their existing card stays valid once the verifier hydrates from DB).
- Changing the actual money-movement model (still goes through `money_requests` approval).
