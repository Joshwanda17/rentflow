---
name: SMS providers — Yoola primary, Africa's Talking + LANA fallback
description: OTP and password-reset SMS send via Yoola first, then Africa's Talking, then LANA
type: feature
---
# SMS provider chain: Yoola (primary) → Africa's Talking → LANA

OTP / password-reset SMS go through a 3-provider fallback chain. Each provider
is tried only if the previous is unconfigured or rejects, so delivery is never
blocked on one provider.

## 3. LANA SMS (final fallback) — `LANA_SMS_API_KEY`
- Endpoint: `POST https://api.lanasms.com/v1/send` (note: bare `/v1/send`, NOT
  `/v1/sms/send` which 404s; host is `api.lanasms.com`).
- Auth: `Authorization: Bearer <LANA_SMS_API_KEY>` header.
- Body (JSON): `{ "phone": "256XXXXXXXXX", "message": "..." }`.
- Phone format: digits with country code, no leading `+` (e.g. `256704487563`).
- Success body: `{ "status": true, "message_id": "...", "credits_used": 1 }`.
  Rejection still returns HTTP 200 with `{ "status": false, "message": "..." }`
  (e.g. `No SMS credits available.`) — must check the body, not just HTTP code.
- Used only if Yoola AND Africa's Talking both fail/are unconfigured.

## 1. Yoola SMS (primary) — `YOOLA_SMS_API_KEY`
- Endpoint: `POST https://yoolasms.com/api/v1/send`
- Body (JSON): `{ "phone": "256XXXXXXXXX", "message": "...", "api_key": "<key>", "sender": "WELILE" }`
- **`sender` MUST be `"WELILE"`** in the body on every Yoola call site (set explicitly, not relying on the account default).
- **Auth is the `api_key` field in the JSON body ONLY.** Do NOT add an
  `Authorization: Bearer` header — Yoola returns `403 invalidkey`.
- Success body: `{ "status": "success", "code": 200, ... }`.
- **APPROVED SENDER (2026-07-09):** The Yoola account only has `ATInfo`
  approved/paid. Forcing `UGPoll` (or `WELILE`) returns HTTP 403
  `{"status":"sender_not_allowed"}` and is silently NOT delivered. A live test
  to `0701355245` with `sender:"ATInfo"` returned `status:"success"` (msg id
  184975, UGX 30). Omit the sender or use `ATInfo` — never `UGPoll`/`WELILE`.

## 2. Africa's Talking (fallback)
- `AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME`, sender `WELILE`.

## Notes
- Trim all provider keys (`.trim()`) — pasted secrets can carry a trailing
  newline that causes auth failures (Yoola `invalidkey`).
- **Yoola is the PRIMARY OTP sender for EVERY OTP service — no exceptions.**
  The others are fallbacks only, tried in order when Yoola is unconfigured or
  rejects. OTP senders now Yoola-first:
  - `sms-otp` (login + phone verification) → Yoola → AT → LANA
  - `password-reset-sms` → Yoola → AT → LANA
  - `issue-landlord-payout-otp` → Yoola → AT → Twilio
  - `agent-cash-deposit-create` / `agent-cash-deposit-resend` → Yoola → AT
  - `self-update-phone` reuses `sms-otp` to send (no separate sender).
- Sender ID is `WELILE` on every SMS path (AT `from`, Twilio `From`). Yoola uses
  the account-registered sender (WELILE).
- Non-OTP notification SMS may still use Africa's Talking directly.
- All providers charge per message — monitor balances/credits.
