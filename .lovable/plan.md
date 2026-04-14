

## Redesign Promissory Note PDF Layout

### Current State
The PDF currently uses a centered purple banner header with the logo centered, company name centered, and a large title. The body mixes commitment text with investment details in various colored boxes.

### New Layout

**HEADER (left-aligned, professional letterhead style)**
```text
┌──────────────────────────────────────────────┐
│ [Logo] WELILE TECHNOLOGIES LIMITED            │
│         Plot 12, Kampala Road, Kampala, Uganda│
│         info@welile.com | +256 XXX XXX XXX   │
│         www.welile.com                        │
│──────────────────────────────────────────────│
│         INVESTMENT COMMITMENT NOTE            │
│                                    Date: ...  │
```

- Logo (left, ~14mm) with company name bold to its right
- Below company name: address line
- Below address: email | phone contacts
- Below contacts: website
- Horizontal rule (purple line)
- Centered title "INVESTMENT COMMITMENT NOTE"
- Right-aligned date

**BODY (structured partner & investment info)**

A clean labeled-field layout:

| Field | Value |
|---|---|
| Partner Name | From form |
| Contact Email | From form (or "N/A") |
| WhatsApp | From form |
| Phone | From form (or "N/A") |
| Investment Amount | Formatted UGX |
| Contribution Type | Monthly / Once-off |
| Deduction Day | (if monthly) |
| Expected Monthly Return | 15% calculation |

Then the commitment paragraph, "How it Works" steps, activation link box, disclaimer, and signature area — kept largely the same but repositioned after the structured info block.

### Changes Required

**File: `src/lib/promissoryNotePdf.ts`**

1. Update `PromissoryNoteData` interface — add `email`, `whatsappNumber`, `phoneNumber` fields
2. Rewrite header section — logo left-aligned, company details stacked to the right of logo, HR line below
3. Add structured "Partner Details" section with labeled rows for name, email, WhatsApp, phone
4. Keep investment details box, how-it-works, activation link, disclaimer, signature, and footer sections (minor y-position adjustments)

**File: `src/components/agent/PromissoryNoteDialog.tsx`**

5. Pass `email`, `whatsappNumber`, and `phoneNumber` into `generatePromissoryNotePDF()` call

### Company Details (hardcoded in PDF)
- Address: "Plot 12, Kampala Road, Kampala, Uganda" (confirm with user if different)
- Email: info@welile.com
- Phone: +256 700 000 000 (placeholder — will use what's available)
- Website: www.welile.com

