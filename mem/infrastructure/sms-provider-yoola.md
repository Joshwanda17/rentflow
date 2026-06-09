---
name: SMS providers — LANA primary, Yoola + Africa's Talking fallback
description: OTP and password-reset SMS send via LANA first, then Yoola, then Africa's Talking
type: feature
---
# SMS provider chain: LANA (primary) → Yoola → Africa's Talking

OTP / password-reset SMS go through a 3-provider fallback chain. Each provider
is tried only if the previous is unconfigured or rejects, so delivery is never
blocked on one provider.

## 1. LANA SMS (primary) — `LANA_SMS_API_KEY`
- Endpoint: `POST https://api.lanasms.com/v1/send` (note: bare `/v1/send`, NOT
  `/v1/sms/send` which 404s; host is `api.lanasms.com`).
- Auth: `Authorization: Bearer <LANA_SMS_API_KEY>` header.
- Body (JSON): `{ "phone": "256XXXXXXXXX", "message": "..." }`.
- Phone format: digits with country code, no leading `+` (e.g. `256704487563`).
- Success body: `{ "status": true, "message_id": "...", "credits_used": 1 }`.
  Rejection still returns HTTP 200 with `{ "status": false, "message": "..." }`
  (e.g. `No SMS credits available.`) — must check the body, not just HTTP code.
- Out of credits → falls through to Yoola.

## 2. Yoola SMS (fallback) — `YOOLA_SMS_API_KEY`
- Endpoint: `POST https://yoolasms.com/api/v1/send`
- Body (JSON): `{ "phone": "256XXXXXXXXX", "message": "...", "api_key": "<key>" }`
- **Auth is the `api_key` field in the JSON body ONLY.** Do NOT add an
  `Authorization: Bearer` header — Yoola returns `403 invalidkey`.
- Success body: `{ "status": "success", "code": 200, ... }`.

## 3. Africa's Talking (final fallback)
- `AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME`, sender `WELILE`.

## Notes
- Trim all provider keys (`.trim()`) — pasted secrets can carry a trailing
  newline that causes auth failures (Yoola `invalidkey`).
- Implemented in edge functions `sms-otp` and `password-reset-sms`. Other SMS
  functions still use Africa's Talking directly.
- All providers charge per message — monitor balances/credits.
