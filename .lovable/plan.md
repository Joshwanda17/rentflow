

# Implement Proportional Revenue Recognition

## Problem
Currently, when a daily charge is collected, the entire amount is recorded as a single `tenant_access_fee` ledger entry. The `record_rent_request_repayment` RPC also records the full amount as one `rent_repayment` entry. There is no proportional splitting — financial reports cannot distinguish how much of each collection went to rent principal vs. access fee vs. registration fee.

## Solution
Create a database trigger (`sync_collection_to_ledger`) that fires after each collection is verified and splits the payment proportionally across the three revenue components. Remove the manual ledger inserts from the edge function — the trigger handles it.

## Changes

### 1. Create `sync_collection_to_ledger` trigger function
**Migration**

A trigger on `subscription_charge_logs` that fires `AFTER INSERT` when `status = 'success'` or `status = 'partial'`. For each collection:

- Look up the linked `rent_request` via `subscription_charges` to get `rent_amount`, `access_fee`, `request_fee`, and `total_repayment`
- Calculate proportional shares:
  - `rent_share = amount_collected × (rent_amount / total_repayment)`
  - `access_share = amount_collected × (access_fee / total_repayment)`
  - `request_share = amount_collected × (request_fee / total_repayment)`
- Apply rounding correction to ensure shares sum exactly to the collected amount
- Insert three `platform`-scope ledger entries:
  - `category: 'rent_principal_collected'` — rent portion (pass-through, not revenue)
  - `category: 'access_fee_collected'` — access fee portion (platform revenue)
  - `category: 'registration_fee_collected'` — registration fee portion (platform revenue)
- All three entries share a single `transaction_group_id` and reference the `subscription_charge_logs` row

### 2. Update `auto-charge-wallets` edge function
**File: `supabase/functions/auto-charge-wallets/index.ts`**

- Remove the manual `general_ledger` insert with `category: 'tenant_access_fee'` (lines ~302-313) — the trigger now handles proportional ledger entries
- The `logAndUpdateCharge` function already inserts into `subscription_charge_logs`, which will fire the trigger
- Keep the `record_rent_request_repayment` RPC call (it tracks `amount_repaid` on the rent request)
- Same for the agent-fallback and partial-payment paths — remove their manual ledger inserts too

### 3. Update financial reporting queries
**File: `src/hooks/useFinancialStatements.ts`** (or equivalent)

- Add the new categories (`rent_principal_collected`, `access_fee_collected`, `registration_fee_collected`) to the Income Statement revenue section
- `access_fee_collected` and `registration_fee_collected` are **revenue**
- `rent_principal_collected` is **not revenue** — it's a pass-through (facilitating rent to landlord)
- Deprecate/remove reliance on the old `tenant_access_fee` category for new entries

### 4. Update `record_rent_request_repayment` RPC
**Migration**

- Remove the `general_ledger` insert from inside this function (it currently inserts a `rent_repayment` entry which duplicates what the trigger does)
- Keep the `rent_requests.amount_repaid` update, `repayments` insert, and `landlords` balance update

## Technical Details

**Trigger logic (PostgreSQL):**
```sql
CREATE OR REPLACE FUNCTION public.sync_collection_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_charge RECORD;
  v_rr RECORD;
  v_total numeric;
  v_rent_share numeric;
  v_access_share numeric;
  v_request_share numeric;
  v_group_id uuid := gen_random_uuid();
BEGIN
  IF NEW.status NOT IN ('success', 'partial') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_charge FROM subscription_charges WHERE id = NEW.subscription_id;
  IF v_charge.rent_request_id IS NULL THEN RETURN NEW; END IF;

  SELECT rent_amount, access_fee, request_fee, total_repayment
  INTO v_rr FROM rent_requests WHERE id = v_charge.rent_request_id;

  v_total := COALESCE(NEW.amount_deducted, 0) + COALESCE(NEW.agent_deducted, 0);
  IF v_total <= 0 OR v_rr.total_repayment <= 0 THEN RETURN NEW; END IF;

  v_rent_share := ROUND(v_total * (v_rr.rent_amount / v_rr.total_repayment));
  v_access_share := ROUND(v_total * (v_rr.access_fee / v_rr.total_repayment));
  v_request_share := v_total - v_rent_share - v_access_share; -- remainder

  INSERT INTO general_ledger (user_id, amount, direction, category, ...) VALUES
    (NEW.tenant_id, v_rent_share, 'cash_in', 'rent_principal_collected', ...),
    (NEW.tenant_id, v_access_share, 'cash_in', 'access_fee_collected', ...),
    (NEW.tenant_id, v_request_share, 'cash_in', 'registration_fee_collected', ...);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Rounding:** The registration fee share absorbs the rounding remainder to ensure the three shares sum exactly to the collected amount.

**Backward compatibility:** Existing `tenant_access_fee` entries remain in the ledger for historical data. Reports should query both old and new categories during the transition.

**Files modified:**
- 1 migration: create `sync_collection_to_ledger` trigger + update `record_rent_request_repayment` RPC
- `supabase/functions/auto-charge-wallets/index.ts` — remove manual ledger inserts
- `src/hooks/useFinancialStatements.ts` — add new revenue categories

