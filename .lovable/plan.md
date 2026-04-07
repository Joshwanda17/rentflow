

# Partner Investment Capture with Receipt Upload & CFO Review

## What Exists Today

The `AgentInvestForPartnerDialog` is a simple 3-field form (name, phone, amount) that immediately activates a portfolio via the `agent-invest-for-partner` edge function. There is **no receipt upload**, **no investment reference field**, and **no CFO review step** — investments go live instantly.

## What Changes

Add receipt upload + investment reference to the agent form, store receipt files in a private storage bucket, and add a CFO review panel for verifying partner investments with receipt visibility.

---

## Database Changes

### 1. New storage bucket: `investment-receipts` (private)
- RLS: agents upload to their own folder, CFO/manager/coo can read all

### 2. Alter `investor_portfolios` table
Add two columns:
- `investment_reference TEXT` — agent-provided transaction reference or description
- `receipt_file_url TEXT` — URL to uploaded receipt in storage

These fields attach directly to the portfolio record, avoiding a new table since the existing `investor_portfolios` already tracks each investment with agent_id, partner info, amount, and status.

---

## File Changes

### `src/components/agent/AgentInvestForPartnerDialog.tsx`
- Add **Investment Reference** text input (required, placeholder "e.g. MoMo TID 12345 or cash receipt number")
- Add **Receipt Upload** field (required) — file input accepting PDF, JPG, PNG with preview
- Upload receipt to `investment-receipts/{agent_id}/{timestamp}_{filename}` before submitting
- Pass `investment_reference` and `receipt_file_url` to the edge function
- Validation: block submit if no receipt attached

### `supabase/functions/agent-invest-for-partner/index.ts`
- Accept new optional fields: `investment_reference`, `receipt_file_url`
- Store them on the `investor_portfolios` record during creation
- No other logic changes — the instant activation flow stays the same

### New component: `src/components/cfo/CFOPartnerInvestments.tsx`
CFO review panel showing all `investor_portfolios` with:
- Partner name, agent name, phone, amount
- Investment reference text
- Receipt preview/download (using StorageImage for images, link for PDFs)
- Submission date, status
- **Verify** / **Flag** actions (updates a `cfo_verified` boolean on the portfolio)
- Filter by status (all / pending verification / verified / flagged)

### `src/pages/CFODashboard.tsx`
- Add new tab: `{ id: 'investments', label: 'Investments', icon: HandCoins }`
- Render `<CFOPartnerInvestments />` in that tab

### Migration SQL
```sql
-- Add receipt tracking to investor_portfolios
ALTER TABLE investor_portfolios 
  ADD COLUMN IF NOT EXISTS investment_reference TEXT,
  ADD COLUMN IF NOT EXISTS receipt_file_url TEXT,
  ADD COLUMN IF NOT EXISTS cfo_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cfo_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cfo_verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cfo_rejection_reason TEXT;

-- Private bucket for investment receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('investment-receipts', 'investment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Agents upload to their own folder
CREATE POLICY "Agents upload investment receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'investment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Agents can view their own receipts
CREATE POLICY "Agents view own investment receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'investment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Staff can view all investment receipts
CREATE POLICY "Staff view all investment receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'investment-receipts' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('manager', 'cfo', 'coo', 'super_admin', 'cto', 'operations')
  )
);
```

## Summary

| Area | Change |
|---|---|
| Agent form | +Investment reference field, +Receipt upload (required) |
| Edge function | Accept & store `investment_reference`, `receipt_file_url` |
| Database | 6 new columns on `investor_portfolios`, new storage bucket |
| CFO Dashboard | New "Investments" tab with verify/flag workflow |

**Files:** `AgentInvestForPartnerDialog.tsx`, `agent-invest-for-partner/index.ts`, new `CFOPartnerInvestments.tsx`, `CFODashboard.tsx`, 1 migration

