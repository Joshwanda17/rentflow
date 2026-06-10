---
name: Landlord daily guaranteed-rent SMS broadcast
description: Daily SMS to every landlord phone promoting guaranteed rent + house-listing link
type: feature
---
# Landlord daily guaranteed-rent SMS

Edge function `landlord-daily-guarantee-sms` texts EVERY distinct landlord phone
(`landlords.phone`, deduped, >=9 digits) once per day.

- Cron: pg_cron job `landlord-daily-guarantee-sms`, daily `0 8 * * *` (08:00 UTC
  / 11:00 EAT), POSTs to the function with the anon apikey (no user).
- Provider chain: Yoola (primary) -> Africa's Talking -> LANA. Sender ID `WELILE`.
- Message: Welile guarantees monthly rent; list houses at
  `https://welilereceipts.com/landlord-signup`; WhatsApp/Call `+256748747134`;
  HQ `Welile Technologies Ltd, Palm Lane Kabaale, Entebbe (P.O. Box 167564,
  Kampala)`. Edit the `MESSAGE`/`WHATSAPP`/`LIST_LINK`/`HQ` constants in the
  function to change copy.
- Manual test: POST `{ "test_phone": "07xxxxxxxx" }` as a staff user
  (coo/ceo/cto/cmo/super_admin/manager) — sends one message to that number only.
- Logs every send to `sms_delivery_log` (source `landlord-daily-guarantee` /
  `landlord-daily-guarantee-test`) and writes one `audit_logs` summary per run.

## Opt-out
- Every SMS ends with `Stop SMS: https://welilereceipts.com/stop-sms`.
- Public page `/stop-sms` (`StopSms.tsx`) — phone input (prefilled from `?p=`),
  calls edge fn `sms-opt-out` (service role) which upserts into `sms_opt_outs`
  (UNIQUE `phone`, normalized to `+256…`).
- The daily batch loads `sms_opt_outs` once and skips any matching phone; run
  result/audit includes `opted_out` count.
- `sms_opt_outs` is staff-readable (ops roles via `has_role`); writes happen only
  through the `sms-opt-out` edge function.
