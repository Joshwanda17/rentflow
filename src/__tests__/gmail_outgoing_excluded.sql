-- Outgoing/sent/charge Gmail receipts must NEVER create or auto-approve
-- deposit requests, and must be recorded in gmail_deposit_exclusions.
-- Wrapped in a transaction and rolled back so nothing persists.
\set ON_ERROR_STOP on
BEGIN;

-- Fixtures ---------------------------------------------------------------
-- A profile with a known phone the auto-create function would resolve to.
-- We intentionally use a 256... phone the parser will pick up from the body.
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (v_uid, 'Outgoing Test User', '0700123456',
          'outgoing-test-' || v_uid || '@example.test');

  PERFORM set_config('test.user_id', v_uid::text, true);
END $$;

-- 1) direction='out' must NOT create a deposit and MUST be logged ---------
INSERT INTO public.gmail_transactions (
  gmail_message_id, from_email, subject, snippet, raw_body,
  amount, transaction_id, parsed, internal_date, direction
) VALUES (
  'test-msg-out-' || gen_random_uuid()::text,
  'mobilemoney@mtn.co.ug',
  'Payment Sent',
  'You have sent UGX 50,000 to 256700123456. TID: MP240518.1234.A12345',
  'You have sent UGX 50,000 to 256700123456. TID: MP240518.1234.A12345',
  50000, 'MP240518.1234.A99001', true, now(), 'out'
);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.deposit_requests
    WHERE transaction_id = 'MP240518.1234.A99001';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FAIL: outgoing email created % deposit row(s)', c;
  END IF;
  RAISE NOTICE 'PASS: outgoing email did not create a deposit';

  SELECT count(*) INTO c FROM public.gmail_deposit_exclusions
    WHERE transaction_id = 'MP240518.1234.A99001'
      AND reason = 'outgoing_money_sent';
  IF c <> 1 THEN
    RAISE EXCEPTION 'FAIL: outgoing email exclusion log missing (got %)', c;
  END IF;
  RAISE NOTICE 'PASS: outgoing email logged as outgoing_money_sent';
END $$;

-- 2) direction='charge' must NOT create a deposit and MUST be logged ------
INSERT INTO public.gmail_transactions (
  gmail_message_id, from_email, subject, snippet, raw_body,
  amount, transaction_id, parsed, internal_date, direction
) VALUES (
  'test-msg-charge-' || gen_random_uuid()::text,
  'mobilemoney@mtn.co.ug',
  'Transaction Fee',
  'Fee of UGX 500. TID: MP240518.1234.A99002',
  'Fee of UGX 500 charged. TID: MP240518.1234.A99002',
  500, 'MP240518.1234.A99002', true, now(), 'charge'
);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.deposit_requests
    WHERE transaction_id = 'MP240518.1234.A99002';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FAIL: charge email created % deposit row(s)', c;
  END IF;

  SELECT count(*) INTO c FROM public.gmail_deposit_exclusions
    WHERE transaction_id = 'MP240518.1234.A99002'
      AND reason = 'fee_or_charge_email';
  IF c <> 1 THEN
    RAISE EXCEPTION 'FAIL: charge email exclusion log missing (got %)', c;
  END IF;
  RAISE NOTICE 'PASS: charge email blocked and logged';
END $$;

-- 3) direction NULL (unknown) must NOT create a deposit -------------------
INSERT INTO public.gmail_transactions (
  gmail_message_id, from_email, subject, snippet, raw_body,
  amount, transaction_id, parsed, internal_date, direction
) VALUES (
  'test-msg-null-' || gen_random_uuid()::text,
  'mobilemoney@mtn.co.ug',
  'Statement',
  'Reference MP240518.1234.A99003 amount UGX 1,000 phone 256700123456',
  'Reference MP240518.1234.A99003 amount UGX 1,000 phone 256700123456',
  1000, 'MP240518.1234.A99003', true, now(), NULL
);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.deposit_requests
    WHERE transaction_id = 'MP240518.1234.A99003';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FAIL: unknown-direction email created % deposit row(s)', c;
  END IF;

  SELECT count(*) INTO c FROM public.gmail_deposit_exclusions
    WHERE transaction_id = 'MP240518.1234.A99003'
      AND reason = 'unknown_direction';
  IF c <> 1 THEN
    RAISE EXCEPTION 'FAIL: unknown-direction exclusion log missing (got %)', c;
  END IF;
  RAISE NOTICE 'PASS: unknown-direction email blocked and logged';
END $$;

-- 4) auto_create_deposits_from_gmail() must skip outgoing rows even when
-- called directly with a fresh, phone-resolvable outgoing email.
INSERT INTO public.gmail_transactions (
  gmail_message_id, from_email, subject, snippet, raw_body,
  amount, transaction_id, parsed, internal_date, direction
) VALUES (
  'test-msg-out-explicit-' || gen_random_uuid()::text,
  'mobilemoney@mtn.co.ug',
  'Payment Sent',
  'You sent UGX 25,000 to 256700123456 from 256700123456. TID: MP240518.1234.A99004',
  'You sent UGX 25,000 to 256700123456 from 256700123456. TID: MP240518.1234.A99004',
  25000, 'MP240518.1234.A99004', true, now(), 'out'
);

DO $$
DECLARE c int;
BEGIN
  PERFORM public.auto_create_deposits_from_gmail(24);
  SELECT count(*) INTO c FROM public.deposit_requests
    WHERE transaction_id = 'MP240518.1234.A99004';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FAIL: auto_create_deposits_from_gmail created % row(s) for outgoing', c;
  END IF;
  RAISE NOTICE 'PASS: auto_create_deposits_from_gmail skipped outgoing email';
END $$;

-- 5) Negative control: an incoming row IS eligible and IS NOT logged as excluded.
INSERT INTO public.gmail_transactions (
  gmail_message_id, from_email, subject, snippet, raw_body,
  amount, transaction_id, parsed, internal_date, direction
) VALUES (
  'test-msg-in-' || gen_random_uuid()::text,
  'mobilemoney@mtn.co.ug',
  'Money Received',
  'You have received UGX 5,000 from 256700999999. TID: MP240518.1234.A99005',
  'You have received UGX 5,000 from 256700999999. TID: MP240518.1234.A99005',
  5000, 'MP240518.1234.A99005', true, now(), 'in'
);

DO $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.gmail_deposit_exclusions
    WHERE transaction_id = 'MP240518.1234.A99005';
  IF c <> 0 THEN
    RAISE EXCEPTION 'FAIL: incoming email was incorrectly logged as excluded (% row(s))', c;
  END IF;
  RAISE NOTICE 'PASS: incoming email not logged as excluded';
END $$;

RAISE NOTICE 'PASS: gmail outgoing exclusion invariants all green';

ROLLBACK;