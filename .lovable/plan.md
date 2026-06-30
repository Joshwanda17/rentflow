# Partner Agreement — Database-Driven Flow

## Goal
The partner supplies every contract field once, at onboarding. The admin never types partner data and never re-enters the Welile countersignature. The contract template lives server-side (never public) and is rendered by looping the database row.

## The problem today
- Onboarding collects amount, address, payout method, next-of-kin — but only address (`profiles.landmark`) and payout (`saved_payout_methods`) are persisted. Amount, next-of-kin, and **National ID** are lost (National ID isn't even collected for funders).
- The admin sign-off screen blanks those fields and forces the admin to re-type partner data, plus re-enter the rep name and re-upload the rep signature every time.

## Target flow

```text
Partner onboarding (fills once)
        │  writes
        ▼
partner_agreements  ◄── single source of truth (one row per partner)
        │
        │  admin opens read-only review → clicks "Countersign & Send"
        ▼
generate-partner-agreement (edge fn, template lives here)
   • reads partner_agreements row
   • reads company defaults (rep + signature + stamp)
   • renders contract → PDF
   • stores PDF in private partner-agreements bucket
   • emails partner a signed download link
```

## Work items

### 1. New source-of-truth table `partner_agreements`
One row per partner. Fields: partner_id (FK profiles), name/phone/email snapshot, national_id, address, partnership_amount, payout_mode + bank_*/momo_* fields, kin_name, kin_contact, reference, agreement_date, status (`pending` → `countersigned`), countersigned_by, countersigned_at, generated_pdf_path.
RLS: partner reads own row; ops/manager read+update all; service_role full. GRANTs included.

### 2. Collect + persist all partner data at onboarding
- Add a required **National ID / Passport** field to the funder onboarding step (currently missing).
- On submit, upsert the full `partner_agreements` row from what the partner typed (amount, national ID, address, payout, next-of-kin). Keep the existing `profiles`/`saved_payout_methods` writes for compatibility.

### 3. Company countersignature defaults (set once)
- New singleton table `partner_agreement_company_defaults`: rep_name, rep_position, rep_contact, signature_path (image in a private bucket). Manager-editable from a small settings panel.
- The e-stamp is generated automatically by the renderer (no upload needed).

### 4. Server-side renderer `generate-partner-agreement`
- The contract body (all numbered sections, header, signature block) moves out of the client component into this edge function — private, never in `public/`.
- Generates the PDF with `pdf-lib`, fed strictly from the `partner_agreements` row + company defaults. Applies rep details, rep signature, and stamp automatically.
- Uploads to the private `partner-agreements` bucket, stores the path on the row, returns a signed URL, and emails the partner via the existing `tenant-partnership-agreement` template.

### 5. Admin screen becomes read-only review
- `PartnerAgreementSignOff` stops editing partner data. It displays the partner's submitted fields straight from `partner_agreements` (read-only).
- Single action: **Countersign & Send** → invokes the edge function. No rep typing, no signature upload, no partner-field entry.
- Live preview stays, but is driven by the DB row, not local inputs.

## Notes / technical details
- The existing client `partnershipAgreementPdf.ts` + `AgreementHtmlPreview` are retained only for the on-screen preview; the authoritative PDF is produced server-side so the template is not publicly shippable.
- `partner-agreements` bucket is already private with authenticated RLS — reused as-is; signatures live in a separate private path.
- National ID added to onboarding is the only new partner-facing input; everything else already exists in the funder step.
- Backfill: existing partners without a `partner_agreements` row get one lazily (admin "Countersign & Send" creates it from current profile + payout data) so the dashboard keeps working for historical sign-ups.
