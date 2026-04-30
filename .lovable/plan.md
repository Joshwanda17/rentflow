## Diagnosis (confirmed in Postgres logs)

The actual error from the database is:

```text
invalid input value for enum deposit_purpose: ""
```

So `DepositFlow` is sending an **empty string** for `deposit_purpose` to `deposit_requests`. The Postgres enum only accepts: `operational_float`, `personal_deposit`, `partnership_deposit`, `personal_rent_repayment`, `other`.

`validateForm()` already has a guard:

```ts
if (!depositPurpose) {
  return { message: 'Select the deposit purpose', fieldId: 'deposit-purpose' };
}
```

…but the empty-string is still reaching the `INSERT`. Two real defects allow this:

1. **The submit payload is not defensive.** The handler passes `depositPurpose` directly into the insert; if state is briefly empty (race between the prefill `useEffect`, the agent-default `useEffect`, and the user tapping the sticky footer button), an empty string is sent. The DB is the only thing catching it.
2. **The `agent-default` `useEffect` (line 366) only fires when `defaultPurpose` is absent.** When the dialog opens for an agent with `defaultPurpose='operational_float'`, the value is set by the line-385 branch — but if `useAuth().roles` resolves later (or the dialog opens and closes quickly enough that `handleClose` runs), `setDepositPurpose('')` from `handleClose` (line 874) wins via `(defaultPurpose ?? '')` when `defaultPurpose` is briefly stale.

Postgres logs also show a parallel, unrelated error spamming the project (~30 / hour):

```text
column reference "rejection_reason" is ambiguous
```

This is `get_funder_approval_status` failing. It blocks the Supporter approval gate from ever returning a clean status. Worth fixing in the same migration since the user reported "ensure all pages work and data integrity".

---

## Plan

### Step 1 — Make the submit handler refuse empty / unknown purposes (frontend)

`src/components/payments/DepositFlow.tsx`

- Add a constant allowlist `ALLOWED_DEPOSIT_PURPOSES = ['operational_float','personal_deposit','partnership_deposit','personal_rent_repayment','other']`.
- At the top of `handleSubmit`, before any DB call, recompute the effective purpose:

  ```ts
  const effectivePurpose =
    depositPurpose ||
    defaultPurpose ||
    (isAgent ? 'operational_float' : '');

  if (!ALLOWED_DEPOSIT_PURPOSES.includes(effectivePurpose as any)) {
    toast.error('Pick a deposit purpose before continuing');
    setStep('purpose');
    setIsSubmitting(false);
    return;
  }
  ```

- Use `effectivePurpose` in BOTH the INSERT and the UPDATE/RPC payloads (replace every `deposit_purpose: depositPurpose` and `chosen_purpose: depositPurpose` write at lines 780, 800, 802, 831, 833).
- Remove the silent fallback `(defaultPurpose ?? '')` in `handleClose` — instead reset to `defaultPurpose ?? null` only when `mustChoosePurpose`, otherwise keep the locked default.

This guarantees no empty value can ever reach the DB, regardless of state-update races, prefill ordering, or stale `isAgent`.

### Step 2 — Surface the backend error properly (frontend)

The current catch block toasts `error?.message`, which for Postgres enum errors is unreadable to a field agent. Map the known database error codes to a friendly toast:

```ts
} catch (error: any) {
  const msg = error?.message ?? '';
  let friendly = 'Please try again or contact support.';
  if (msg.includes('invalid input value for enum deposit_purpose')) {
    friendly = 'Deposit purpose was missing — please pick a purpose and try again.';
  } else if (msg.includes('agent_personal_deposit_requires_confirmation')) {
    friendly = 'Confirm this is your personal money before submitting a Personal Deposit.';
  } else if (error?.code === '23505') {
    friendly = 'This transaction reference has already been used.';
  } else if (msg) {
    friendly = msg;
  }
  toast.error('Failed to submit deposit', { description: friendly });
  setStep('form');
}
```

### Step 3 — Migration: fix `get_funder_approval_status` ambiguous column

The function body has both a CTE column named `rejection_reason` AND a return-table column with the same name, causing every call to throw. Aliasing the CTE columns fixes it without changing the public signature.

```sql
CREATE OR REPLACE FUNCTION public.get_funder_approval_status(_user_id uuid)
RETURNS TABLE (status text, rejection_reason text, approved_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      paa.approval_status   AS r_status,
      paa.rejection_reason  AS r_reason,
      paa.approved_at       AS r_approved_at,
      paa.is_active         AS r_active,
      CASE
        WHEN paa.approval_status = 'approved' AND paa.is_active = true THEN 1
        WHEN paa.approval_status = 'pending'  THEN 2
        WHEN paa.approval_status = 'rejected' THEN 3
        ELSE 4
      END AS rank
    FROM public.proxy_agent_assignments paa
    WHERE paa.beneficiary_id = _user_id
      AND paa.beneficiary_role = 'supporter'
    ORDER BY rank ASC, paa.created_at DESC
    LIMIT 1
  )
  SELECT
    COALESCE(
      CASE WHEN r_status = 'approved' AND r_active THEN 'approved' ELSE r_status END,
      'none'
    )::text,
    r_reason::text,
    r_approved_at
  FROM ranked
  UNION ALL
  SELECT 'none'::text, NULL::text, NULL::timestamptz
  WHERE NOT EXISTS (SELECT 1 FROM ranked)
  LIMIT 1;
END;
$$;
```

### Step 4 — Verify

- Reopen the Deposit to wallet flow on Agent dashboard, allocate to Muhindo Brian, tap **Deposit UGX 55,000** → expect a successful "Deposit submitted for verification" toast and a row in `deposit_requests` with `deposit_purpose='operational_float'`.
- If the user lands on Step 2 with state still empty for any reason, the new client-side guard now shows "Pick a deposit purpose before continuing" and routes them back to the purpose step instead of throwing the cryptic enum error.
- `select * from get_funder_approval_status('cb798acb-…')` returns one row with `status='none'`, no error.

---

## Out of scope

- No edge-function changes (the failing path is a direct PostgREST `INSERT` from the client, not the `agent-deposit` function).
- No enum change to `deposit_purpose` — the existing values are correct; the bug is sending an empty string.
- No UI redesign of the allocator screen — only the submit handler hardening.