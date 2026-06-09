---
name: SMS provider — Yoola primary, Africa's Talking fallback
description: OTP and password-reset SMS send via Yoola SMS first, falling back to Africa's Talking
type: feature
---
# SMS provider: Yoola SMS (primary) + Africa's Talking (fallback)

While Africa's Talking comes back online, **Yoola SMS** is the primary OTP /
password-reset SMS gateway.

- Endpoint: `POST https://yoolasms.com/api/v1/send`
- Body (JSON): `{ "phone": "256XXXXXXXXX", "message": "...", "api_key": "<YOOLA_SMS_API_KEY>" }`
- **Auth is the `api_key` field in the JSON body ONLY.** Do NOT add an
  `Authorization: Bearer` header — when present, Yoola returns
  `403 invalidkey`.
- Phone format: digits with country code, **no leading `+`** (e.g. `256704487563`).
- Success body: `{ "status": "success", "code": 200, ... }`.
- Secret: `YOOLA_SMS_API_KEY`.

Implemented in edge functions `sms-otp` and `password-reset-sms`: try Yoola
first; if not configured/rejected, fall back to Africa's Talking
(`AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME`). Other SMS functions
still use Africa's Talking.

Note: Yoola charges per message and balance can run low — monitor `balance` in
the response.