

## Promissory Note PDF Redesign

### Changes (all in `src/lib/promissoryNotePdf.ts`)

**1. Header — match reference image (image-220)**
- Update address from "Plot 12" to "Plot 24, Kampala Road, Kampala, Uganda" to match the reference image
- Format: `Email: info@welile.com | Phone: +256 700 000 000` (with labels, matching image)
- Company name uses title case "Welile Technologies Limited" (not all-caps) per reference

**2. Investment Details — tabular format (image-219)**
- Remove the green rounded-rect box entirely
- Replace with a clean borderless table layout with column headers (bold, dark navy):
  - Row separator: thin light-blue horizontal lines between rows
  - No vertical borders
  - Columns: label | value pairs rendered in a clean table grid
- Add a new **"ROI Projection (Next 6 Months)"** section below investment details showing Month 1–6 with Opening, ROI Earned (green text with +), and Closing columns

**3. Activate Account button**
- Remove the visible link text entirely (lines 210–211)
- Keep the purple button with just "ACTIVATE YOUR ACCOUNT" text
- Use the published domain (`https://welilereceipts.com`) for the internal link instead of preview URL — use `getPublicOrigin()` logic but hardcode the domain directly since this is a PDF (no `window` in generation context — actually `getPublicOrigin()` runs client-side so it works)
- Add a clickable link annotation on the button rectangle pointing to the activation URL (invisible to the reader)

**4. Footer — replace signature with generation date**
- Remove the signature area entirely (dashed lines + "Partner Signature" + "Date" labels, lines 223–234)
- Replace with a simple line: `Generated on: [full date/time]` above the purple footer bar

### Files Modified
- `src/lib/promissoryNotePdf.ts` — all changes above

